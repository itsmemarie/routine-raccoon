import { displayMinutes, formatDuration, isShrunk } from "./duration";
import { compareRank } from "./rank";
import { recursOn, recurrenceLabel } from "./recurrence";
import { primaryPlan, sectionsOfPlan, survivalPlanFor, SURVIVAL_LEVELS } from "./survival";
import { localDayKey } from "./time";
import {
  isActive,
  isLive,
  type DayKey,
  type DayPlan,
  type DayRecord,
  type Occurrence,
  type PlanSection,
  type Section,
  type Settings,
  type Step,
  type SurvivalLevel,
  type Task,
} from "./types";

/**
 * The Today selector: turns stored definitions + today's occurrences into exactly what the
 * Today screen renders. Pure and synchronous; recomputed on every relevant change.
 *
 * @see docs/handoff/README.md "Which tasks show on Today", "Today's plan picker"
 */

export type TodayFilter = "all" | "hard" | "under5" | "under15" | "extra";

export const FILTER_LABELS: Record<Exclude<TodayFilter, "extra">, string> = {
  all: "All",
  hard: "Hard",
  under5: "Under 5m",
  under15: "Under 15m",
};

export interface TodayInput {
  readonly dayKey: DayKey;
  readonly plans: readonly DayPlan[];
  readonly planSections: readonly PlanSection[];
  readonly sections: readonly Section[];
  readonly tasks: readonly Task[];
  /** Occurrences for `dayKey` only. */
  readonly occurrences: readonly Occurrence[];
  readonly dayRecord: DayRecord | null;
  readonly settings: Settings;
  readonly filter: TodayFilter;
}

/** Everything the day selectors need for one day, minus the UI filter. */
export type DayInput = Omit<TodayInput, "filter">;

export interface TodayTask {
  readonly task: Task;
  readonly sectionName: string;
  /** Minutes shown and counted (smaller version in Survival Mode). */
  readonly minutes: number;
  readonly fullMinutes: number;
  readonly shrunk: boolean;
  readonly done: boolean;
  /** Carried over from an earlier day (setting "Roll unfinished tasks over"). */
  readonly carried: boolean;
  readonly showHardBadge: boolean;
  readonly showSurvivalBadge: boolean;
  /** Up to two bits joined with " · ": `from yesterday`, `was Xm`, `{n} steps`, frequency. */
  readonly meta: string;
  /** Steps not ticked yet today, in order (Extra Support shows these on the card). */
  readonly openSteps: readonly Step[];
}

export interface TodaySection {
  readonly section: Section;
  /** Visible tasks after the filter, ticked ones included (the UI animates them out). */
  readonly tasks: readonly TodayTask[];
  readonly remainingMinutes: number;
  /** Copy for a section with no tasks today, otherwise null. */
  readonly emptyText: string | null;
}

export interface TodayView {
  readonly dayKey: DayKey;
  readonly activePlan: DayPlan | null;
  /** The non-survival plan the day is based on (shown as "from {basePlan}" in Survival Mode). */
  readonly basePlan: DayPlan | null;
  readonly survivalOn: boolean;
  readonly level: SurvivalLevel;
  readonly sections: readonly TodaySection[];
  readonly remainingCount: number;
  readonly remainingMinutes: number;
  readonly headline: readonly [string, string];
  readonly planCard: { readonly overline: string; readonly title: string; readonly meta: string };
  readonly extraSupportCount: number;
  readonly filter: TodayFilter;
  /** Open tasks in the active plan ignoring the filter (drives "go to Day complete"). */
  readonly planOpenCount: number;
  /** Tasks done today in the active plan. */
  readonly doneCount: number;
}

/** Anchor for recurrence intervals: the local day the row was created. */
export function anchorOf(row: { created_at: string }): DayKey {
  const created = new Date(row.created_at);
  return Number.isNaN(created.getTime()) ? "1970-01-01" : localDayKey(created);
}

function matchesFilter(filter: TodayFilter, task: Task, minutes: number, longAt: number): boolean {
  switch (filter) {
    case "all":
      return true;
    case "hard":
      return task.hard;
    case "under5":
      return minutes <= 5;
    case "under15":
      return minutes <= 15;
    case "extra":
      return isExtraSupport(task, minutes, longAt);
  }
}

