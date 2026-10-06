import type { LocalTask } from "@/data/db/schema";
import {
  describeTaskChange,
  importedCopy,
  movedCopy,
  movedViaSheetCopy,
  taskAddedCopy,
  taskCopiedCopy,
  taskCopiedToSurvivalCopy,
  taskDeletedCopy,
  taskDuplicatedCopy,
  taskEditedCopy,
} from "@/domain/log";
import { importLogMeta, type PastedTaskDraft } from "@/domain/paste-parser";
import { compareRank } from "@/domain/rank";
import { resolveCopyTarget, survivalPlanFor } from "@/domain/survival";
import type { SurvivalLevel } from "@/domain/types";
import { AppError } from "@/lib/errors/app-error";
import type { Result } from "@/lib/errors/result";
import type { CommandContext } from "./context";
import { insertSection, insertTask, sectionContent, taskContent } from "./rows";
import { appendLog, runCommand } from "./run-command";
import {
  currentDayKey,
  indexAfter,
  placeInOrder,
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
 * @see docs/handoff/README.md "Survival copies", "Paste a list", "Drag and drop", screens 6–11
 */

/** Default first line of a new task's mantra (PRD R5). */
export const DEFAULT_MANTRA =
  "Done is better than perfect. I can feel embarrassed and still do this.";

/**
 * "Also add to {survivalName} plans": copies the task into each picked survival plan, into
 * the section with the same name, else the plan's first section, else a new section named
 * after the source. The copies are independent afterwards. Returns the plan names copied to.
 */
async function copyIntoSurvivalPlans(
  ctx: CommandContext,
  source: LocalTask,
  levels: readonly SurvivalLevel[],
  dayKey: string,
): Promise<string[]> {
  if (levels.length === 0) return [];
  const plans = await ctx.db.day_plans.toArray();
  const planSections = await ctx.db.plan_sections.toArray();
  const sections = await ctx.db.sections.toArray();
  const sourceSection = await requireSection(ctx, source.section_id);
  const copiedTo: string[] = [];
  for (const level of [...new Set(levels)].sort()) {
    const plan = survivalPlanFor(plans, level);
    if (!plan) continue;
    const target = resolveCopyTarget(sourceSection.name, plan.id, planSections, sections);
    const sectionId =
      target.kind === "create-section"
        ? (await insertSection(ctx, sectionContent(sourceSection), plan.id)).id
        : target.sectionId;
    const copy = await insertTask(
      ctx,
      sectionId,
      { ...taskContent(source), survival_level: level },
      { freshStepIds: true },
    );
    await appendLog(ctx, taskCopiedToSurvivalCopy(copy, plan.name), {
      dayKey,
      taskId: copy.id,
      sectionId,
    });
    copiedTo.push(plan.name);
  }
  return copiedTo;
}

export function createTask(
  ctx: CommandContext,
  input: { draft: TaskDraft; copyToLevels: readonly SurvivalLevel[] },
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
    const copiedTo = await copyIntoSurvivalPlans(ctx, task, input.copyToLevels, dayKey);
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

/** Saves the task form. Moving to another section appends it there. */
export function updateTask(
  ctx: CommandContext,
  input: { taskId: string; draft: TaskDraft; copyToLevels: readonly SurvivalLevel[] },
): Promise<Result<{ copiedTo: string[] }, AppError>> {
  return runCommand(ctx, "updateTask", async () => {
    const before = await requireTask(ctx, input.taskId);
    const section = await requireSection(ctx, input.draft.sectionId);
    const fields = validateTaskDraft(input.draft, ctx.newId, before.smaller_versions);
    const patch: Partial<LocalTask> = { ...fields };
    if (section.id !== before.section_id) {
      const siblings = await tasksInSection(ctx, section.id);
      patch.section_id = section.id;
      patch.rank = await placeInOrder(ctx, siblings, siblings.length, (sibling, next) =>
        ctx.db.tasks.update(sibling.id, { rank: next, ...touch(ctx) }),
      );
    }
    await ctx.db.tasks.update(before.id, { ...patch, ...touch(ctx) });
    const after = { ...before, ...patch };
    const dayKey = await currentDayKey(ctx);
    await appendLog(
      ctx,
      taskEditedCopy(after, describeTaskChange(before, after, changedLabels(before, patch))),
      { dayKey, taskId: before.id, sectionId: section.id },
    );
    const copiedTo = await copyIntoSurvivalPlans(ctx, after, input.copyToLevels, dayKey);
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
    await appendLog(ctx, taskEditedCopy({ name: next.name ?? before.name }, labels.join(", ")), {
      dayKey: await currentDayKey(ctx),
      taskId: before.id,
      sectionId: before.section_id,
    });
  });
}

/** Removes the task for good (soft delete: the tombstone syncs; history stays in the Log). */
export function deleteTask(
  ctx: CommandContext,
  input: { taskId: string },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "deleteTask", async () => {
    const task = await requireTask(ctx, input.taskId);
    await ctx.db.tasks.update(task.id, { deleted_at: ctx.now().toISOString(), ...touch(ctx) });
    await appendLog(ctx, taskDeletedCopy(task, await sectionNameOf(ctx, task.section_id)), {
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
    const siblings = await tasksInSection(ctx, task.section_id);
    const name = `${task.name} copy`.slice(0, LIMITS.name);
    const copy = await insertTask(
      ctx,
      task.section_id,
      { ...taskContent(task), name },
      { index: indexAfter(siblings, task.id), freshStepIds: true },
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
    const copy = await insertTask(ctx, first.id, taskContent(task), { freshStepIds: true });
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
 * A move within the same section is a reorder and isn't logged; a move to another section
 * logs "Moved {task}" ("…, by drag" for drag and drop).
 */
export function moveTask(
  ctx: CommandContext,
  input: {
    taskId: string;
    sectionId: string;
    afterTaskId?: string | null;
    via: "drag" | "sheet";
  },
): Promise<Result<{ moved: boolean }, AppError>> {
  return runCommand(ctx, "moveTask", async () => {
    const task = await requireTask(ctx, input.taskId);
    const target = await requireSection(ctx, input.sectionId);
    const siblings = (await tasksInSection(ctx, target.id)).filter((t) => t.id !== task.id);
    const index =
      input.afterTaskId === undefined ? siblings.length : indexAfter(siblings, input.afterTaskId);
    const changesSection = task.section_id !== target.id;
    if (!changesSection) {
      const current = [...siblings, task].sort(compareRank).findIndex((t) => t.id === task.id);
      if (current === index) return { moved: false };
    }
    const rank = await placeInOrder(ctx, siblings, index, (sibling, next) =>
      ctx.db.tasks.update(sibling.id, { rank: next, ...touch(ctx) }),
    );
    await ctx.db.tasks.update(task.id, { section_id: target.id, rank, ...touch(ctx) });
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
