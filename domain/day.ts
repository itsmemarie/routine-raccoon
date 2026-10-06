import { addDays, daysBetween } from "./time";
import { buildToday, type DayInput } from "./today";
import type { DayKey, DayRecord, Settings } from "./types";

/**
 * Day lifecycle rules (TECH_SPEC §2.4, handoff "Regeneration").
 *
 * The calendar day comes from the clock (`dayKeyFor(now, resetAt)`). "Close the day" starts the
 * next day early (PRD R19 "Manual reset today"): once the calendar day's record is closed, the
 * app shows the following day. It never runs more than one day ahead of the clock.
 */
export function effectiveDayKey(calendarDayKey: DayKey, calendarDayClosed: boolean): DayKey {
  return calendarDayClosed ? addDays(calendarDayKey, 1) : calendarDayKey;
}

/**
 * Tasks to carry from `previous` into `next` when "Roll unfinished tasks over" is on: every
 * task that was open (not done, not skipped) at the end of the previous day and isn't already
 * scheduled on the next day. Returns task ids in display order.
 *
 * @see docs/handoff/README.md "Regeneration (at resetAt)"
 */
export function carryOverTaskIds(previous: DayInput, next: DayInput): string[] {
  const before = buildToday({ ...previous, filter: "all" });
  const after = buildToday({ ...next, filter: "all" });
  const alreadyScheduled = new Set(after.sections.flatMap((s) => s.tasks.map((t) => t.task.id)));
  return before.sections
    .flatMap((s) => s.tasks)
    .filter((t) => !t.done && !alreadyScheduled.has(t.task.id))
    .map((t) => t.task.id);
}

/**
 * The record a new day starts with. Survival Mode carries over only when the user asked for
 * it ("Keep Survival Mode on after the day resets"); the picked plan always returns to primary.
 * Returns null when the new day needs no record (the default: primary plan, Survival off).
 */
export function nextDayRecordPatch(
  previous: Pick<DayRecord, "survival_on" | "survival_level"> | null,
  settings: Pick<Settings, "keepSurvivalOvernight">,
): Pick<DayRecord, "survival_on" | "survival_level" | "plan_id"> | null {
  if (!previous?.survival_on || !settings.keepSurvivalOvernight) return null;
  return { survival_on: true, survival_level: previous.survival_level, plan_id: null };
}

/** True when `to` is a later day than `from` (rollover only ever moves forward). */
export function isLaterDay(from: DayKey, to: DayKey): boolean {
  return daysBetween(from, to) > 0;
}
