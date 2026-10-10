"use client";

import { useCallback, useRef } from "react";
import { useToastStore } from "@/components/ui/toast-store";
import { defaultContext } from "@/data/commands/context";
import {
  skipSectionToday,
  skipTaskToday,
  unskipSectionToday,
  unskipTaskToday,
} from "@/data/commands/day";
import type { DayKey, Section, Task } from "@/domain/types";
import type { PageId } from "@/lib/errors/pages";
import { showToast, useRun } from "@/features/common";
import { UNDO_WINDOW_MS } from "./use-tick";

const PAGE: PageId = "P01";

/** The skip whose Undo snackbar may still be showing. */
interface PendingUndo {
  readonly toastId: number;
  readonly sectionId: string;
  readonly taskIds: readonly string[];
}

/**
 * Skip today with the same 5 s Undo as a tick: a card swiped left, or a whole section from its
 * ⋯ menu. Bring back puts skipped tasks on today's list again at any time; when it undoes the
 * skip still on screen, that Undo snackbar closes (there is nothing left to undo) and the
 * "Brought back" message shows at once instead of waiting behind it. When an undo window
 * closes on its own, `onUndoWindowClosed` runs (Today goes to Day complete once nothing is
 * left). Every failure is shown with its code.
 *
 * @see docs/handoff/README.md "Skip today"
 */
export function useSkipWithUndo(dayKey: DayKey | null, onUndoWindowClosed: () => void) {
  const run = useRun(PAGE);
  const show = useToastStore((s) => s.show);
  const pendingUndo = useRef<PendingUndo | null>(null);

  /** Closes the skip's Undo snackbar when `covers` says Bring back has undone all of it. */
  const retireUndo = useCallback((covers: (undo: PendingUndo) => boolean) => {
    const undo = pendingUndo.current;
    if (!undo || !covers(undo)) return;
    pendingUndo.current = null;
    // "action": as if Undo was pressed, so the undo-window-closed check doesn't run.
    useToastStore.getState().dismiss(undo.toastId, "action");
  }, []);

  /** Resolves true when the task was skipped, so a swiped card knows to stay gone. */
  const skipTask = useCallback(
    async (task: Pick<Task, "id" | "name" | "section_id">): Promise<boolean> => {
      if (!dayKey) return false;
      const result = await run(skipTaskToday(defaultContext(), { taskId: task.id, dayKey }));
      if (!result.ok) return false;
      const toastId = show({
        message: `Skipped ${task.name} for today`,
        durationMs: UNDO_WINDOW_MS,
        action: {
          label: "Undo",
          onPress: () => void run(unskipTaskToday(defaultContext(), { taskId: task.id, dayKey })),
        },
        onExpire: onUndoWindowClosed,
      });
      pendingUndo.current = { toastId, sectionId: task.section_id, taskIds: [task.id] };
      return true;
    },
    [dayKey, run, show, onUndoWindowClosed],
  );

  const bringBackTask = useCallback(
    async (task: Pick<Task, "id" | "name">) => {
      if (!dayKey) return;
      const result = await run(unskipTaskToday(defaultContext(), { taskId: task.id, dayKey }));
      if (!result.ok) return;
      retireUndo((undo) => undo.taskIds.length === 1 && undo.taskIds[0] === task.id);
      showToast(`Brought back ${task.name}`);
    },
    [dayKey, run, retireUndo],
  );

  /** Resolves to the ids skipped (empty when nothing was open or it failed). */
  const skipSection = useCallback(
    async (section: Pick<Section, "id" | "name">): Promise<readonly string[]> => {
      if (!dayKey) return [];
      const result = await run(
        skipSectionToday(defaultContext(), { sectionId: section.id, dayKey }),
      );
      if (!result.ok) return [];
      const { taskIds } = result.value;
      if (taskIds.length === 0) {
        showToast(`Nothing left to skip in ${section.name}`);
        return taskIds;
      }
      const toastId = show({
        message: `Skipped ${section.name} for today`,
        durationMs: UNDO_WINDOW_MS,
        action: {
          label: "Undo",
          onPress: () =>
            void run(
              unskipSectionToday(defaultContext(), { sectionId: section.id, dayKey, taskIds }),
            ),
        },
        onExpire: onUndoWindowClosed,
      });
      pendingUndo.current = { toastId, sectionId: section.id, taskIds };
      return taskIds;
    },
    [dayKey, run, show, onUndoWindowClosed],
  );

  const bringBackSection = useCallback(
    async (section: Pick<Section, "id" | "name">) => {
      if (!dayKey) return;
      const result = await run(
        unskipSectionToday(defaultContext(), { sectionId: section.id, dayKey }),
      );
      if (!result.ok) return;
      // Every skip in the section came back, so its pending Undo has nothing left to do.
      retireUndo((undo) => undo.sectionId === section.id);
      if (result.value.count > 0) showToast(`Brought back ${section.name}`);
    },
    [dayKey, run, retireUndo],
  );

  return { skipTask, bringBackTask, skipSection, bringBackSection };
}
