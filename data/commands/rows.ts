import type { LocalSection, LocalTask } from "@/data/db/schema";
import type { Section, Task } from "@/domain/types";
import type { CommandContext } from "./context";
import { linksOfPlan, newRowStamp, placeInOrder, tasksInSection, touch } from "./shared";

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
 * Inserts a task into `sectionId` at `index` (default: end). Step ids are re-minted for copies
 * so ticking a step on one copy never ticks it on another.
 */
export async function insertTask(
  ctx: CommandContext,
  sectionId: string,
  content: ReturnType<typeof taskContent>,
  options: { index?: number; freshStepIds?: boolean } = {},
): Promise<LocalTask> {
  const siblings = await tasksInSection(ctx, sectionId);
  const rank = await placeInOrder(
    ctx,
    siblings,
    options.index ?? siblings.length,
    (sibling, next) => ctx.db.tasks.update(sibling.id, { rank: next, ...touch(ctx) }),
  );
  const row: LocalTask = {
    id: ctx.newId(),
    section_id: sectionId,
    rank,
    ...content,
    steps: options.freshStepIds
      ? content.steps.map((s) => ({ id: ctx.newId(), text: s.text }))
      : content.steps,
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

/** Copies every live task of `fromSectionId` into `toSectionId`, keeping order. */
export async function copySectionTasks(
  ctx: CommandContext,
  fromSectionId: string,
  toSectionId: string,
): Promise<number> {
  const tasks = (await tasksInSection(ctx, fromSectionId)).filter((t) => t.archived_at === null);
  for (const task of tasks) {
    await insertTask(ctx, toSectionId, taskContent(task), { freshStepIds: true });
  }
  return tasks.length;
}
