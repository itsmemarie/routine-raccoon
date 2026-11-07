import type { DayKey, DayPlan, LogEntry } from "./types";
import { isLive } from "./types";

/**
 * Which Day Plan the user picked on a day, read back from the Log.
 *
 * `day_records.plan_id` stays on the device that made the pick until the hardening migration is
 * applied, but every pick also writes a synced Log entry, "Switched to {plan name}" (see
 * `planPickedCopy`). A device that never saw the pick can recover it from there.
 *
 * Returns null when the Log doesn't settle it: no pick that day, the last pick was the day's
 * primary plan (which a record stores as no plan at all), or the name no longer says which plan
 * (renamed, deleted, or two plans share it). Better to leave a day alone than to guess.
 */
export function pickedPlanFromLog(
  entries: readonly Pick<LogEntry, "day_key" | "kind" | "title" | "at">[],
  plans: readonly DayPlan[],
  dayKey: DayKey,
  primaryThatDay: DayPlan | null,
): DayPlan | null {
  const last = entries
    .filter(
      (e) => e.day_key === dayKey && e.kind === "survival" && e.title.startsWith("Switched to "),
    )
    .sort((a, b) => a.at.localeCompare(b.at))
    .at(-1);
  if (!last) return null;
  const name = last.title.slice("Switched to ".length);
  const named = plans.filter((p) => isLive(p) && p.kind !== "survival" && p.name === name);
  const [plan] = named;
  if (named.length !== 1 || !plan || plan.id === primaryThatDay?.id) return null;
  return plan;
}
