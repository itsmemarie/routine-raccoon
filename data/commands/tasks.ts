import type { LocalTask } from "@/data/db/schema";
import {
  describeTaskChange,
  importedCopy,
  movedCopy,
  movedViaSheetCopy,
  taskAddedCopy,
  taskCopiedCopy,
  taskCopyAddedCopy,
  taskDeletedCopy,
  taskDuplicatedCopy,
  taskEditedCopy,
  taskRemovedFromPlanCopy,
} from "@/domain/log";
import { exclusionsAfterMove, plansOfTask, taskPlacement } from "@/domain/organise";
import { importLogMeta, type PastedTaskDraft } from "@/domain/paste-parser";
import { compareRank } from "@/domain/rank";
import { resolveCopyTarget, sectionsOfPlan } from "@/domain/survival";
import { compareTaskIn } from "@/domain/task-order";
import { linkedCopies, linkedPatch, sameLinkedContent } from "@/domain/task-links";
import { isActive, isTaskInPlan } from "@/domain/types";
import { deleteKv, readKv } from "@/data/db/kv";
import { AppError } from "@/lib/errors/app-error";
import type { Result } from "@/lib/errors/result";
import type { CommandContext } from "./context";
import { insertSection, insertTask, otherPlansSharing, sectionContent, taskContent } from "./rows";
import { appendLog, runCommand } from "./run-command";
import {
  currentDayKey,
  indexAfter,
  linksOfSection,
  nowIso,
  placeTask,
  readOrganisation,
  requireName,
  requirePlan,
  requireSection,
  requireTask,
  sectionsInPlan,
  sectionNameOf,
  tasksInSection,
  touch,
} from "./shared";
import {
  clampText,
  LIMITS,
  normaliseEmoji,
  normaliseSteps,
  validateTaskDraft,
  type TaskDraft,
} from "./validate";

/**
 * Task commands (TECH_SPEC §2.5 "Tasks").
 * @see docs/handoff/README.md "Task copies", "Paste a list", "Drag and drop", screens 6–11
 */

/** Default first line of a new task's mantra (PRD R5). */
export const DEFAULT_MANTRA =
  "Done is better than perfect. I can feel embarrassed and still do this.";

/** Where "Also add to" puts copies: sections of the current plan and other Day Plans. */
export interface CopyTargets {
  readonly sectionIds: readonly string[];
  readonly planIds: readonly string[];
  /** "Keep them coupled": the copies share the task's edits (domain/task-links). */
  readonly coupled?: boolean;
}

/** What a copy run wrote, so the Coupling sheet can undo it. */
export interface CopyOutcome {
  /** Names of the places it was added to. */
  readonly copiedTo: string[];
  readonly copyIds: string[];
  /** Sections made because a picked plan had none. */
  readonly sectionIds: string[];
  /** Plans the task itself came back to (it had been removed from them). */
  readonly broughtBack: string[];
}

const NO_COPIES: CopyTargets = { sectionIds: [], planIds: [] };

/**
 * "Also add to": one independent copy per picked section and per picked Day Plan. In a plan the
 * copy goes to the section with the same name, else the plan's first section, else a new
 * section named after the source.
 *
 * A place already showing the task gets no second copy, which is why a plan holding a filled
 * section is skipped: sections can sit in several plans. A pick that no longer exists is
 * skipped too: sync may remove it while the form is open, its chip goes with it, and failing
 * here would leave the user unable to save. Picking a plan the task was removed from brings the
 * task itself back, no copy needed. Returns the names of the places it was added to.
 */
