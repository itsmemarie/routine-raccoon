"use client";

import { useSyncExternalStore } from "react";
import { Button } from "./button";

/**
 * Bottom padding for a screen that can show a SaveBar, so its last buttons scroll clear of the
 * bar (and of the timer bar). It stays on while the bar is hidden: the bar leaving must not
 * shorten the page and move a button out from under a tap.
 */
export const SAVE_BAR_CLEARANCE = "pb-[calc(96px+var(--timer-bar-space,0px))]";

function subscribeToViewport(onChange: () => void): () => void {
  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", onChange);
  viewport?.addEventListener("scroll", onChange);
  return () => {
    viewport?.removeEventListener("resize", onChange);
    viewport?.removeEventListener("scroll", onChange);
  };
}

function coveredByKeyboard(): number {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
}

/**
 * Pixels of the screen's bottom hidden by the on-screen keyboard. Phone browsers open it over
 * the page without resizing it, so `bottom: 0` alone would sit behind the keyboard.
 */
function useKeyboardHeight(): number {
  return useSyncExternalStore(subscribeToViewport, coveredByKeyboard, () => 0);
}

/**
 * Sticky Save, shown while a task has a change that isn't saved (handoff "Saving task edits").
 * Stays on screen while scrolling, above the keyboard while typing and above the timer bar.
 */
export function SaveBar({
  onSave,
  busy = false,
  note,
}: {
  onSave: () => void;
  busy?: boolean;
  /** Replaces "Not saved yet", e.g. when saving also updates coupled copies. */
  note?: string;
}) {
  const keyboard = useKeyboardHeight();
  return (
    <div
      data-testid="save-bar"
      style={{ bottom: `max(var(--timer-bar-space, 0px), ${keyboard}px)` }}
      className={`fixed inset-x-0 z-40 mx-auto flex max-w-[480px] animate-up items-center gap-3 border-t border-border bg-surface px-4 pt-2.5 shadow-[0_-8px_24px_rgba(15,14,14,0.1)] ${
        keyboard > 0 ? "pb-2.5" : "pb-[max(10px,env(safe-area-inset-bottom))]"
      }`}
    >
      <span className="min-w-0 flex-1 text-[13px] font-semibold text-text-muted">
        {note ?? "Not saved yet"}
      </span>
      <Button
        // Keeps focus in the field. Otherwise the press blurs it, the field commits, and the bar
        // is gone before the tap lands, which would then hit whatever sits underneath.
        onMouseDown={(event) => event.preventDefault()}
        onClick={onSave}
        disabled={busy}
        className="min-w-28"
      >
        Save
      </Button>
    </div>
  );
}
