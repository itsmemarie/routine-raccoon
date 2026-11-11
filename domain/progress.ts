import { addDays, daysBetween, daysInMonth, partsOf, weekdayOf } from "./time";
import { buildToday, createdDayOf, type DayInput } from "./today";
import {
  isLive,
  type DayKey,
  type DayRecord,
  type Occurrence,
  type Section,
  type Settings,
  type Task,
} from "./types";

/**
 * Progress, "kept not scored" (PRD R13): no points, no streaks.
 * - Past days are rebuilt from today's definitions, so an open task only counts on a day if it
 *   and its plan link already existed that day (the day it was added counts). Ticks always count.
 * - A day is CLEARED when every task its plan scheduled was ticked (skipped tasks excluded).
 * - Showed up = cleared days in either mode. Full days = cleared without Survival Mode, unless
 *   "A Survival Mode Day counts as a full day" is on (open decision Q2, default off).
 * - "Avoiding this" lists tasks not done for 4+ days running. A day adds to a run only if the task
 *   counted on that day's plan and wasn't ticked. A tick on any plan ends the run. Other days are
 *   neutral, including days the app wasn't used at all: they neither extend nor break a run.
 *
 * @see docs/handoff/README.md screen 17
 */

export const AVOIDED_THRESHOLD = 4;
/** How far back "days running" looks. */
export const LOOKBACK_DAYS = 60;

export type DayState = "future" | "today" | "full" | "survival" | "partial" | "empty";

export interface CalendarCell {
  readonly dayKey: DayKey;
  readonly day: number;
  readonly state: DayState;
  readonly ticked: number;
  readonly total: number;
}

export interface HabitRow {
  readonly task: Task;
  readonly done: number;
  readonly scheduled: number;
}

export interface SectionTime {
  readonly section: Section;
  readonly minutes: number;
}

export interface AvoidedRow {
  readonly task: Task;
  readonly run: number;
}

export interface ProgressView {
  readonly monthLabel: string;
  /** Empty cells before the 1st so the grid starts on Monday. */
  readonly leadingBlanks: number;
  readonly cells: readonly CalendarCell[];
  readonly tickedThisMonth: number;
  readonly showedUp: number;
  readonly fullDays: number;
  readonly survivalDays: number;
  readonly habits: readonly HabitRow[];
  readonly timeBySection: readonly SectionTime[];
  readonly avoided: readonly AvoidedRow[];
}

