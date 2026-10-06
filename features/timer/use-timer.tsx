"use client";

import { useCallback, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm";
import { toastError } from "@/components/ui/toast-store";
import { defaultContext } from "@/data/commands/context";
import { startTimer, stopTimer } from "@/data/commands/timer";
import { useClock } from "@/data/hooks/use-day-key";
import { useKv } from "@/data/hooks/use-kv";
import {
  isTimerExpired,
  timerRemainingMs,
  TIMER_NOTIFICATION_ID,
  type TimerState,
} from "@/domain/timer";
import type { DayKey } from "@/domain/types";
import { AppError } from "@/lib/errors/app-error";
import type { PageId } from "@/lib/errors/pages";
import { reportError } from "@/lib/errors/report";
import { getNotificationScheduler } from "@/lib/platform/notifications";
import { useRun } from "@/features/common";

export interface TimerView {
  readonly timer: TimerState;
  readonly remainingMs: number;
  readonly expired: boolean;
}

/** The running timer with a live (1 s) countdown, or null. */
export function useTimer(): TimerView | null {
  const timer = useKv("timer");
  const now = useClock(1_000);
  if (!timer || !now) return null;
  return {
    timer,
    remainingMs: timerRemainingMs(timer, now),
    expired: isTimerExpired(timer, now),
  };
}

async function scheduleExpiry(timer: TimerState, pageId: PageId): Promise<void> {
  const result = await getNotificationScheduler().schedule([
    {
      id: TIMER_NOTIFICATION_ID,
      title: "Time's up",
      body: `${timer.emoji} ${timer.taskName}. Tick it when you're done.`,
      at: new Date(timer.endsAt),
    },
  ]);
  if (!result.ok) {
    const error = new AppError("RR-TMR-001", { cause: result.error });
    const { errorId } = reportError(error, { pageId });
    toastError(error, pageId, errorId);
  }
}

async function cancelExpiry(): Promise<void> {
  // Cancelling an alert that may not exist is best-effort; a stale alert says only "Time's up".
  await getNotificationScheduler().cancel([TIMER_NOTIFICATION_ID]);
}

/**
 * Start / stop with the one-timer rule (handoff "Timer"): starting while another task's timer
 * runs asks "Stop {current} and start {new}?" first. Render `dialog` where the hook is used.
 */
export function useTimerControls(pageId: PageId, dayKey: DayKey | null) {
  const run = useRun(pageId);
  const current = useKv("timer");
  const [pending, setPending] = useState<{ taskId: string; name: string } | null>(null);

  const begin = useCallback(
    async (taskId: string) => {
      if (!dayKey) return;
      const result = await run(startTimer(defaultContext(), { taskId, dayKey }), {
        success: (v) => `Timer running for ${v.timer.taskName}`,
      });
      if (result.ok) await scheduleExpiry(result.value.timer, pageId);
    },
    [run, dayKey, pageId],
  );

  const start = useCallback(
    (task: { id: string; name: string }) => {
      if (current && current.taskId !== task.id) {
        setPending({ taskId: task.id, name: task.name });
        return;
      }
      void begin(task.id);
    },
    [current, begin],
  );

  /** Stops the timer and its alert. `quiet` skips the "Timer stopped" toast. */
  const stop = useCallback(
    async (options: { quiet?: boolean } = {}) => {
      const result = await run(stopTimer(defaultContext()), {
        ...(options.quiet ? {} : { success: "Timer stopped" }),
      });
      if (result.ok) await cancelExpiry();
    },
    [run],
  );

  const dialog =
    pending && current ? (
      <ConfirmDialog
        title={`Stop ${current.taskName} and start ${pending.name}?`}
        body="One timer runs at a time."
        confirmLabel={`Start ${pending.name}`}
        onConfirm={() => {
          const next = pending;
          setPending(null);
          void begin(next.taskId);
        }}
        onCancel={() => setPending(null)}
      />
    ) : null;

  return { current, start, stop, dialog };
}