export async function copyTaskRows(
  ctx: CommandContext,
  source: LocalTask,
  dayKey: string,
  { sectionIds, planIds, coupled = false }: CopyTargets = NO_COPIES,
): Promise<CopyOutcome> {
  const outcome: CopyOutcome = { copiedTo: [], copyIds: [], sectionIds: [], broughtBack: [] };
  if (sectionIds.length === 0 && planIds.length === 0) return outcome;
  // A coupled copy joins the source's link, minted on first use (written below once a copy exists).
  const linkId = coupled ? (source.link_id ?? ctx.newId()) : null;
  const plans = await ctx.db.day_plans.toArray();
  const planSections = await ctx.db.plan_sections.toArray();
  const sections = await ctx.db.sections.toArray();
  const sourceSection = await requireSection(ctx, source.section_id);
  const filled = new Set([source.section_id]);
  const { copiedTo, copyIds } = outcome;

  for (const sectionId of new Set(sectionIds)) {
    const section = sections.find((s) => s.id === sectionId && isActive(s));
    if (!section || filled.has(section.id)) continue;
    const copy = await insertTask(ctx, section.id, taskContent(source), {
      freshStepIds: true,
      linkId,
    });
    copyIds.push(copy.id);
    await appendLog(ctx, taskCopyAddedCopy(copy, section.name), {
      dayKey,
      taskId: copy.id,
      sectionId: section.id,
    });
    filled.add(section.id);
    copiedTo.push(section.name);
  }

  const picked = new Set(planIds);
  const broughtBack = new Set<string>();
  for (const plan of plans.filter((p) => picked.has(p.id) && isActive(p)).sort(compareRank)) {
    const inPlan = sectionsOfPlan(plan.id, planSections, sections);
    if (!isTaskInPlan(source, plan.id) && inPlan.some((s) => s.id === source.section_id)) {
      broughtBack.add(plan.id);
      copiedTo.push(plan.name);
      continue;
    }
    if (inPlan.some((s) => filled.has(s.id))) continue;
    const target = resolveCopyTarget(sourceSection.name, plan.id, planSections, sections);
    let sectionId: string;
    if (target.kind === "create-section") {
      sectionId = (await insertSection(ctx, sectionContent(sourceSection), plan.id)).id;
      outcome.sectionIds.push(sectionId);
    } else {
      sectionId = target.sectionId;
    }
    const copy = await insertTask(
      ctx,
      sectionId,
      {
        ...taskContent(source),
        survival_level: plan.kind === "survival" ? plan.survival_level : null,
      },
      {
        freshStepIds: true,
        excludedPlanIds: await otherPlansSharing(ctx, sectionId, plan.id),
        linkId,
      },
    );
    copyIds.push(copy.id);
    await appendLog(ctx, taskCopyAddedCopy(copy, plan.name), {
      dayKey,
      taskId: copy.id,
      sectionId,
    });
    filled.add(sectionId);
    copiedTo.push(plan.name);
  }
  const joinsLink = linkId !== null && copyIds.length > 0 && source.link_id !== linkId;
  if (broughtBack.size > 0 || joinsLink) {
    await ctx.db.tasks.update(source.id, {
      ...(broughtBack.size > 0
        ? { excluded_plan_ids: source.excluded_plan_ids.filter((id) => !broughtBack.has(id)) }
        : {}),
      ...(joinsLink ? { link_id: linkId } : {}),
      ...touch(ctx),
    });
  }
  outcome.broughtBack.push(...broughtBack);
  return outcome;
}

/**
 * Writes `source`'s shared content to every copy coupled with it, in the caller's transaction.
 * Each copy keeps its own step ids by position, so its ticked steps stay its own.
 */
export async function syncLinkedCopies(ctx: CommandContext, source: LocalTask): Promise<number> {
  if (source.link_id === null) return 0;
  const members = linkedCopies(
    await ctx.db.tasks.where("link_id").equals(source.link_id).toArray(),
    source,
  );
  for (const member of members) {
    if (sameLinkedContent(member, source)) continue;
    await ctx.db.tasks.update(member.id, {
      ...linkedPatch(source, member, ctx.newId),
      ...touch(ctx),
    });
  }
  return members.length;
}

export function createTask(
  ctx: CommandContext,
  input: { draft: TaskDraft; copyTo?: CopyTargets },
): Promise<Result<{ taskId: string; sectionName: string; copiedTo: string[] }, AppError>> {
  return runCommand(ctx, "createTask", async () => {
    const section = await requireSection(ctx, input.draft.sectionId);
    const fields = validateTaskDraft(input.draft, ctx.newId);
    const task = await insertTask(ctx, section.id, { ...fields, survival_level: null });
    const dayKey = await currentDayKey(ctx);
    await appendLog(ctx, taskAddedCopy(task, section.name), {
      dayKey,
      taskId: task.id,
      sectionId: section.id,
    });
    const { copiedTo } = await copyTaskRows(ctx, task, dayKey, input.copyTo);
    return { taskId: task.id, sectionName: section.name, copiedTo };
  });
}

