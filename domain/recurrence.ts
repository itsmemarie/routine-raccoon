import { addDays, daysBetween, daysInMonth, partsOf, weekdayOf } from "./time";
import type { DayKey, Recurrence } from "./types";

/**
 * Google-Calendar-shaped recurrence for sections and tasks.
 *
 * `n` is an interval ("every n {per}"), not a frequency. TECH_SPEC §2.2 records why: the
 * prototype's own seed reads "Every 2 weeks · Mon, Wed, Fri" and the user asked for
 * Google-Calendar repeats.
 *
 * @see docs/handoff/README.md "Recurrence JSON"
 */

export const EVERY_DAY: Recurrence = {
  kind: "every day",
  days: [0, 1, 2, 3, 4, 5, 6],
  n: 1,
  per: "day",
  ends: "never",
};

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday of the week containing `dayKey`. */
function weekStart(dayKey: DayKey): DayKey {
  return addDays(dayKey, -weekdayOf(dayKey));
}

/** Day-of-month for monthly/yearly repeats, clamped so "the 31st" falls on the last day of shorter months. */
function sameDayOfMonth(anchor: DayKey, day: DayKey): boolean {
  const a = partsOf(anchor);
  const d = partsOf(day);
  return d.day === Math.min(a.day, daysInMonth(d.year, d.month));
}

/** True when the pattern (ignoring end conditions) lands on `day`. Assumes day ≥ anchor. */
function patternHits(rec: Recurrence, day: DayKey, anchor: DayKey): boolean {
  switch (rec.kind) {
    case "every day":
      return true;
    case "every week":
      return rec.days.length > 0 && rec.days.length < 7
        ? rec.days.includes(weekdayOf(day))
        : weekdayOf(day) === weekdayOf(anchor);
    case "every month":
      return sameDayOfMonth(anchor, day);
    case "custom": {
      const n = Math.max(1, rec.n);
      switch (rec.per) {
        case "day":
          return daysBetween(anchor, day) % n === 0;
        case "week": {
          const days = rec.days.length > 0 ? rec.days : [weekdayOf(anchor)];
          const weeks = daysBetween(weekStart(anchor), weekStart(day)) / 7;
          return days.includes(weekdayOf(day)) && weeks % n === 0;
        }
        case "month": {
          const a = partsOf(anchor);
          const d = partsOf(day);
          const months = (d.year - a.year) * 12 + (d.month - a.month);
          return months % n === 0 && sameDayOfMonth(anchor, day);
        }
        case "year": {
          const a = partsOf(anchor);
          const d = partsOf(day);
          return (d.year - a.year) % n === 0 && d.month === a.month && sameDayOfMonth(anchor, day);
        }
      }
    }
  }
}

/**
 * Does this recurrence produce an occurrence on `day`?
 *
 * @param rec    null means "every day" (the default rhythm, PRD R1).
 * @param anchor The day the series starts when `rec.start` is absent (usually the created day).
 */
export function recursOn(rec: Recurrence | null, day: DayKey, anchor: DayKey): boolean {
  if (!rec) return true;
  const start = rec.start ?? anchor;
  if (daysBetween(start, day) < 0) return false;
  if (rec.ends === "date" && rec.until && daysBetween(day, rec.until) < 0) return false;
  if (!patternHits(rec, day, start)) return false;
  if (rec.ends === "count" && rec.count !== undefined) {
    // Count hits from the start up to and including `day`. Bounded: count ≤ 999 hits.
    let hits = 0;
    for (let cursor = start; daysBetween(cursor, day) >= 0; cursor = addDays(cursor, 1)) {
      if (patternHits(rec, cursor, start)) hits++;
      if (hits > rec.count) return false;
    }
  }
  return true;
}

/**
 * Human label. Non-custom → the kind text. Custom → weekday list ("Mon, Wed, Fri", or
 * "every day" when all 7), the interval ("every 2 weeks"), then "ends after N" / "until DATE",
 * joined with " · ".
 *
 * @see docs/handoff/README.md "Label rules (recLabel)" (interval wording per TECH_SPEC §2.2)
 */
export function recurrenceLabel(rec: Recurrence | null): string {
  if (!rec) return "every day";
  if (rec.kind !== "custom") return rec.kind;
  const bits: string[] = [];
  if (rec.days.length > 0) {
    const sorted = [...new Set(rec.days)].sort((a, b) => a - b);
    bits.push(sorted.length === 7 ? "every day" : sorted.map((d) => WEEKDAY_SHORT[d]).join(", "));
  }
  if (rec.n > 1) bits.push(`every ${rec.n} ${rec.per}s`);
  else if (rec.per !== "week" && !(rec.per === "day" && bits[0] === "every day")) {
    bits.push(`every ${rec.per}`);
  }
  if (rec.ends === "count" && rec.count !== undefined) bits.push(`ends after ${rec.count}`);
  if (rec.ends === "date" && rec.until) bits.push(`until ${rec.until}`);
  return bits.join(" · ") || "custom";
}

export type FrequencyKind = "every day" | "every week" | "every month" | "custom";

/** The chip a stored recurrence shows as (null = the default, every day). */
export function frequencyOf(rec: Recurrence | null): FrequencyKind {
  return rec ? rec.kind : "every day";
}

/**
 * The recurrence a frequency chip stands for. "Every day" is stored as null (the default
 * rhythm). Weekly and monthly repeats are anchored on `today`, so "every week" means "on this
 * weekday" from the day it was chosen.
 */
export function presetRecurrence(
  kind: Exclude<FrequencyKind, "custom">,
  today: DayKey,
): Recurrence | null {
  switch (kind) {
    case "every day":
      return null;
    case "every week":
      return { kind: "every week", days: [], n: 1, per: "week", ends: "never", start: today };
    case "every month":
      return { kind: "every month", days: [], n: 1, per: "month", ends: "never", start: today };
  }
}

/** Starting point for the custom sheet: the current custom rule, or weekly on today's weekday. */
export function customDraft(rec: Recurrence | null, today: DayKey): Recurrence {
  if (rec?.kind === "custom") return { ...rec, days: [...rec.days] };
  return {
    kind: "custom",
    days: [weekdayOf(today)],
    n: 1,
    per: "week",
    ends: "never",
    start: rec?.start ?? today,
  };
}
