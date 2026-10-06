import type { Task } from "./types";

/**
 * Duration copy and the shrink rule.
 * @see docs/handoff/README.md "Which tasks show on Today" and "Headline"
 */

/** `<60 → "25m"`, else `"2h 07m"` or `"2h"`. */
export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return `${safe}m`;
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, "0")}m`;
}

/** Default smaller version: half the full estimate, never under 2 minutes. */
export function defaultSmallerMinutes(minutes: number): number {
  return Math.max(2, Math.round(minutes / 2));
}

/** Whether a task runs at its smaller version today. */
export function isShrunk(task: Pick<Task, "never_shrink">, survivalOn: boolean): boolean {
  return survivalOn && !task.never_shrink;
}

/** Minutes shown on the card and counted in totals. */
export function displayMinutes(
  task: Pick<Task, "minutes" | "never_shrink" | "smaller_versions">,
  survivalOn: boolean,
): number {
  if (!isShrunk(task, survivalOn)) return task.minutes;
  return task.smaller_versions.minutes ?? defaultSmallerMinutes(task.minutes);
}
