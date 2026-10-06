import type { LocalSection } from "@/data/db/schema";
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
} from "@/domain/log";
import { recurrenceLabel } from "@/domain/recurrence";
import { primaryPlan } from "@/domain/survival";
import type { Recurrence } from "@/domain/types";
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
  placeInOrder,
  requireName,
  requirePlan,
  requireSection,
  touch,
} from "./shared";
import {
  clampText,
  LIMITS,
  requireMinutes,
  requireRecurrence,
  requireTimeOrNull,
} from "./validate";

/**
 * Section commands (TECH_SPEC §2.5 "Sections"). A section can sit in several Day Plans through
 * `plan_sections` (open decision Q1 → "link": edit once, it changes everywhere).
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
    await copySectionTasks(ctx, section.id, copy.id);
    await appendLog(ctx, sectionDuplicatedCopy(section.name, plan.name), {
      dayKey: await currentDayKey(ctx),
      sectionId: copy.id,
    });
    return { sectionId: copy.id };
  });
}

/** "Copy to Day Plan": links the same section into another plan (Q1 = link). */
export function linkSectionToPlan(
  ctx: CommandContext,
  input: { sectionId: string; planId: string },
): Promise<Result<{ planName: string; alreadyThere: boolean }, AppError>> {
  return runCommand(ctx, "linkSectionToPlan", async () => {
    const section = await requireSection(ctx, input.sectionId);
    const plan = await requirePlan(ctx, input.planId);
    const existing = await ctx.db.plan_sections.get([plan.id, section.id]);
    if (existing && existing.deleted_at === null)
      return { planName: plan.name, alreadyThere: true };
    await linkSection(ctx, plan.id, section.id);
    await appendLog(ctx, sectionCopiedCopy(section.name, plan.name), {
      dayKey: await currentDayKey(ctx),
      sectionId: section.id,
    });
    return { planName: plan.name, alreadyThere: false };
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
