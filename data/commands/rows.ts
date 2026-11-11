import type { LocalSection, LocalTask } from "@/data/db/schema";
import { compareTaskIn } from "@/domain/task-order";
import { isTaskInPlan, type Section, type Task } from "@/domain/types";
import type { CommandContext } from "./context";
import {
  linksOfPlan,
  linksOfSection,
  newRowStamp,
  placeInOrder,
  placeTask,
  tasksInSection,
  touch,
} from "./shared";

/**
 * Row builders shared by task, section and plan commands. Each runs inside the caller's
 * transaction and never logs: the calling command writes the one log entry for the action.
 */

/** Appends a link from a plan to a section (end of the plan). No-op when already linked. */
export async function linkSection(
  ctx: CommandContext,
  planId: string,
  sectionId: string,
  index?: number,
): Promise<void> {
  const existing = await ctx.db.plan_sections.get([planId, sectionId]);
  if (existing && existing.deleted_at === null) return;
  const siblings = await linksOfPlan(ctx, planId);
  const rank = await placeInOrder(ctx, siblings, index ?? siblings.length, (link, next) =>
    ctx.db.plan_sections.update([link.plan_id, link.section_id], { rank: next, ...touch(ctx) }),
  );
  // A tombstoned link is revived in place: (plan_id, section_id) is the primary key everywhere.
  await ctx.db.plan_sections.put({
    plan_id: planId,
    section_id: sectionId,
    rank,
    ...newRowStamp(ctx),
    ...(existing ? { created_at: existing.created_at } : {}),
  });
}

/** Soft-deletes a plan→section link. */
export async function unlinkSection(
  ctx: CommandContext,
  planId: string,
  sectionId: string,
): Promise<void> {
  const existing = await ctx.db.plan_sections.get([planId, sectionId]);
  if (!existing || existing.deleted_at !== null) return;
  await ctx.db.plan_sections.update([planId, sectionId], {
    deleted_at: ctx.now().toISOString(),
    ...touch(ctx),
  });
}

/** Creates a section and links it at the end of `planId`. */
export async function insertSection(
  ctx: CommandContext,
  fields: Omit<Section, "id" | "created_at" | "updated_at" | "deleted_at" | "archived_at">,
  planId: string,
): Promise<LocalSection> {
  const row: LocalSection = {
    id: ctx.newId(),
    ...fields,
    archived_at: null,
    ...newRowStamp(ctx),
  };
  await ctx.db.sections.add(row);
  await linkSection(ctx, planId, row.id);
  return row;
}

/**
 * The other Day Plans that share `sectionId` with `planId`. A copy made for one plan, in a
 * section several plans show, must leave these out or it would appear in all of them.
 */
export async function otherPlansSharing(
  ctx: CommandContext,
  sectionId: string,
  planId: string,
): Promise<string[]> {
  return (await linksOfSection(ctx, sectionId)).map((l) => l.plan_id).filter((id) => id !== planId);
}

/** Content columns copied when a task is duplicated or copied elsewhere. */
export function taskContent(task: Task) {
  return {
    name: task.name,
    emoji: task.emoji,
    minutes: task.minutes,
    hard: task.hard,
    never_shrink: task.never_shrink,
    survival_level: task.survival_level,
    recurrence: task.recurrence,
    mantra: task.mantra,
    notes: task.notes,
    video_url: task.video_url,
    location: task.location,
    steps: task.steps.map((s) => ({ ...s })),
    smaller_versions: { ...task.smaller_versions },
  };
}

/**
 * Inserts a task into `sectionId` (default: at the end; see `placeTask` for `afterTaskId`,
 * `everywhere` and `planId`). Step ids are re-minted for copies so ticking a step on one copy
 * never ticks it on another.
 */
export async function insertTask(
  ctx: CommandContext,
  sectionId: string,
  content: ReturnType<typeof taskContent>,
  options: {
    afterTaskId?: string;
    everywhere?: boolean;
    planId?: string;
    freshStepIds?: boolean;
    excludedPlanIds?: readonly string[];
    /** Couples the new row to its source (domain/task-links). Copies are independent without it. */
    linkId?: string | null;
  } = {},
): Promise<LocalTask> {
  const slot = await placeTask(ctx, sectionId, {
    ...(options.afterTaskId === undefined ? {} : { afterTaskId: options.afterTaskId }),
    ...(options.everywhere ? { everywhere: true } : {}),
    ...(options.planId === undefined ? {} : { planId: options.planId }),
  });
  const row: LocalTask = {
    id: ctx.newId(),
    section_id: sectionId,
    rank: slot.rank,
    plan_ranks: slot.plan_ranks,
    ...content,
    steps: options.freshStepIds
      ? content.steps.map((s) => ({ id: ctx.newId(), text: s.text }))
      : content.steps,
    excluded_plan_ids: [...(options.excludedPlanIds ?? [])],
    link_id: options.linkId ?? null,
    archived_at: null,
    ...newRowStamp(ctx),
  };
  await ctx.db.tasks.add(row);
  return row;
}

/** Copies a section's definition (not its links) for duplicate/copy flows. */
export function sectionContent(section: Section) {
  return {
    name: section.name,
    description: section.description,
    color: section.color,
    start_time: section.start_time,
    recurrence: section.recurrence,
    notify_on_start: section.notify_on_start,
    notify_before_close: section.notify_before_close,
    closing_lead_minutes: section.closing_lead_minutes,
    length_override_minutes: section.length_override_minutes,
  };
}

/**
 * Copies every live task of `fromSectionId` into `toSectionId`, keeping order. With `planId`,
 * copies the section as that plan shows it: in its order, and without the tasks removed from it.
 */
export async function copySectionTasks(
  ctx: CommandContext,
  fromSectionId: string,
  toSectionId: string,
  planId?: string,
): Promise<{ original: LocalTask; copy: LocalTask }[]> {
  const tasks = (await tasksInSection(ctx, fromSectionId))
    .filter((t) => t.archived_at === null && (planId === undefined || isTaskInPlan(t, planId)))
    .sort(compareTaskIn(planId));
  const pairs: { original: LocalTask; copy: LocalTask }[] = [];
  for (const original of tasks) {
    const copy = await insertTask(ctx, toSectionId, taskContent(original), { freshStepIds: true });
    pairs.push({ original, copy });
  }
  return pairs;
}
