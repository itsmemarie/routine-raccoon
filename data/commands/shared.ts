import type {
  LocalDayPlan,
  LocalOccurrence,
  LocalPlanSection,
  LocalSection,
  LocalTask,
} from "@/data/db/schema";
import { effectiveDayKey } from "@/domain/day";
import { occurrenceId } from "@/domain/ids";
import { dayKeyFor } from "@/domain/time";
import { compareRank, rankForPosition, type Ranked } from "@/domain/rank";
import { normalizeSettings } from "@/domain/settings";
import type { DayKey, Occurrence, Settings } from "@/domain/types";
import { AppError } from "@/lib/errors/app-error";
import type { CommandContext } from "./context";

/**
 * Helpers shared by every command. They run INSIDE a command's transaction (runCommand), so
 * reads here see the command's own earlier writes.
 */

export function nowIso(ctx: CommandContext): string {
  return ctx.now().toISOString();
}

/** Standard columns for a brand-new synced row. */
export function newRowStamp(ctx: CommandContext) {
  const at = nowIso(ctx);
  return { created_at: at, updated_at: at, deleted_at: null, _dirty: 1 as const };
}

/** Columns every local edit must set: a fresh updated_at (last write wins) and the dirty flag. */
export function touch(ctx: CommandContext) {
  return { updated_at: nowIso(ctx), _dirty: 1 as const };
}

export async function readSettings(ctx: CommandContext): Promise<Settings> {
  return normalizeSettings((await ctx.db.user_settings.get("me"))?.settings);
}

/** The day the app is showing right now (reset time and "Close the day" applied). */
export async function currentDayKey(ctx: CommandContext): Promise<DayKey> {
  const settings = await readSettings(ctx);
  const calendar = dayKeyFor(ctx.now(), settings.resetAt);
  const record = await ctx.db.day_records.get(calendar);
  return effectiveDayKey(calendar, Boolean(record?.closed_at && record.deleted_at === null));
}

function notFound(entity: string, id: string): AppError {
  return new AppError("RR-DB-005", { context: { entity, id } });
}

/** A live (not deleted) task, else RR-DB-005. Archived tasks are still returned. */
export async function requireTask(ctx: CommandContext, id: string): Promise<LocalTask> {
  const task = await ctx.db.tasks.get(id);
  if (!task || task.deleted_at !== null) throw notFound("task", id);
  return task;
}

export async function requireSection(ctx: CommandContext, id: string): Promise<LocalSection> {
  const section = await ctx.db.sections.get(id);
  if (!section || section.deleted_at !== null) throw notFound("section", id);
  return section;
}

export async function requirePlan(ctx: CommandContext, id: string): Promise<LocalDayPlan> {
  const plan = await ctx.db.day_plans.get(id);
  if (!plan || plan.deleted_at !== null) throw notFound("day_plan", id);
  return plan;
}

export async function sectionNameOf(ctx: CommandContext, sectionId: string): Promise<string> {
  return (await ctx.db.sections.get(sectionId))?.name ?? "No section";
}

/** Live plan links of a section. */
export async function linksOfSection(
  ctx: CommandContext,
  sectionId: string,
): Promise<LocalPlanSection[]> {
  return (await ctx.db.plan_sections.where("section_id").equals(sectionId).toArray()).filter(
    (link) => link.deleted_at === null,
  );
}

/** Live plan links of a plan, in plan order. */
export async function linksOfPlan(
  ctx: CommandContext,
  planId: string,
): Promise<LocalPlanSection[]> {
  return (await ctx.db.plan_sections.where("plan_id").equals(planId).toArray())
    .filter((link) => link.deleted_at === null)
    .sort(compareRank);
}

/** Live (not deleted, not archived) sections of a plan, in plan order. */
export async function sectionsInPlan(ctx: CommandContext, planId: string): Promise<LocalSection[]> {
  const links = await linksOfPlan(ctx, planId);
  const sections = await ctx.db.sections.bulkGet(links.map((l) => l.section_id));
  return sections.filter(
    (s): s is LocalSection => s !== undefined && s.deleted_at === null && s.archived_at === null,
  );
}

/** Live tasks of a section in display order (archived included: they keep their slot). */
export async function tasksInSection(ctx: CommandContext, sectionId: string): Promise<LocalTask[]> {
  return (await ctx.db.tasks.where("section_id").equals(sectionId).toArray())
    .filter((t) => t.deleted_at === null)
    .sort(compareRank);
}

/**
 * Today's occurrence for a task, looked up by (task_id, day_key) rather than by id: rows from
 * the retired app carry random ids, and the compound key is what both databases enforce.
 */
export async function findOccurrence(
  ctx: CommandContext,
  taskId: string,
  dayKey: DayKey,
): Promise<LocalOccurrence | undefined> {
  return ctx.db.task_occurrences.where("[task_id+day_key]").equals([taskId, dayKey]).first();
}

/** Upserts the task's occurrence for the day with `patch` applied; returns the written row. */
export async function writeOccurrence(
  ctx: CommandContext,
  taskId: string,
  dayKey: DayKey,
  patch: Partial<Occurrence>,
): Promise<LocalOccurrence> {
  const existing = await findOccurrence(ctx, taskId, dayKey);
  const at = nowIso(ctx);
  const row: LocalOccurrence = {
    id: existing?.id ?? occurrenceId(taskId, dayKey),
    task_id: taskId,
    day_key: dayKey,
    status: "pending",
    completed_at: null,
    checked_step_ids: [],
    minutes_credited: null,
    survival_level_at_completion: null,
    carried_from_day_key: null,
    created_at: at,
    ...existing,
    deleted_at: null,
    ...patch,
    updated_at: at,
    _dirty: 1,
  };
  await ctx.db.task_occurrences.put(row);
  return row;
}

/**
 * Writes `rank` for an item placed at `index` among `siblings` (sorted, excluding the item).
 * When the neighbours' keys collide, the siblings are renumbered too, each as a dirty edit.
 */
export async function placeInOrder<T extends Ranked & { _dirty: 0 | 1 }>(
  ctx: CommandContext,
  siblings: readonly T[],
  index: number,
  writeSibling: (sibling: T, rank: string) => Promise<unknown>,
): Promise<string> {
  const { rank, siblingRanks } = rankForPosition(siblings, index);
  if (siblingRanks) {
    for (const [i, sibling] of siblings.entries()) {
      const next = siblingRanks[i];
      if (next !== undefined && next !== sibling.rank) await writeSibling(sibling, next);
    }
  }
  return rank;
}

/** Index to insert at so the item lands directly after `afterId` (null → first). */
export function indexAfter(siblings: readonly { id?: string }[], afterId: string | null): number {
  if (afterId === null) return 0;
  const at = siblings.findIndex((s) => s.id === afterId);
  return at === -1 ? siblings.length : at + 1;
}

/** Trims a user-entered name; RR-VAL-001 when nothing is left. */
export function requireName(value: string, max = 80): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length === 0) throw new AppError("RR-VAL-001");
  return name.slice(0, max);
}
