import { parseHHMM } from "./time";
import type { TodayView } from "./today";
import type { DayKey, HHMM } from "./types";

/**
 * Section notifications (PRD R11, handoff "Notifications"). Pure: computes what to schedule;
 * lib/platform/notifications does the scheduling (exact alarms on Android, mocked on web).
 *
 * - Block starts, at the section's start time: "{section} · {first unticked task} · {min} min".
 * - Block closing, `closing_lead_minutes` before the NEXT section starts: what's still unticked.
 */

export interface PlannedNotification {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly at: Date;
}

/** Stable 31-bit id per (section, kind), so rescheduling replaces instead of duplicating. */
export function notificationId(sectionId: string, kind: "start" | "closing"): number {
  let hash = kind === "start" ? 17 : 31;
  for (const char of sectionId) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  // Keep clear of the timer's id range and of 0.
  return (Math.abs(hash) % 800_000) + 1;
}

/**
 * The wall-clock instant of `time` on the logical day `dayKey`. Times before the reset belong
 * to the end of the logical day, i.e. the next calendar date (a 01:00 section with a 02:00 reset).
 */
export function instantOn(dayKey: DayKey, time: HHMM, resetAt: HHMM): Date | null {
  const minutes = parseHHMM(time);
  const reset = parseHHMM(resetAt) ?? 0;
  const [y, m, d] = dayKey.split("-").map(Number);
  if (minutes === null || !y || !m || !d) return null;
  const date = new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0);
  if (minutes < reset) date.setDate(date.getDate() + 1);
  return date;
}

function list(names: readonly string[]): string {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

/** Notifications still ahead of `now` for the day's active plan. */
export function planSectionNotifications(
  view: Pick<TodayView, "dayKey" | "sections">,
  now: Date,
  resetAt: HHMM,
): PlannedNotification[] {
  const timed = view.sections
    .map((s) => ({
      ...s,
      at: s.section.start_time ? instantOn(view.dayKey, s.section.start_time, resetAt) : null,
    }))
    .filter((s): s is typeof s & { at: Date } => s.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const planned: PlannedNotification[] = [];
  timed.forEach((current, index) => {
    const open = current.tasks.filter((t) => !t.done);
    const first = open[0];
    if (current.section.notify_on_start && first && current.at > now) {
      planned.push({
        id: notificationId(current.section.id, "start"),
        title: current.section.name,
        body: `${current.section.name} · ${first.task.emoji} ${first.task.name} · ${first.minutes} min`,
        at: current.at,
      });
    }
    const next = timed[index + 1];
    if (current.section.notify_before_close && next && open.length > 0) {
      const lead = current.section.closing_lead_minutes ?? 15;
      const at = new Date(next.at.getTime() - lead * 60_000);
      if (at > now && at > current.at) {
        planned.push({
          id: notificationId(current.section.id, "closing"),
          title: `${current.section.name} closes in ${lead} min`,
          body: `Still open: ${list(open.map((t) => t.task.name))}`,
          at,
        });
      }
    }
  });
  return planned;
}
