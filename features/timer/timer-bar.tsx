"use client";

import { Square } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { defaultContext } from "@/data/commands/context";
import { tickTask } from "@/data/commands/day";
import { markTimerAlerted } from "@/data/commands/timer";
import { formatCountdown } from "@/domain/timer";
import { showToast, useRun } from "@/features/common";
import { useTimer, useTimerControls } from "./use-timer";

/** Routes where the bar would cover a form footer or a full-screen moment. */
const HIDDEN_ON = ["/task/edit", "/section/edit", "/auth", "/day-complete", "/setup"];
const TAB_ROUTES = ["/", "/progress", "/settings"];

function normalise(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

/**
 * Pinned timer bar (handoff "Timer"): counts down on every screen, survives navigation and
 * restarts because the end time is stored. On expiry it nudges once and offers to tick; it
 * never ticks by itself.
 */
export function TimerBar() {
  const view = useTimer();
  const pathname = normalise(usePathname());
  const run = useRun("P00");
  const { stop } = useTimerControls("P00", view?.timer.dayKey ?? null);
  const alertedFor = useRef<string | null>(null);

  const expired = view?.expired ?? false;
  const startedAt = view?.timer.startedAt ?? null;
  const alreadyAlerted = view?.timer.alerted ?? true;
  const taskName = view?.timer.taskName ?? "";
  useEffect(() => {
    if (!expired || alreadyAlerted || !startedAt || alertedFor.current === startedAt) return;
    alertedFor.current = startedAt;
    void run(markTimerAlerted(defaultContext()), { success: `Time's up: ${taskName}` });
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(200);
  }, [expired, alreadyAlerted, startedAt, taskName, run]);

  const visible = view !== null && !HIDDEN_ON.some((r) => pathname.startsWith(r));
  useEffect(() => {
    // Lets toasts sit above the bar instead of under it (see components/ui/toaster.tsx).
    const root = document.documentElement;
    if (visible) root.style.setProperty("--timer-bar-space", "72px");
    else root.style.removeProperty("--timer-bar-space");
    return () => {
      root.style.removeProperty("--timer-bar-space");
    };
  }, [visible]);

  if (!view || !visible) return null;
  const { timer } = view;
  const aboveTabs = TAB_ROUTES.includes(pathname);

  const tickAndStop = async () => {
    const result = await run(
      tickTask(defaultContext(), { taskId: timer.taskId, dayKey: timer.dayKey }),
    );
    if (!result.ok) return;
    await stop({ quiet: true });
    showToast(`Ticked ${timer.taskName}`);
  };

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-40 mx-auto flex max-w-[480px] justify-center px-3.5 ${aboveTabs ? "bottom-[calc(76px+env(safe-area-inset-bottom))]" : "bottom-[max(14px,env(safe-area-inset-bottom))]"}`}
    >
      <div
        role="timer"
        aria-live="off"
        data-testid="timer-bar"
        className="pointer-events-auto flex w-full items-center gap-3 rounded-card bg-ink px-3.5 py-2.5 text-white shadow-toast"
      >
        <span aria-hidden className="text-[19px]">
          {timer.emoji}
        </span>
        <Link
          href={`/task/?id=${encodeURIComponent(timer.taskId)}`}
          className="flex min-h-11 min-w-0 flex-1 flex-col justify-center"
        >
          <span className="truncate text-[13px] font-semibold">{timer.taskName}</span>
          <span
            className={`text-[12px] font-bold tabular-nums ${view.expired ? "text-amber" : "text-text-on-dark"}`}
          >
            {view.expired ? "Time's up" : formatCountdown(view.remainingMs)}
          </span>
        </Link>
        {view.expired ? (
          <>
            <button
              type="button"
              onClick={() => void stop({ quiet: true })}
              className="min-h-11 shrink-0 px-2 text-[12.5px] font-semibold text-text-on-dark"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => void tickAndStop()}
              className="min-h-11 shrink-0 rounded-chip bg-primary px-3.5 text-[12.5px] font-bold text-white"
            >
              Tick it
            </button>
          </>
        ) : (
          <button
            type="button"
            aria-label={`Stop timer for ${timer.taskName}`}
            onClick={() => void stop()}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10"
          >
            <Square size={14} fill="currentColor" strokeWidth={0} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
