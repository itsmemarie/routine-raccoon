"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, Play } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { TodayTask } from "@/domain/today";
import type { Step } from "@/domain/types";
import { RunningTimerPill } from "@/features/timer";

export interface TaskCardProps {
  readonly item: TodayTask;
  /** True while a just-ticked row lingers before animating out. */
  readonly ticking: boolean;
  readonly onTick: () => void;
  readonly onUntick: () => void;
  readonly onPlay: () => void;
  /** This task's timer is running: the pill counts down instead of offering to start. */
  readonly timerRunning: boolean;
  /** Extra Support: the steps still to do, shown on the card. */
  readonly steps: readonly Step[] | null;
}

function Grip({ active }: { active: boolean }) {
  return (
    <span aria-hidden className="flex flex-col gap-[3px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`block h-[1.5px] w-3 rounded ${active ? "bg-primary" : "bg-grip"}`}
        />
      ))}
    </span>
  );
}

/**
 * Task card body: grip · tick box · emoji · name + badges + meta · minutes/timer pill.
 * @see docs/handoff/README.md "Tick, undo, day complete", PRD R4
 */
export function TaskCardView({
  item,
  ticking,
  onTick,
  onUntick,
  onPlay,
  timerRunning,
  steps,
  handle,
  state = "idle",
}: TaskCardProps & { handle?: ReactNode; state?: "idle" | "placeholder" | "overlay" }) {
  const { task, done } = item;
  const href = `/task/?id=${encodeURIComponent(task.id)}`;
  const overlay = state === "overlay";
  return (
    <div
      data-testid="task-card"
      data-task-id={task.id}
      className={`rounded-card border bg-surface px-[15px] py-[13px] transition-opacity duration-700 ${
        overlay ? "rotate-[-1.2deg] border-primary shadow-drag" : "border-border"
      } ${done ? "opacity-50" : ""} ${state === "placeholder" ? "opacity-40" : ""} ${ticking ? "animate-pop" : ""}`}
    >
      <div className="flex items-center gap-[11px]">
        {handle ?? (
          <span className="flex w-6 justify-center">
            <Grip active={overlay} />
          </span>
        )}
        <button
          type="button"
          onClick={done ? onUntick : onTick}
          aria-label={done ? `Un-tick ${task.name}` : `Tick ${task.name}`}
          aria-pressed={done}
          className="-mx-2 -my-[9px] flex size-11 shrink-0 items-center justify-center"
        >
          <span
            className={`flex size-[23px] items-center justify-center rounded-lg ${done ? "bg-primary" : "border-[1.5px] border-grip bg-surface"}`}
          >
            {done ? <Check size={13} strokeWidth={3} className="text-white" aria-hidden /> : null}
          </span>
        </button>
        <Link href={href} className="flex min-h-11 min-w-0 flex-1 items-center gap-[11px]">
          <span className="text-[19px]" aria-hidden>
            {task.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={`block truncate text-[13.5px] font-semibold ${done ? "text-text-faint line-through" : "text-ink"}`}
            >
              {task.name}
            </span>
            {item.showHardBadge || item.showSurvivalBadge || item.meta ? (
              <span className="mt-[3px] flex flex-wrap items-center gap-1.5">
                {item.showHardBadge ? (
                  <span className="rounded-md bg-tint px-[7px] py-[3px] text-[10px] font-bold tracking-[0.06em] text-primary-dark uppercase">
                    Hard
                  </span>
                ) : null}
                {item.showSurvivalBadge ? (
                  <span className="rounded-md bg-primary-mid px-[7px] py-[3px] text-[10px] font-bold tracking-[0.06em] text-white uppercase">
                    Survival
                  </span>
                ) : null}
                {item.meta ? (
                  <span className="text-[11.5px] font-medium text-text-muted">{item.meta}</span>
                ) : null}
              </span>
            ) : null}
          </span>
        </Link>
        {timerRunning ? (
          <RunningTimerPill taskId={task.id} taskName={task.name} />
        ) : (
          <button
            type="button"
            onClick={onPlay}
            aria-label={`Start a ${item.minutes} minute timer for ${task.name}`}
            className="flex min-h-11 shrink-0 items-center gap-[5px] rounded-[10px] bg-screen px-[11px] text-text-muted"
          >
            <Play size={10} fill="currentColor" strokeWidth={0} aria-hidden />
            <span className="text-[12px] font-semibold">{item.minutes}</span>
          </button>
        )}
      </div>
      {steps && steps.length > 0 ? (
        <ul
          aria-label={`Next steps for ${task.name}`}
          className="mt-2 ml-[46px] flex flex-col gap-1"
        >
          {steps.map((step) => (
            <li key={step.id} className="flex gap-2 text-[12.5px] leading-snug text-ink-muted">
              <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-primary" />
              {step.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Sortable card on Today: the grip is the only drag handle (touch + keyboard). */
export function SortableTaskCard(props: TaskCardProps & { disabled: boolean }) {
  const { task } = props.item;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: props.disabled });
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Move ${task.name}`}
      className="-my-3 -ml-2 flex min-h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
    >
      <Grip active={isDragging} />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className="list-none"
    >
      <TaskCardView {...props} handle={handle} state={isDragging ? "placeholder" : "idle"} />
    </li>
  );
}
