import { z } from "zod";
import { DayKeySchema, IsoDateTimeSchema } from "./schemas";

/**
 * The single task timer (PRD R10, handoff "Timer"). Stored as an absolute end time so it keeps
 * counting while the app is closed or in the background: the remaining time is always derived
 * from the clock, never decremented.
 */
export const TimerStateSchema = z.object({
  taskId: z.string().min(1),
  /** Name at start, so the bar still reads right if the task is renamed or removed. */
  taskName: z.string(),
  emoji: z.string(),
  dayKey: DayKeySchema,
  minutes: z.number().int().min(1).max(600),
  startedAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  /** Set once the expiry nudge has been shown, so it shows once. */
  alerted: z.boolean(),
});

export type TimerState = z.infer<typeof TimerStateSchema>;

export function timerEndsAt(start: Date, minutes: number): Date {
  return new Date(start.getTime() + minutes * 60_000);
}

export function timerRemainingMs(state: Pick<TimerState, "endsAt">, now: Date): number {
  const ends = new Date(state.endsAt).getTime();
  return Number.isNaN(ends) ? 0 : Math.max(0, ends - now.getTime());
}

export function isTimerExpired(state: Pick<TimerState, "endsAt">, now: Date): boolean {
  return timerRemainingMs(state, now) === 0;
}

/** "4:05", or "1:02:05" past an hour. Rounds up so a fresh 5-minute timer reads "5:00". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${ss}` : `${minutes}:${ss}`;
}

/** Stable notification id for the timer (one timer at a time, so one id). */
export const TIMER_NOTIFICATION_ID = 900_001;