export interface ProgressInput {
  /** Any day in the month to show. */
  readonly month: DayKey;
  /** The app's current day; later days are "future". */
  readonly today: DayKey;
  readonly definitions: Pick<DayInput, "plans" | "planSections" | "sections" | "tasks">;
  /** Occurrences from at least LOOKBACK_DAYS before `today` through the end of the month. */
  readonly occurrences: readonly Occurrence[];
  readonly dayRecords: readonly DayRecord[];
  readonly settings: Settings;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type TaskStatus = "done" | "skipped" | "open";

export interface DayFacts {
  readonly ticked: number;
  readonly total: number;
  readonly survivalOn: boolean;
  /** Status of every task that counts on that day's plan. */
  readonly status: ReadonlyMap<string, TaskStatus>;
  /** Every task ticked that day, on any plan. */
  readonly doneTaskIds: ReadonlySet<string>;
  /** The user did something that day (ticked or skipped anything). */
  readonly active: boolean;
}

function groupByDay<T extends { day_key: DayKey }>(rows: readonly T[]): Map<DayKey, T[]> {
  const map = new Map<DayKey, T[]>();
  for (const row of rows) {
    const list = map.get(row.day_key);
    if (list) list.push(row);
    else map.set(row.day_key, [row]);
  }
  return map;
}

function factsFor(
  dayKey: DayKey,
  input: ProgressInput,
  occurrencesByDay: Map<DayKey, Occurrence[]>,
  recordsByDay: Map<DayKey, DayRecord[]>,
): DayFacts {
  const occurrences = (occurrencesByDay.get(dayKey) ?? []).filter(isLive);
  const record = (recordsByDay.get(dayKey) ?? []).find(isLive) ?? null;
  // A deleted task keeps the ticks it earned: on a day it was ticked, it still counts.
  const tickedIds = new Set(occurrences.filter((o) => o.status === "done").map((o) => o.task_id));
  const view = buildToday({
    ...input.definitions,
    tasks: input.definitions.tasks.map((t) =>
      t.deleted_at !== null && tickedIds.has(t.id) ? { ...t, deleted_at: null } : t,
    ),
    dayKey,
    occurrences,
    dayRecord: record,
    settings: input.settings,
    filter: "all",
  });
  const { resetAt } = input.settings;
  const existed = (row: { created_at: string }) =>
    daysBetween(createdDayOf(row, resetAt), dayKey) >= 0;
  const linkExisted = (sectionId: string) =>
    input.definitions.planSections.some(
      (link) =>
        link.plan_id === view.activePlan?.id &&
        link.section_id === sectionId &&
        isLive(link) &&
        existed(link),
    );
  const status = new Map<string, TaskStatus>();
  let ticked = 0;
  let total = 0;
  for (const section of view.sections) {
    const linked = linkExisted(section.section.id);
    for (const item of section.tasks) {
      if (!item.done && !(linked && existed(item.task))) continue;
      total++;
      if (item.done) ticked++;
      status.set(item.task.id, item.done ? "done" : "open");
    }
    for (const item of section.skipped) status.set(item.task.id, "skipped");
  }
  return {
    ticked,
    total,
    survivalOn: view.survivalOn,
    status,
    doneTaskIds: new Set(occurrences.filter((o) => o.status === "done").map((o) => o.task_id)),
    active: occurrences.some((o) => o.status === "done" || o.status === "skipped"),
  };
}

/** Days running a task wasn't done, ending today. See the module comment for the rules. */
export function skipRun(
  taskId: string,
  today: DayKey,
  factsOf: (dayKey: DayKey) => DayFacts,
): number {
  let run = 0;
  const todays = factsOf(today);
  if (todays.doneTaskIds.has(taskId)) return 0;
  if (todays.status.get(taskId) === "skipped") run++;
  for (let i = 1; i <= LOOKBACK_DAYS; i++) {
    const facts = factsOf(addDays(today, -i));
    if (!facts.active) continue;
    if (facts.doneTaskIds.has(taskId)) break;
    if (facts.status.has(taskId)) run++;
  }
  return run;
}

/** Memoised per-day facts for a progress input. */
export function dayFactsReader(input: ProgressInput): (dayKey: DayKey) => DayFacts {
  const occurrencesByDay = groupByDay(input.occurrences);
  const recordsByDay = groupByDay(input.dayRecords);
  const cache = new Map<DayKey, DayFacts>();
  return (dayKey) => {
    const hit = cache.get(dayKey);
    if (hit) return hit;
    const facts = factsFor(dayKey, input, occurrencesByDay, recordsByDay);
    cache.set(dayKey, facts);
    return facts;
  };
}

export function buildProgress(input: ProgressInput): ProgressView {
  const factsOf = dayFactsReader(input);
  const { year, month } = partsOf(input.month);
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const length = daysInMonth(year, month);

  const cells: CalendarCell[] = [];
  const habitMap = new Map<string, { done: number; scheduled: number }>();
  let showedUp = 0;
  let fullDays = 0;
  let survivalDays = 0;
  let tickedThisMonth = 0;

  for (let day = 1; day <= length; day++) {
    const dayKey = addDays(first, day - 1);
    const offset = daysBetween(input.today, dayKey);
    if (offset > 0) {
      cells.push({ dayKey, day, state: "future", ticked: 0, total: 0 });
      continue;
    }
    const facts = factsOf(dayKey);
    tickedThisMonth += facts.ticked;
    for (const [taskId, status] of facts.status) {
      if (status === "skipped") continue;
      const habit = habitMap.get(taskId) ?? { done: 0, scheduled: 0 };
      habit.scheduled++;
      if (status === "done") habit.done++;
      habitMap.set(taskId, habit);
    }
    const cleared = facts.total > 0 && facts.ticked === facts.total;
    let state: DayState;
    if (cleared) {
      showedUp++;
      if (facts.survivalOn) survivalDays++;
      if (!facts.survivalOn || input.settings.survivalCountsAsFullDay) fullDays++;
      state = facts.survivalOn ? "survival" : "full";
    } else if (offset === 0) {
      state = "today";
    } else {
      state = facts.ticked > 0 ? "partial" : "empty";
    }
    cells.push({ dayKey, day, state, ticked: facts.ticked, total: facts.total });
  }

  const tasksById = new Map(input.definitions.tasks.map((t) => [t.id, t]));
  const sectionsById = new Map(input.definitions.sections.map((s) => [s.id, s]));
  const nameKey = (name: string) => name.trim().toLowerCase();
  // Copies (Separate, Copy to Day Plan, Also add to) are the same habit in another plan. They ran
  // on different days, so one row with their counts added is the honest picture.
  const habitRows = new Map<string, HabitRow>();
  for (const [taskId, counts] of habitMap) {
    const task = tasksById.get(taskId);
    if (!task) continue;
    // Coupled copies are one habit by their link, wherever they sit.
    const key =
      task.link_id !== null
        ? `link:${task.link_id}`
        : `${nameKey(task.name)}|${nameKey(sectionsById.get(task.section_id)?.name ?? "")}`;
    const seen = habitRows.get(key);
    if (!seen) habitRows.set(key, { task, ...counts });
    else {
      const lead = counts.done > seen.done ? task : seen.task;
      habitRows.set(key, {
        task: lead,
        done: seen.done + counts.done,
        scheduled: seen.scheduled + counts.scheduled,
      });
    }
  }
  const habits = [...habitRows.values()].sort(
    (a, b) =>
      b.done - a.done || b.scheduled - a.scheduled || a.task.name.localeCompare(b.task.name),
  );

  const minutesBySection = new Map<string, number>();
  const monthEnd = addDays(first, length - 1);
  for (const o of input.occurrences) {
    if (!isLive(o) || o.status !== "done") continue;
    if (daysBetween(first, o.day_key) < 0 || daysBetween(o.day_key, monthEnd) < 0) continue;
    const task = tasksById.get(o.task_id);
    if (!task) continue;
    minutesBySection.set(
      task.section_id,
      (minutesBySection.get(task.section_id) ?? 0) + (o.minutes_credited ?? task.minutes),
    );
  }
  const timeRows = new Map<string, SectionTime>();
  for (const [sectionId, minutes] of minutesBySection) {
    const section = sectionsById.get(sectionId);
    if (!section || !isLive(section)) continue;
    const seen = timeRows.get(nameKey(section.name));
    timeRows.set(nameKey(section.name), {
      section: seen && seen.minutes >= minutes ? seen.section : section,
      minutes: (seen?.minutes ?? 0) + minutes,
    });
  }
  const timeBySection = [...timeRows.values()].sort((a, b) => b.minutes - a.minutes);

  const avoided = input.definitions.tasks
    .filter((t) => isLive(t) && t.archived_at === null)
    .map((task) => ({ task, run: skipRun(task.id, input.today, factsOf) }))
    .filter((row) => row.run >= AVOIDED_THRESHOLD)
    .sort((a, b) => b.run - a.run);

  return {
    monthLabel: `${MONTHS[month - 1] ?? ""} ${year}`,
    leadingBlanks: weekdayOf(first),
    cells,
    tickedThisMonth,
    showedUp,
    fullDays,
    survivalDays,
    habits,
    timeBySection,
    avoided,
  };
}

/** The first day of the month containing `dayKey`. */
export function monthStart(dayKey: DayKey): DayKey {
  const { year, month } = partsOf(dayKey);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** The first day of the next (delta = 1) or previous (delta = -1) month. */
export function shiftMonth(dayKey: DayKey, delta: number): DayKey {
  const { year, month } = partsOf(dayKey);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

/** "Skipped" info row on Task detail: "Yesterday" / "5 days running", or null. */
export function skipRunLabel(run: number): string | null {
  if (run <= 0) return null;
  return run === 1 ? "1 day" : `${run} days running`;
}
