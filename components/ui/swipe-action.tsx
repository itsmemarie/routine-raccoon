"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { swipeArmedFeedback } from "@/lib/platform/haptics";

/** Movement before a touch is read as a sideways swipe or as a scroll. */
export const SWIPE_SLOP_PX = 10;
/** Letting go this far left (or 40% of the row, if that is less) acts. */
export const SWIPE_COMMIT_PX = 120;
const SWIPE_COMMIT_SHARE = 0.4;
/** A quick flick acts from a shorter distance. */
const FLICK_PX_PER_MS = 0.5;
const FLICK_MIN_PX = 48;
/** A pause longer than this before lifting the finger is not a flick. */
const FLICK_MAX_PAUSE_MS = 100;
/** Slide out / spring back; matches `duration-200` below. */
export const SWIPE_SLIDE_MS = 200;
/** A click this soon after a swipe is the swipe's own tap: it never opens the row. */
const SWALLOW_CLICK_MS = 400;

/** Elements carrying this attribute (a drag grip) never start a swipe. */
export const SWIPE_IGNORE_ATTR = "data-swipe-ignore";

interface Gesture {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  swiping: boolean;
  lastX: number;
  lastT: number;
  /** Horizontal speed in px/ms, negative leftwards. */
  vx: number;
}

type Phase = "idle" | "dragging" | "settling" | "gone";

/**
 * Swipe a row left to act on it (Today: "Skip today"). Touch and pen only. The page still
 * scrolls vertically (`touch-action: pan-y`); a sideways move past the slop takes over and
 * reveals the action behind the row. Letting go past the threshold, or flicking, slides the
 * row out and runs `onCommit`; anything shorter springs back. A swipe never also counts as a
 * tap on the row's links or buttons. Swipes are a shortcut: the same action must also exist
 * as a button or menu item.
 */
export function SwipeAction({
  label,
  icon,
  disabled = false,
  onCommit,
  children,
}: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly disabled?: boolean;
  /** Runs once the row has slid out; resolve false (the action failed) to slide it back. */
  readonly onCommit: () => Promise<boolean>;
  readonly children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const offsetRef = useRef(0);
  const armedRef = useRef(false);
  const swallowUntil = useRef(0);
  const timer = useRef<number | null>(null);
  const [offset, setOffsetState] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [armed, setArmedState] = useState(false);

  const clearTimer = () => {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);

  const setOffset = (value: number) => {
    offsetRef.current = value;
    setOffsetState(value);
  };
  const setArmed = (value: boolean) => {
    if (armedRef.current === value) return;
    armedRef.current = value;
    setArmedState(value);
    if (value) swipeArmedFeedback();
  };
  const width = () => rootRef.current?.offsetWidth ?? 0;
  const threshold = () =>
    width() > 0 ? Math.min(SWIPE_COMMIT_PX, width() * SWIPE_COMMIT_SHARE) : SWIPE_COMMIT_PX;

  const settle = () => {
    clearTimer();
    setPhase("settling");
    setArmed(false);
    setOffset(0);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setPhase("idle");
    }, SWIPE_SLIDE_MS);
  };

  const commit = () => {
    clearTimer();
    setPhase("gone");
    setOffset(-(width() + 24));
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void onCommit().then((done) => {
        if (!done) settle();
      });
    }, SWIPE_SLIDE_MS);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.pointerType === "mouse" || !e.isPrimary) return;
    if (phase === "dragging" || phase === "gone") return;
    if (e.target instanceof Element && e.target.closest(`[${SWIPE_IGNORE_ATTR}]`)) return;
    gesture.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      swiping: false,
      lastX: e.clientX,
      lastT: e.timeStamp,
      vx: 0,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.swiping) {
      if (Math.abs(dx) <= SWIPE_SLOP_PX && Math.abs(dy) <= SWIPE_SLOP_PX) return;
      // Mostly vertical is a scroll (the browser has it); rightwards does nothing.
      if (dx >= 0 || Math.abs(dy) >= Math.abs(dx)) {
        gesture.current = null;
        return;
      }
      g.swiping = true;
      clearTimer();
      setPhase("dragging");
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Safe to ignore: without capture the swipe still tracks while the finger stays on
        // the row, and ends (springs back) through pointercancel if it leaves.
      }
    }
    const dt = e.timeStamp - g.lastT;
    if (dt > 0) g.vx = (e.clientX - g.lastX) / dt;
    g.lastX = e.clientX;
    g.lastT = e.timeStamp;
    const next = Math.min(0, dx + SWIPE_SLOP_PX);
    setOffset(next);
    setArmed(-next >= threshold());
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    if (!g.swiping) return;
    swallowUntil.current = e.timeStamp + SWALLOW_CLICK_MS;
    const distance = -offsetRef.current;
    const flick =
      e.timeStamp - g.lastT <= FLICK_MAX_PAUSE_MS &&
      g.vx <= -FLICK_PX_PER_MS &&
      distance >= FLICK_MIN_PX;
    if (distance >= threshold() || flick) commit();
    else settle();
  };

  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    if (g.swiping) settle();
  };

  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (e.timeStamp >= swallowUntil.current) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const revealed = phase !== "idle";
  return (
    <div
      ref={rootRef}
      className={`relative touch-pan-y rounded-card ${revealed ? "overflow-hidden" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClickCapture={onClickCapture}
    >
      {revealed ? (
        <div
          aria-hidden
          data-testid="swipe-action"
          data-armed={armed || phase === "gone" ? "true" : "false"}
          className={`absolute inset-0 flex items-center justify-end gap-2 rounded-card pr-5 text-[13px] font-semibold transition-colors ${
            armed || phase === "gone" ? "bg-ink text-white" : "bg-canvas text-text-muted"
          }`}
        >
          {icon}
          <span>{label}</span>
        </div>
      ) : null}
      <div
        className={`relative ${phase === "dragging" ? "" : "transition-transform duration-200 ease-out motion-reduce:transition-none"}`}
        style={revealed ? { transform: `translateX(${offset}px)` } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
