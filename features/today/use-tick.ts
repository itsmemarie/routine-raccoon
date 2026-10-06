"use client";

import { useCallback } from "react";
import { toastError, useToastStore } from "@/components/ui/toast-store";
import { defaultContext } from "@/data/commands/context";
import { tickTask, untickTask } from "@/data/commands/day";
import type { DayKey, Task } from "@/domain/types";
import type { AppError } from "@/lib/errors/app-error";
import type { PageId } from "@/lib/errors/pages";
import { reportError } from "@/lib/errors/report";
import { useTodayStore } from "./today-store";

/** Ticked rows stay visible (struck through) this long before animating out. */
export const TICK_LINGER_MS = 700;
/** Undo window after a tick (handoff decision: 5 seconds). */
export const UNDO_WINDOW_MS = 5000;

const PAGE: PageId = "P01";

function fail(error: AppError) {
  const { errorId } = reportError(error, { pageId: PAGE });
  toastError(error, PAGE, errorId);
}

/**
 * Tick → strike + grey → 700 ms → row leaves; a 5 s snackbar "Ticked {task}" offers Undo.
 * When the undo window closes without Undo, `onUndoWindowClosed` runs (Today uses it to go to
 * Day complete once nothing is left). Every failure is reported and toasted with its code.
 *
 * @see docs/handoff/README.md "Tick, undo, day complete"
 */
export function useTickWithUndo(dayKey: DayKey | null, onUndoWindowClosed: () => void) {
  const setTicking = useTodayStore((s) => s.setTicking);
  const showToast = useToastStore((s) => s.show);

  const untick = useCallback(
    async (task: Task) => {
      if (!dayKey) return;
      setTicking(task.id, false);
      const result = await untickTask(defaultContext(), { taskId: task.id, dayKey });
      if (!result.ok) fail(result.error);
    },
    [dayKey, setTicking],
  );

  const tick = useCallback(
    async (task: Task) => {
      if (!dayKey) return;
      const result = await tickTask(defaultContext(), { taskId: task.id, dayKey });
      if (!result.ok) {
        fail(result.error);
        return;
      }
      setTicking(task.id, true);
      window.setTimeout(() => setTicking(task.id, false), TICK_LINGER_MS);
      showToast({
        message: `Ticked ${task.name}`,
        durationMs: UNDO_WINDOW_MS,
        action: { label: "Undo", onPress: () => void untick(task) },
        onExpire: onUndoWindowClosed,
      });
    },
    [dayKey, setTicking, showToast, untick, onUndoWindowClosed],
  );

  return { tick, untick };
}