const FIELD_LABELS: Partial<Record<keyof LocalTask, string>> = {
  name: "Name",
  emoji: "Icon",
  hard: "Hard",
  steps: "Steps",
  mantra: "Mantra",
  notes: "Notes",
  video_url: "Video",
  location: "Location",
  recurrence: "Frequency",
  never_shrink: "Smaller version",
  smaller_versions: "Smaller version",
  section_id: "Section",
};

function changedLabels(before: LocalTask, after: Partial<LocalTask>): string[] {
  const labels = new Set<string>();
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const k = key as keyof LocalTask;
    if (k in after && JSON.stringify(before[k]) !== JSON.stringify(after[k])) labels.add(label);
  }
  return [...labels];
}

/** What `excluded_plan_ids` becomes when `task` moves to `sectionId`. */
async function exclusionsIn(ctx: CommandContext, task: LocalTask, sectionId: string) {
  const links = await linksOfSection(ctx, sectionId);
  return exclusionsAfterMove(
    task.excluded_plan_ids,
    links.map((l) => l.plan_id),
  );
}

/** Saves the task form. Moving to another section appends it there. */
export function updateTask(
  ctx: CommandContext,
  input: { taskId: string; draft: TaskDraft; copyTo?: CopyTargets },
): Promise<Result<{ copiedTo: string[] }, AppError>> {
  return runCommand(ctx, "updateTask", async () => {
    const before = await requireTask(ctx, input.taskId);
    const section = await requireSection(ctx, input.draft.sectionId);
    const fields = validateTaskDraft(input.draft, ctx.newId, before.smaller_versions);
    const patch: Partial<LocalTask> = { ...fields };
    if (section.id !== before.section_id) {
      const slot = await placeTask(ctx, section.id, { task: before });
      patch.section_id = section.id;
      patch.excluded_plan_ids = await exclusionsIn(ctx, before, section.id);
      patch.rank = slot.rank;
      patch.plan_ranks = slot.plan_ranks;
    }
    await ctx.db.tasks.update(before.id, { ...patch, ...touch(ctx) });
    const after = { ...before, ...patch };
    await syncLinkedCopies(ctx, after);
    const dayKey = await currentDayKey(ctx);
    await appendLog(
      ctx,
      taskEditedCopy(after, describeTaskChange(before, after, changedLabels(before, patch))),
      { dayKey, taskId: before.id, sectionId: section.id },
    );
    const { copiedTo } = await copyTaskRows(ctx, after, dayKey, input.copyTo);
    return { copiedTo };
  });
}

export interface TaskPatch {
  readonly name?: string;
  readonly emoji?: string;
  readonly mantra?: string;
  readonly notes?: string;
  readonly location?: string;
  readonly steps?: readonly { readonly id?: string; readonly text: string }[];
}

/** Inline edits from Task detail ("click into fields to edit them"). Logged as one edit. */
export function patchTask(
  ctx: CommandContext,
  input: { taskId: string; patch: TaskPatch },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "patchTask", async () => {
    const before = await requireTask(ctx, input.taskId);
    const p = input.patch;
    const next: Partial<LocalTask> = {};
    if (p.name !== undefined) next.name = requireName(p.name, LIMITS.name);
    if (p.emoji !== undefined) next.emoji = normaliseEmoji(p.emoji, next.name ?? before.name);
    if (p.mantra !== undefined) next.mantra = clampText(p.mantra, LIMITS.mantra);
    if (p.notes !== undefined) next.notes = clampText(p.notes, LIMITS.notes);
    if (p.location !== undefined) next.location = clampText(p.location, LIMITS.location);
    if (p.steps !== undefined) next.steps = normaliseSteps(p.steps, ctx.newId);
    const labels = changedLabels(before, next);
    if (labels.length === 0) return;
    await ctx.db.tasks.update(before.id, { ...next, ...touch(ctx) });
    await syncLinkedCopies(ctx, { ...before, ...next });
    await appendLog(ctx, taskEditedCopy({ name: next.name ?? before.name }, labels.join(", ")), {
      dayKey: await currentDayKey(ctx),
      taskId: before.id,
      sectionId: before.section_id,
    });
  });
}

