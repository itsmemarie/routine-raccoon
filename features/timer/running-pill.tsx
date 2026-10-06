"use client";

import Link from "next/link";
import { formatCountdown } from "@/domain/timer";
import { useTimer } from "./use-timer";

/**
 * The card's minutes pill while its timer runs: counts down in place (handoff "Timer"). Its own
 * component so only this pill re-renders every second, not the whole list.
 */
export function RunningTimerPill({ taskId, taskName }: { taskId: string; taskName: string }) {
  const view = useTimer();
  if (!view || view.timer.taskId !== taskId) return null;
  const label = view.expired ? "Done?" : formatCountdown(view.remainingMs);
  return (
    <Link
      href={`/task/?id=${encodeURIComponent(taskId)}`}
      aria-label={
        view.expired ? `Time's up for ${taskName}` : `${label} left on ${taskName}, open task`
      }
      className="flex min-h-11 shrink-0 items-center rounded-[10px] bg-tint px-[11px] text-[12px] font-bold text-primary-dark tabular-nums"
    >
      {label}
    </Link>
  );
}
