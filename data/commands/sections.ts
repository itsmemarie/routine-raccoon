import type { LocalSection, LocalTask } from "@/data/db/schema";
import {
  sectionAddedCopy,
  sectionArchivedCopy,
  sectionCopiedCopy,
  sectionDeletedCopy,
  sectionDuplicatedCopy,
  sectionEditedCopy,
  sectionMovedCopy,
  sectionRemovedFromPlanCopy,
  sectionRestoredCopy,
  sectionSeparatedCopy,
} from "@/domain/log";
import { recurrenceLabel } from "@/domain/recurrence";
import { pickedPlanFromLog } from "@/domain/plan-picks";
import { readKv, writeKv } from "@/data/db/kv";
import { primaryPlan, primaryPlanOn } from "@/domain/survival";
import { resolveDayPlans } from "@/domain/today";
import { isLive, type DayKey, type Recurrence } from "@/domain/types";
import { AppError } from "@/lib/errors/app-error";
import type { Result } from "@/lib/errors/result";
import type { CommandContext } from "./context";
import {
  copySectionTasks,
  insertSection,
  linkSection,
  sectionContent,
  unlinkSection,
} from "./rows";
import { appendLog, runCommand } from "./run-command";
import {
  currentDayKey,
  indexAfter,
  linksOfPlan,
  linksOfSection,
  nowIso,
  placeInOrder,
  readSettings,
  tasksInSection,
  requireName,
  requirePlan,
  requireSection,
  touch,
  writeOccurrence,
} from "./shared";
import {
  clampText,
  LIMITS,
  requireMinutes,
  requireRecurrence,
  requireTimeOrNull,
} from "./validate";

/**
 * Section commands (TECH_SPEC §2.5 "Sections"). Each Day Plan owns its sections, so a task added
 * in one plan stays there. A section sits in several plans (`plan_sections`) only when the user
 * asks for that with "Also in" on the section form (decision Q1).
 * @see docs/handoff/README.md "Sections", screens 5, 12–14
 */

/** The user-assignable palette (handoff "Section colour palette"). */
export const SECTION_COLORS = [
  "oklch(.70 .15 65)",
  "#E5134A",
  "oklch(.62 .13 300)",
  "oklch(.66 .12 235)",
  "oklch(.62 .12 150)",
] as const;

export interface SectionDraft {
  readonly name: string;
  readonly description: string;
  readonly color: string;
  readonly startTime: string | null;
  readonly recurrence: Recurrence | null;
  /** Fixed length in minutes, or null for "the sum of its tasks". */
  readonly lengthOverride: number | null;
  readonly notifyOnStart: boolean;
  readonly notifyBeforeClose: boolean;
  readonly closingLeadMinutes: number;
  /** Every Day Plan the section should be in (at least one). */
  readonly planIds: readonly string[];
}

function validateSectionDraft(draft: SectionDraft) {
  const color = draft.color.trim();
  return {
    name: requireName(draft.name, LIMITS.name),
    description: clampText(draft.description, LIMITS.description),
    color: color.length > 0 && color.length <= 40 ? color : SECTION_COLORS[0],
    start_time: requireTimeOrNull(draft.startTime),
    recurrence: requireRecurrence(draft.recurrence),
    length_override_minutes:
      draft.lengthOverride === null ? null : requireMinutes(draft.lengthOverride),
    notify_on_start: draft.notifyOnStart,
    notify_before_close: draft.notifyBeforeClose,
    closing_lead_minutes: Math.min(240, Math.max(0, Math.round(draft.closingLeadMinutes))),
  };
}

async function livePlans(ctx: CommandContext, ids: readonly string[]) {
  const plans = [];
  for (const id of [...new Set(ids)]) plans.push(await requirePlan(ctx, id));
  return plans;
}

export function createSection(
  ctx: CommandContext,
  input: { draft: SectionDraft },
): Promise<Result<{ sectionId: string; name: string }, AppError>> {
  return runCommand(ctx, "createSection", async () => {
    const fields = validateSectionDraft(input.draft);
    const plans = await livePlans(ctx, input.draft.planIds);
    const [home, ...others] = plans;
    if (!home) throw new AppError("RR-VAL-007");
    const section = await insertSection(ctx, fields, home.id);
    for (const plan of others) await linkSection(ctx, plan.id, section.id);
    await appendLog(
      ctx,
      sectionAddedCopy(
        section.name,
        plans.map((p) => p.name).join(", "),
        section.start_time,
        recurrenceLabel(section.recurrence),
      ),
      { dayKey: await currentDayKey(ctx), sectionId: section.id },
    );
    return { sectionId: section.id, name: section.name };
  });
}