/** A timer running on a task that has just been deleted would only offer a "Tick it" that fails. */
async function stopTimerFor(ctx: CommandContext, taskIds: readonly string[]): Promise<void> {
  const timer = await readKv(ctx.db, "timer");
  if (timer && taskIds.includes(timer.taskId)) await deleteKv(ctx.db, "timer");
}

/**
 * Removes the task for good from every plan it is in: its row, so every plan sharing its section
 * loses it, and its separate copies in other plans (see `copiesOfTask`). Soft delete: the
 * tombstones sync and the history stays in the Log.
 */
export function deleteTask(
  ctx: CommandContext,
  input: { taskId: string },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "deleteTask", async () => {
    const task = await requireTask(ctx, input.taskId);
    const { plans, copies } = taskPlacement(await readOrganisation(ctx), task, null);
    for (const row of [task, ...copies]) {
      await ctx.db.tasks.update(row.id, { deleted_at: nowIso(ctx), ...touch(ctx) });
    }
    await stopTimerFor(
      ctx,
      [task, ...copies].map((row) => row.id),
    );
    await appendLog(
      ctx,
      taskDeletedCopy(task, await sectionNameOf(ctx, task.section_id), plans.length),
      { dayKey: await currentDayKey(ctx), taskId: task.id, sectionId: task.section_id },
    );
  });
}

/**
 * "Only from {plan}": takes the task out of one Day Plan and leaves it in the others. Its section
 * stays shared. When this plan was the last one showing the row, the row itself is deleted;
 * copies in other plans are separate rows and stay either way.
 * @see docs/handoff/README.md "Deleting a task that's in several plans"
 */
export function removeTaskFromPlan(
  ctx: CommandContext,
  input: { taskId: string; planId: string },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "removeTaskFromPlan", async () => {
    const task = await requireTask(ctx, input.taskId);
    const plan = await requirePlan(ctx, input.planId);
    const plans = plansOfTask(await readOrganisation(ctx), task);
    if (!plans.some((p) => p.id === plan.id)) {
      throw new AppError("RR-DB-005", { context: { entity: "task_in_plan", id: task.id } });
    }
    await ctx.db.tasks.update(task.id, {
      ...(plans.length > 1
        ? { excluded_plan_ids: [...task.excluded_plan_ids, plan.id] }
        : { deleted_at: nowIso(ctx) }),
      ...touch(ctx),
    });
    if (plans.length <= 1) await stopTimerFor(ctx, [task.id]);
    await appendLog(ctx, taskRemovedFromPlanCopy(task, plan.name), {
      dayKey: await currentDayKey(ctx),
      taskId: task.id,
      sectionId: task.section_id,
    });
  });
}

/** Duplicate: "{name} copy", placed right after the original. */
export function duplicateTask(
  ctx: CommandContext,
  input: { taskId: string },
): Promise<Result<{ taskId: string }, AppError>> {
  return runCommand(ctx, "duplicateTask", async () => {
    const task = await requireTask(ctx, input.taskId);
    const name = `${task.name} copy`.slice(0, LIMITS.name);
    const copy = await insertTask(
      ctx,
      task.section_id,
      { ...taskContent(task), name },
      {
        afterTaskId: task.id,
        everywhere: true,
        freshStepIds: true,
        excludedPlanIds: task.excluded_plan_ids,
      },
    );
    await appendLog(ctx, taskDuplicatedCopy(task, await sectionNameOf(ctx, task.section_id)), {
      dayKey: await currentDayKey(ctx),
      taskId: copy.id,
      sectionId: task.section_id,
    });
    return { taskId: copy.id };
  });
}

/**
 * Copy sheet → Day Plans chip: copies the task into that plan's first section.
 * RR-VAL-006 ("{plan} has no sections yet") when the plan has none.
 */
export function copyTaskToPlan(
  ctx: CommandContext,
  input: { taskId: string; planId: string },
): Promise<Result<{ planName: string; sectionName: string }, AppError>> {
  return runCommand(ctx, "copyTaskToPlan", async () => {
    const task = await requireTask(ctx, input.taskId);
    const plan = await requirePlan(ctx, input.planId);
    const [first] = await sectionsInPlan(ctx, plan.id);
    if (!first) throw new AppError("RR-VAL-006", { params: { plan: plan.name } });
    const copy = await insertTask(ctx, first.id, taskContent(task), {
      freshStepIds: true,
      excludedPlanIds: await otherPlansSharing(ctx, first.id, plan.id),
    });
    await appendLog(ctx, taskCopiedCopy(task, plan.name, first.name), {
      dayKey: await currentDayKey(ctx),
      taskId: copy.id,
      sectionId: first.id,
    });
    return { planName: plan.name, sectionName: first.name };
  });
}

