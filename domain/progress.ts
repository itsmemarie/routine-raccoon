import { addDays, daysBetween, daysInMonth, partsOf, weekdayOf } from "./time";
import { buildToday, type DayInput } from "./today";
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
 * - A day is CLEARED when every task its plan scheduled was ticked (skipped tasks excluded).
 * - Showed up = cleared days in either mode. Full days = cleared without Survival Mode, unless
 *   "A Survival Mode Day counts as a full day" is on (open decision Q2, default off).
 * - "Avoiding this" lists tasks not done for 4+ scheduled days running. Days the app wasn't
 *   used at all are neutral: they neither extend nor break a run.
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
  /** Status of every task scheduled that day. */
  readonly status: ReadonlyMap<string, TaskStatus>;
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
  const view = buildToday({
    ...input.definitions,
    dayKey,
    occurrences,
    dayRecord: record,
    settings: input.settings,
    filter: "all",
  });
  const status = new Map<string, TaskStatus>();
  let ticked = 0;
  let total = 0;
  for (const section of view.sections) {
    for (const item of section.tasks) {
      total++;
      if (item.done) ticked++;
      status.set(item.task.id, item.done ? "done" : "open");
    }
  }
  for (const o of occurrences) {
    if (o.status === "skipped") status.set(o.task_id, "skipped");
  }
  return {
    ticked,
    total,
    survivalOn: view.survivalOn,
    status,
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
  const todays = factsOf(today).status.get(taskId);
  if (todays === "done") return 0;
  if (todays === "skipped") run++;
  for (let i = 1; i <= LOOKBACK_DAYS; i++) {
    const facts = factsOf(addDays(today, -i));
    if (!facts.active) continue;
    const status = facts.status.get(taskId);
    if (status === undefined) continue;
    if (status === "done") break;
    run++;
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
  const habits = [...habitMap.entries()]
    .flatMap(([taskId, counts]) => {
      const task = tasksById.get(taskId);
      return task ? [{ task, ...counts }] : [];
    })
    .sort(
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
  const sectionsById = new Map(input.definitions.sections.map((s) => [s.id, s]));
  const timeBySection = [...minutesBySection.entries()]
    .flatMap(([sectionId, minutes]) => {
      const section = sectionsById.get(sectionId);
      return section && isLive(section) ? [{ section, minutes }] : [];
    })
    .sort((a, b) => b.minutes - a.minutes);

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