export function updateSection(
  ctx: CommandContext,
  input: { sectionId: string; draft: SectionDraft },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "updateSection", async () => {
    const section = await requireSection(ctx, input.sectionId);
    const fields = validateSectionDraft(input.draft);
    await ctx.db.sections.update(section.id, { ...fields, ...touch(ctx) });
    const wanted = new Set((await livePlans(ctx, input.draft.planIds)).map((p) => p.id));
    if (wanted.size > 0) {
      const current = await linksOfSection(ctx, section.id);
      for (const id of wanted) await linkSection(ctx, id, section.id);
      for (const link of current) {
        if (!wanted.has(link.plan_id)) await unlinkSection(ctx, link.plan_id, section.id);
      }
    }
    await appendLog(
      ctx,
      sectionEditedCopy(fields.name, fields.start_time, recurrenceLabel(fields.recurrence)),
      { dayKey: await currentDayKey(ctx), sectionId: section.id },
    );
  });
}

/** Duplicate: "{name} copy" with copies of its tasks, placed after the original in `planId`. */
export function duplicateSection(
  ctx: CommandContext,
  input: { sectionId: string; planId: string },
): Promise<Result<{ sectionId: string }, AppError>> {
  return runCommand(ctx, "duplicateSection", async () => {
    const section = await requireSection(ctx, input.sectionId);
    const plan = await requirePlan(ctx, input.planId);
    const copy = await insertSection(
      ctx,
      { ...sectionContent(section), name: `${section.name} copy`.slice(0, LIMITS.name) },
      plan.id,
    );
    // insertSection appended the link; move it to sit right after the original. Re-read the
    // links: appending may have renumbered them.
    const others = (await linksOfPlan(ctx, plan.id)).filter((l) => l.section_id !== copy.id);
    const rank = await placeInOrder(
      ctx,
      others.map((l) => ({ ...l, id: l.section_id })),
      indexAfter(
        others.map((l) => ({ id: l.section_id })),
        section.id,
      ),
      (link, next) =>
        ctx.db.plan_sections.update([link.plan_id, link.section_id], { rank: next, ...touch(ctx) }),
    );
    await ctx.db.plan_sections.update([plan.id, copy.id], { rank, ...touch(ctx) });
    await copySectionTasks(ctx, section.id, copy.id, plan.id);
    await appendLog(ctx, sectionDuplicatedCopy(section.name, plan.name), {
      dayKey: await currentDayKey(ctx),
      sectionId: copy.id,
    });
    return { sectionId: copy.id };
  });
}

/**
 * "Copy to Day Plan": an independent copy of the section in `planId`, with its tasks as
 * `fromPlanId` shows them.
 */
export function copySectionToPlan(
  ctx: CommandContext,
  input: { sectionId: string; fromPlanId: string; planId: string },
): Promise<Result<{ planName: string; alreadyThere: boolean }, AppError>> {
  return runCommand(ctx, "copySectionToPlan", async () => {
    const section = await requireSection(ctx, input.sectionId);
    const plan = await requirePlan(ctx, input.planId);
    const existing = await ctx.db.plan_sections.get([plan.id, section.id]);
    if (existing && existing.deleted_at === null)
      return { planName: plan.name, alreadyThere: true };
    const copy = await insertSection(ctx, sectionContent(section), plan.id);
    await copySectionTasks(ctx, section.id, copy.id, input.fromPlanId);
    await appendLog(ctx, sectionCopiedCopy(section.name, plan.name), {
      dayKey: await currentDayKey(ctx),
      sectionId: copy.id,
    });
    return { planName: plan.name, alreadyThere: false };
  });
}

/**
 * Which Day Plan ran on a day, worked out the way Today and Progress work it out.
 *
 * A pick made on another device hasn't reached this one (`day_records.plan_id` is device-only for
 * now), so those days would read as the primary plan and Separate would leave their history on the
 * originals. The Log syncs and names every pick, so the missing plans are filled in from it first.
 * That is what the device that made the pick already holds, and Progress then reads the same.
 */
async function planRunningOn(ctx: CommandContext): Promise<(dayKey: DayKey) => string | null> {
  const [plans, records, settings, log] = await Promise.all([
    ctx.db.day_plans.toArray(),
    ctx.db.day_records.toArray(),
    readSettings(ctx),
    ctx.db.log_entries.where("kind").equals("survival").toArray(),
  ]);
  const byDay = new Map(records.filter(isLive).map((record) => [record.day_key, record]));
  for (const record of byDay.values()) {
    if (record.plan_id || record.survival_on) continue;
    const picked = pickedPlanFromLog(
      log,
      plans,
      record.day_key,
      primaryPlanOn(plans, record.day_key, settings.primaryHistory),
    );
    if (!picked) continue;
    // Local-only column: no `touch`, so nothing is queued to sync.
    await ctx.db.day_records.update(record.day_key, { plan_id: picked.id });
    byDay.set(record.day_key, { ...record, plan_id: picked.id });
  }
  return (dayKey) =>
    resolveDayPlans(plans, byDay.get(dayKey) ?? null, settings, dayKey).activePlan?.id ?? null;
}