/**
 * Moves a task to `sectionId`, directly after `afterTaskId` (null = first; omitted = end).
 * `planId` is the Day Plan on screen: in a section shared with other plans, the new position is
 * that plan's only (see `placeTask`). A move within the same section is a reorder and isn't
 * logged; a move to another section logs "Moved {task}" ("…, by drag" for drag and drop).
 */
export function moveTask(
  ctx: CommandContext,
  input: {
    taskId: string;
    sectionId: string;
    afterTaskId?: string | null;
    planId?: string | null;
    via: "drag" | "sheet";
  },
): Promise<Result<{ moved: boolean }, AppError>> {
  return runCommand(ctx, "moveTask", async () => {
    const task = await requireTask(ctx, input.taskId);
    const target = await requireSection(ctx, input.sectionId);
    const changesSection = task.section_id !== target.id;
    if (!changesSection) {
      // Compare against the order the user is looking at: the plan's when the section is in it.
      const inView = (await linksOfSection(ctx, target.id)).some((l) => l.plan_id === input.planId);
      const order = compareTaskIn(inView ? input.planId : null);
      const all = (await tasksInSection(ctx, target.id)).sort(order);
      const siblings = all.filter((t) => t.id !== task.id);
      const index =
        input.afterTaskId === undefined ? siblings.length : indexAfter(siblings, input.afterTaskId);
      if (all.findIndex((t) => t.id === task.id) === index) return { moved: false };
    }
    const slot = await placeTask(ctx, target.id, {
      task,
      planId: input.planId ?? null,
      ...(input.afterTaskId === undefined ? {} : { afterTaskId: input.afterTaskId }),
    });
    await ctx.db.tasks.update(task.id, {
      section_id: target.id,
      rank: slot.rank,
      plan_ranks: slot.plan_ranks,
      ...(changesSection ? { excluded_plan_ids: await exclusionsIn(ctx, task, target.id) } : {}),
      ...touch(ctx),
    });
    if (changesSection) {
      const from = await sectionNameOf(ctx, task.section_id);
      await appendLog(
        ctx,
        input.via === "drag"
          ? movedCopy(task, from, target.name)
          : movedViaSheetCopy(task, from, target.name),
        { dayKey: await currentDayKey(ctx), taskId: task.id, sectionId: target.id },
      );
    }
    return { moved: true };
  });
}

/**
 * Inline paste import (PRD R8): creates every task with its subtasks in the form's section,
 * and writes ONE `imported` entry ("Pasted a list · 5 tasks · 3 subtasks → Morning").
 */
export function importPastedList(
  ctx: CommandContext,
  input: { sectionId: string; tasks: readonly PastedTaskDraft[] },
): Promise<Result<{ taskIds: string[]; sectionName: string }, AppError>> {
  return runCommand(ctx, "importPastedList", async () => {
    if (input.tasks.length === 0) throw new AppError("RR-IMP-001");
    if (input.tasks.length > 200) throw new AppError("RR-IMP-002");
    const section = await requireSection(ctx, input.sectionId);
    const taskIds: string[] = [];
    for (const draft of input.tasks) {
      const name = requireName(draft.name, LIMITS.name);
      const task = await insertTask(ctx, section.id, {
        name,
        emoji: normaliseEmoji(draft.emoji, name),
        minutes: Math.min(600, Math.max(1, Math.round(draft.minutes))),
        hard: false,
        never_shrink: false,
        survival_level: null,
        recurrence: null,
        mantra: "",
        notes: "",
        video_url: "",
        location: "",
        steps: normaliseSteps(
          draft.subtasks.map((text) => ({ text })),
          ctx.newId,
        ),
        smaller_versions: {},
      });
      taskIds.push(task.id);
    }
    await appendLog(ctx, importedCopy(importLogMeta(input.tasks, section.name)), {
      dayKey: await currentDayKey(ctx),
      taskId: taskIds[0] ?? null,
      sectionId: section.id,
    });
    return { taskIds, sectionName: section.name };
  });
}
