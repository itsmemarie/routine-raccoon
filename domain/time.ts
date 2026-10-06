import type { DayKey, HHMM } from "./types";

/**
 * Calendar math for the logical day. All functions are pure: the caller passes `now`.
 *
 * Day keys are calendar dates with no time zone. Arithmetic on them goes through UTC so a DST
 * change can never add or drop a day. Converting an instant to a day key uses the device's
 * wall clock, which is what the user sees.
 */

const WEEKDAYS_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_SHORT = MONTHS_LONG.map((m) => m.slice(0, 3));

const pad = (n: number) => String(n).padStart(2, "0");

/** "07:30" → 450. Returns null for anything that is not a valid 24h HH:MM. */
export function parseHHMM(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatHHMM(minutesSinceMidnight: number): HHMM {
  const m = ((minutesSinceMidnight % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "14:05" → "2:05 PM" (the handoff shows the reset time in 12h). */
export function formatHHMM12(value: HHMM): string {
  const minutes = parseHHMM(value) ?? 0;
  const h24 = Math.floor(minutes / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad(minutes % 60)} ${h24 < 12 ? "AM" : "PM"}`;
}

/** The local calendar date of an instant. */
export function localDayKey(instant: Date): DayKey {
  return `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`;
}

/**
 * The logical day an instant belongs to: the local date of (now − resetAt).
 * With a 02:00 reset, 01:30 on 9 Sep belongs to 8 Sep.
 *
 * @see docs/handoff/README.md "day_key"
 */
export function dayKeyFor(now: Date, resetAt: HHMM): DayKey {
  const reset = parseHHMM(resetAt) ?? 0;
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const today = localDayKey(now);
  return minutesNow < reset ? addDays(today, -1) : today;
}

/**
 * The next instant at which dayKeyFor() changes, i.e. the next local wall-clock `resetAt`.
 * Used to schedule rollover while the app stays open.
 */
export function nextResetAt(now: Date, resetAt: HHMM): Date {
  const reset = parseHHMM(resetAt) ?? 0;
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, reset, 0, 0);
  if (candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 1);
  return candidate;
}

function toUtc(dayKey: DayKey): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

function fromUtc(date: Date): DayKey {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(dayKey: DayKey, days: number): DayKey {
  const date = toUtc(dayKey);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** 0 = Monday … 6 = Sunday (the handoff's recurrence convention). */
export function weekdayOf(dayKey: DayKey): number {
  return (toUtc(dayKey).getUTCDay() + 6) % 7;
}

export function partsOf(dayKey: DayKey): { year: number; month: number; day: number } {
  const date = toUtc(dayKey);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "Tuesday 8 September": the Today header date. */
export function formatDayHeading(dayKey: DayKey): string {
  const { month, day } = partsOf(dayKey);
  return `${WEEKDAYS_LONG[weekdayOf(dayKey)]} ${day} ${MONTHS_LONG[month - 1]}`;
}

/** "Tue 8 Sep" */
export function formatDayShort(dayKey: DayKey): string {
  const { month, day } = partsOf(dayKey);
  return `${WEEKDAYS_SHORT[weekdayOf(dayKey)]} ${day} ${MONTHS_SHORT[month - 1]}`;
}

/** Log group headings: "Today · Tue 8 Sep", "Yesterday · Mon 7 Sep", else "Sun 6 Sep". */
export function formatLogDay(dayKey: DayKey, today: DayKey): string {
  const offset = daysBetween(dayKey, today);
  if (offset === 0) return `Today · ${formatDayShort(dayKey)}`;
  if (offset === 1) return `Yesterday · ${formatDayShort(dayKey)}`;
  return formatDayShort(dayKey);
}

export interface Clock12 {
  readonly hour: number;
  readonly minute: number;
  readonly period: "AM" | "PM";
}

/** "14:05" → { hour: 2, minute: 5, period: "PM" } (the reset-time wheel works in 12h). */
export function toClock12(value: HHMM): Clock12 {
  const minutes = parseHHMM(value) ?? 0;
  const h24 = Math.floor(minutes / 60);
  return {
    hour: h24 % 12 === 0 ? 12 : h24 % 12,
    minute: minutes % 60,
    period: h24 < 12 ? "AM" : "PM",
  };
}

/** { hour: 12, minute: 0, period: "AM" } → "00:00". */
export function fromClock12(clock: Clock12): HHMM {
  const hour = Math.min(12, Math.max(1, Math.round(clock.hour)));
  const minute = Math.min(59, Math.max(0, Math.round(clock.minute)));
  const h24 = (hour % 12) + (clock.period === "PM" ? 12 : 0);
  return formatHHMM(h24 * 60 + minute);
}

/** "just now" / "5 min ago" / "3 h ago" / "yesterday" / "4 days ago" (Account: last backup). */
export function formatRelative(fromIso: string, now: Date): string {
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) return "a while ago";
  const minutes = Math.floor((now.getTime() - from) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