/**
 * Hands the copies the history of every day `planId` ran: ticks, skips and carry-overs, step ticks
 * included. Progress rebuilds a past day from the tasks its plan holds now, so history left on the
 * originals would read as a day nothing happened. Days another plan ran stay with the originals.
 */
async function moveHistory(
  ctx: CommandContext,
  pairs: readonly { original: LocalTask; copy: LocalTask }[],
  planId: string,
): Promise<void> {
  const planOn = await planRunningOn(ctx);
  for (const { original, copy } of pairs) {
    const stepIds = new Map(original.steps.map((step, i) => [step.id, copy.steps[i]?.id]));
    const occurrences = await ctx.db.task_occurrences
      .where("task_id")
      .equals(original.id)
      .toArray();
    for (const occurrence of occurrences) {
      if (occurrence.deleted_at !== null || planOn(occurrence.day_key) !== planId) continue;
      await writeOccurrence(ctx, copy.id, occurrence.day_key, {
        status: occurrence.status,
        completed_at: occurrence.completed_at,
        minutes_credited: occurrence.minutes_credited,
        survival_level_at_completion: occurrence.survival_level_at_completion,
        carried_from_day_key: occurrence.carried_from_day_key,
        checked_step_ids: occurrence.checked_step_ids.flatMap((id) => stepIds.get(id) ?? []),
      });
      await ctx.db.task_occurrences.update(occurrence.id, {
        deleted_at: nowIso(ctx),
        ...touch(ctx),
      });
    }
  }
}

/**
 * "Separate from other Day Plans": swaps a shared section for an independent copy in `planId`, in
 * the same position. The copies take over the days that plan ran and the other plans keep the
 * days they ran, so Today and Progress read the same before and after and nothing counts twice.
 */
export function separateSectionInPlan(
  ctx: CommandContext,
  input: { sectionId: string; planId: string },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "separateSectionInPlan", async () => {
    const section = await requireSection(ctx, input.sectionId);
    const plan = await requirePlan(ctx, input.planId);
    const links = await linksOfSection(ctx, section.id);
    if (!links.some((l) => l.plan_id === plan.id)) {
      throw new AppError("RR-DB-005", { context: { entity: "plan_section" } });
    }
    if (links.length < 2) return;
    const copy = await insertSection(ctx, sectionContent(section), plan.id);
    // insertSection appended the link and may have renumbered the others: read the slot now.
    const slot = await ctx.db.plan_sections.get([plan.id, section.id]);
    if (slot) {
      await ctx.db.plan_sections.update([plan.id, copy.id], {
        rank: slot.rank,
        created_at: slot.created_at,
        ...touch(ctx),
      });
    }
    await unlinkSection(ctx, plan.id, section.id);
    const pairs = await copySectionTasks(ctx, section.id, copy.id, plan.id);
    // A copy is the same routine, so it keeps the original's dates, plan link included: recurrence
    // counts from them, and Progress only counts an open task on days it and its link existed.
    await ctx.db.sections.update(copy.id, { created_at: section.created_at });
    for (const pair of pairs) {
      await ctx.db.tasks.update(pair.copy.id, { created_at: pair.original.created_at });
    }
    await moveHistory(ctx, pairs, plan.id);
    // A running timer follows its task to the copy this plan now shows, or "Tick it" would tick a
    // row nothing displays.
    const timer = await readKv(ctx.db, "timer");
    const moved = pairs.find((pair) => pair.original.id === timer?.taskId);
    if (timer && moved) await writeKv(ctx.db, "timer", { ...timer, taskId: moved.copy.id });
    await appendLog(ctx, sectionSeparatedCopy(section.name, plan.name), {
      dayKey: await currentDayKey(ctx),
      sectionId: copy.id,
    });
  });
}

/** "Move to Day Plan": leaves `fromPlanId`, joins `toPlanId` with its tasks and settings. */
export function moveSectionToPlan(
  ctx: CommandContext,
  input: { sectionId: string; fromPlanId: string; toPlanId: string },
): Promise<Result<{ planName: string }, AppError>> {
  return runCommand(ctx, "moveSectionToPlan", async () => {
    const section = await requireSection(ctx, input.sectionId);
    const target = await requirePlan(ctx, input.toPlanId);
    if (input.fromPlanId === target.id) return { planName: target.name };
    await linkSection(ctx, target.id, section.id);
    await unlinkSection(ctx, input.fromPlanId, section.id);
    // A task removed from the plan the section leaves stays removed in the plan it joins.
    for (const task of await tasksInSection(ctx, section.id)) {
      if (!task.excluded_plan_ids.includes(input.fromPlanId)) continue;
      await ctx.db.tasks.update(task.id, {
        excluded_plan_ids: [
          ...task.excluded_plan_ids.filter((id) => id !== input.fromPlanId && id !== target.id),
          target.id,
        ],
        ...touch(ctx),
      });
    }
    await appendLog(ctx, sectionMovedCopy(section.name, target.name), {
      dayKey: await currentDayKey(ctx),
      sectionId: section.id,
    });
    return { planName: target.name };
  });
}