/** Extra Support = hard tasks plus tasks at or over `longAt` minutes. Badge and filter share it. */
export function isExtraSupport(task: Pick<Task, "hard">, minutes: number, longAt: number): boolean {
  return task.hard || minutes >= longAt;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function cardMeta(task: Task, minutes: number, shrunk: boolean, carried: boolean): string {
  const bits: string[] = [];
  if (carried) bits.push("From yesterday");
  if (shrunk && minutes !== task.minutes) bits.push(`was ${task.minutes}m`);
  if (task.steps.length > 0)
    bits.push(`${task.steps.length} ${task.steps.length === 1 ? "step" : "steps"}`);
  if (task.recurrence) bits.push(capitalise(recurrenceLabel(task.recurrence)));
  return bits.slice(0, 2).join(" · ");
}

/**
 * Empty-section copy in Survival Mode: "Nothing here on a bad day", never "…bad day day".
 * @see docs/handoff/README.md "Sections" (empty section)
 */
export function survivalEmptyText(levelPlanName: string): string {
  const name = levelPlanName.trim().toLowerCase();
  return /\bday$/.test(name) ? `Nothing here on a ${name}` : `Nothing here on a ${name} day`;
}

interface PlanTaskRow {
  readonly section: Section;
  readonly task: Task;
  readonly minutes: number;
  readonly shrunk: boolean;
  readonly status: Occurrence["status"];
  readonly carried: boolean;
  readonly checked: ReadonlySet<string>;
}

type ScheduleInput = Pick<
  TodayInput,
  "dayKey" | "planSections" | "sections" | "tasks" | "occurrences"
>;

/**
 * Every task of a plan scheduled on `dayKey`, in plan + section order, with today's status.
 * A task is scheduled when its section and the task itself recur that day, or when a live
 * occurrence carried it over from an earlier day.
 */
export function planTasksFor(
  plan: DayPlan,
  input: ScheduleInput,
  survivalOn: boolean,
): { section: Section; rows: PlanTaskRow[] }[] {
  const occurrenceByTask = new Map<string, Occurrence>();
  for (const o of input.occurrences) {
    if (isLive(o) && o.day_key === input.dayKey) occurrenceByTask.set(o.task_id, o);
  }
  const isCarried = (taskId: string) =>
    (occurrenceByTask.get(taskId)?.carried_from_day_key ?? null) !== null;

  return sectionsOfPlan(plan.id, input.planSections, input.sections).flatMap((section) => {
    const sectionTasks = input.tasks.filter((t) => t.section_id === section.id && isActive(t));
    const sectionRecurs = recursOn(section.recurrence, input.dayKey, anchorOf(section));
    const scheduled = sectionTasks.filter(
      (t) =>
        isCarried(t.id) || (sectionRecurs && recursOn(t.recurrence, input.dayKey, anchorOf(t))),
    );
    if (!sectionRecurs && scheduled.length === 0) return [];
    return [
      {
        section,
        rows: [...scheduled].sort(compareRank).map((task) => {
          const occurrence = occurrenceByTask.get(task.id);
          return {
            section,
            task,
            minutes: displayMinutes(task, survivalOn),
            shrunk: isShrunk(task, survivalOn),
            status: occurrence?.status ?? "pending",
            carried: isCarried(task.id),
            checked: new Set(occurrence?.checked_step_ids ?? []),
          };
        }),
      },
    ];
  });
}

/** Count and duration of a plan's open tasks today, for the plan card and the plan sheet. */
export function planSummary(
  plan: DayPlan,
  input: ScheduleInput,
  shrink: boolean,
): { count: number; minutes: number } {
  let count = 0;
  let minutes = 0;
  for (const { rows } of planTasksFor(plan, input, shrink)) {
    for (const row of rows) {
      if (row.status !== "pending") continue;
      count++;
      minutes += row.minutes;
    }
  }
  return { count, minutes };
}

function taskCount(n: number): string {
  return `${n} ${n === 1 ? "task" : "tasks"}`;
}

/** Which plan a day uses: the picked non-survival plan (or primary), or the survival level's plan. */
export function resolveDayPlans(
  plans: readonly DayPlan[],
  dayRecord: DayRecord | null,
  settings: Settings,
): {
  basePlan: DayPlan | null;
  activePlan: DayPlan | null;
  survivalOn: boolean;
  level: SurvivalLevel;
} {
  const primary = primaryPlan(plans);
  const picked = dayRecord?.plan_id
    ? plans.find((p) => p.id === dayRecord.plan_id && p.kind !== "survival" && isActive(p))
    : undefined;
  const basePlan = picked ?? primary;
  const survivalOn = dayRecord?.survival_on ?? false;
  const level = dayRecord?.survival_level ?? settings.defaultLevel;
  const activePlan = survivalOn ? survivalPlanFor(plans, level) : basePlan;
  return { basePlan, activePlan, survivalOn, level };
}

export function buildToday(input: TodayInput): TodayView {
  const { settings, filter } = input;
  const { basePlan, activePlan, survivalOn, level } = resolveDayPlans(
    input.plans,
    input.dayRecord,
    settings,
  );

  const grouped = activePlan ? planTasksFor(activePlan, input, survivalOn) : [];

  let remainingCount = 0;
  let remainingMinutes = 0;
  let planOpenCount = 0;
  let planOpenMinutes = 0;
  let extraSupportCount = 0;
  let doneCount = 0;

  const sections: TodaySection[] = grouped.map(({ section, rows }) => {
    const open = rows.filter((r) => r.status !== "skipped");
    const visible = open.filter((r) => matchesFilter(filter, r.task, r.minutes, settings.longAt));
    let sectionRemaining = 0;
    for (const r of open) {
      if (r.status === "done") {
        doneCount++;
        continue;
      }
      planOpenCount++;
      planOpenMinutes += r.minutes;
      if (isExtraSupport(r.task, r.minutes, settings.longAt)) extraSupportCount++;
    }
    for (const r of visible) {
      if (r.status === "done") continue;
      remainingCount++;
      remainingMinutes += r.minutes;
      sectionRemaining += r.minutes;
    }
    return {
      section,
      remainingMinutes: sectionRemaining,
      emptyText:
        rows.length > 0
          ? null
          : survivalOn
            ? survivalEmptyText(activePlan?.name ?? "")
            : "Empty — drag a task in",
      tasks: visible.map((r) => ({
        task: r.task,
        sectionName: section.name,
        minutes: r.minutes,
        fullMinutes: r.task.minutes,
        shrunk: r.shrunk,
        done: r.status === "done",
        carried: r.carried,
        showHardBadge: r.task.hard && !survivalOn,
        showSurvivalBadge: r.shrunk,
        meta: cardMeta(r.task, r.minutes, r.shrunk, r.carried),
        openSteps: r.task.steps.filter((s) => !r.checked.has(s.id)),
      })),
    };
  });

  const headline: readonly [string, string] =
    remainingCount > 0
      ? [`${taskCount(remainingCount)} left,`, `about ${formatDuration(remainingMinutes)}.`]
      : ["All clear,", "nothing left today."];

  const planMeta = `${taskCount(planOpenCount)} · ${formatDuration(planOpenMinutes)}`;
  const planCard = survivalOn
    ? {
        overline: `${settings.survivalName} Day`,
        title: activePlan?.name ?? "No plan for this level yet",
        meta: basePlan ? `${planMeta} · from ${basePlan.name}` : planMeta,
      }
    : { overline: "Today's plan", title: activePlan?.name ?? "No Day Plan yet", meta: planMeta };

  return {
    dayKey: input.dayKey,
    activePlan,
    basePlan,
    survivalOn,
    level,
    sections,
    remainingCount,
    remainingMinutes,
    headline,
    planCard,
    extraSupportCount,
    filter,
    planOpenCount,
    doneCount,
  };
}

export interface PlanOption {
  readonly plan: DayPlan;
  readonly count: number;
  readonly minutes: number;
  readonly level: SurvivalLevel | null;
}

/**
 * Rows for the Today's plan sheet: regular Day Plans with full durations, then each survival
 * level with the count and SHRUNK duration of its own plan.
 */
export function buildPlanOptions(
  input: Pick<
    TodayInput,
    "dayKey" | "plans" | "planSections" | "sections" | "tasks" | "occurrences"
  >,
): { dayPlans: PlanOption[]; survival: PlanOption[] } {
  const dayPlans = input.plans
    .filter((p) => p.kind !== "survival" && isActive(p))
    .sort(compareRank)
    .map((plan) => ({ plan, level: null, ...planSummary(plan, input, false) }));
  const survival = SURVIVAL_LEVELS.flatMap((level) => {
    const plan = survivalPlanFor(input.plans, level);
    return plan ? [{ plan, level, ...planSummary(plan, input, true) }] : [];
  });
  return { dayPlans, survival };
}

export interface DaySummary {
  /** Tasks ticked today in the active plan. */
  readonly ticked: number;
  /** Tasks the active plan scheduled today (ticked + open; skipped excluded). */
  readonly total: number;
  /** Minutes credited for today's ticks. */
  readonly minutes: number;
  /** Hard tasks ticked today. */
  readonly hard: number;
  readonly survivalOn: boolean;
}

/**
 * Counters for Day complete and the `closed` log entry ("{ticked} of {total} ticked").
 * @see docs/handoff/README.md "Tick, undo, day complete" and screen 20
 */
export function summariseDay(
  input: Omit<TodayInput, "filter">,
  occurrences: readonly Occurrence[] = input.occurrences,
): DaySummary {
  const view = buildToday({ ...input, filter: "all" });
  const credited = new Map(
    occurrences
      .filter((o) => isLive(o) && o.status === "done")
      .map((o) => [o.task_id, o.minutes_credited] as const),
  );
  let ticked = 0;
  let total = 0;
  let minutes = 0;
  let hard = 0;
  for (const section of view.sections) {
    for (const item of section.tasks) {
      total++;
      if (!item.done) continue;
      ticked++;
      minutes += credited.get(item.task.id) ?? item.minutes;
      if (item.task.hard) hard++;
    }
  }
  return { ticked, total, minutes, hard, survivalOn: view.survivalOn };
}