/**
 * Takes a linked section out of one Day Plan only. RR-VAL-007 when it is the section's last
 * plan: then it must be archived or deleted instead.
 */
export function removeSectionFromPlan(
  ctx: CommandContext,
  input: { sectionId: string; planId: string },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "removeSectionFromPlan", async () => {
    const section = await requireSection(ctx, input.sectionId);
    const plan = await requirePlan(ctx, input.planId);
    const links = await linksOfSection(ctx, section.id);
    if (links.filter((l) => l.plan_id !== plan.id).length === 0) {
      throw new AppError("RR-VAL-007");
    }
    await unlinkSection(ctx, plan.id, section.id);
    await appendLog(ctx, sectionRemovedFromPlanCopy(section.name, plan.name), {
      dayKey: await currentDayKey(ctx),
      sectionId: section.id,
    });
  });
}

/** Reorders a section within one plan: right after `afterSectionId` (null = first). */
export function reorderSection(
  ctx: CommandContext,
  input: { planId: string; sectionId: string; afterSectionId: string | null },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "reorderSection", async () => {
    const links = await linksOfPlan(ctx, input.planId);
    const self = links.find((l) => l.section_id === input.sectionId);
    if (!self) throw new AppError("RR-DB-005", { context: { entity: "plan_section" } });
    const others = links
      .filter((l) => l.section_id !== input.sectionId)
      .map((l) => ({ ...l, id: l.section_id }));
    const rank = await placeInOrder(
      ctx,
      others,
      indexAfter(others, input.afterSectionId),
      (link, next) =>
        ctx.db.plan_sections.update([link.plan_id, link.section_id], { rank: next, ...touch(ctx) }),
    );
    if (rank !== self.rank) {
      await ctx.db.plan_sections.update([input.planId, input.sectionId], { rank, ...touch(ctx) });
    }
  });
}

/** Archive: leaves Today but keeps its tasks and history; restorable from Archive. */
export function archiveSection(
  ctx: CommandContext,
  input: { sectionId: string },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "archiveSection", async () => {
    const section = await requireSection(ctx, input.sectionId);
    await ctx.db.sections.update(section.id, {
      archived_at: ctx.now().toISOString(),
      ...touch(ctx),
    });
    await appendLog(ctx, sectionArchivedCopy(section.name), {
      dayKey: await currentDayKey(ctx),
      sectionId: section.id,
    });
  });
}

/** Restore from Archive. A section left in no Day Plan goes back into the primary one. */
export function restoreSection(
  ctx: CommandContext,
  input: { sectionId: string },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "restoreSection", async () => {
    const section = await requireSection(ctx, input.sectionId);
    await ctx.db.sections.update(section.id, { archived_at: null, ...touch(ctx) });
    const links = await linksOfSection(ctx, section.id);
    const plans = await ctx.db.day_plans.toArray();
    const liveLinked = links.filter((l) =>
      plans.some((p) => p.id === l.plan_id && p.deleted_at === null),
    );
    const primary = primaryPlan(plans);
    if (liveLinked.length === 0 && primary) await linkSection(ctx, primary.id, section.id);
    await appendLog(ctx, sectionRestoredCopy(section.name), {
      dayKey: await currentDayKey(ctx),
      sectionId: section.id,
    });
  });
}

/** Soft-deletes the section in every plan together with its tasks (history stays in the Log). */
export async function deleteSectionRows(ctx: CommandContext, section: LocalSection) {
  const at = ctx.now().toISOString();
  await ctx.db.sections.update(section.id, { deleted_at: at, ...touch(ctx) });
  const tasks = await ctx.db.tasks.where("section_id").equals(section.id).toArray();
  for (const task of tasks) {
    if (task.deleted_at === null) {
      await ctx.db.tasks.update(task.id, { deleted_at: at, ...touch(ctx) });
    }
  }
  for (const link of await linksOfSection(ctx, section.id)) {
    await unlinkSection(ctx, link.plan_id, section.id);
  }
}

export function deleteSection(
  ctx: CommandContext,
  input: { sectionId: string },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "deleteSection", async () => {
    const section = await requireSection(ctx, input.sectionId);
    await deleteSectionRows(ctx, section);
    await appendLog(ctx, sectionDeletedCopy(section.name), {
      dayKey: await currentDayKey(ctx),
      sectionId: section.id,
    });
  });
}
