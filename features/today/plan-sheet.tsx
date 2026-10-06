"use client";

import { Check, Plus } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { formatDuration } from "@/domain/duration";
import type { PlanOption } from "@/domain/today";
import type { SurvivalLevel } from "@/domain/types";

function meta(option: PlanOption): string {
  return `${option.count} ${option.count === 1 ? "task" : "tasks"} · ${formatDuration(option.minutes)}`;
}

/** One pickable plan row with a radio-style mark (plan sheet and the daily prompt). */
export function PlanOptionRow({
  option,
  selected,
  tone,
  divider,
  onPick,
}: {
  option: PlanOption;
  selected: boolean;
  tone: "plain" | "survival";
  divider: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-pressed={selected}
        className={`flex min-h-14 w-full items-center gap-3 py-3 text-left ${divider ? (tone === "survival" ? "border-t border-tint-border" : "border-t border-border") : ""}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold text-ink">{option.plan.name}</span>
          <span
            className={`mt-0.5 block text-[11.5px] font-medium ${tone === "survival" ? "text-survival-text" : "text-text-muted"}`}
          >
            {meta(option)}
          </span>
        </span>
        {selected ? (
          <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-primary">
            <Check size={12} strokeWidth={3} className="text-white" aria-hidden />
          </span>
        ) : (
          <span
            aria-hidden
            className={`size-[22px] shrink-0 rounded-full border-[1.5px] ${tone === "survival" ? "border-primary-light" : "border-grip"}`}
          />
        )}
      </button>
    </li>
  );
}

/**
 * Today's plan sheet (handoff screen 2): regular Day Plans with full durations, then the
 * survival levels with each level's own plan and shrunk durations, then "+ New Day Plan".
 * @see docs/handoff/README.md "Today's plan picker"
 */
export function PlanSheet({
  dayPlans,
  survival,
  survivalName,
  activePlanId,
  survivalOn,
  onPickPlan,
  onPickLevel,
  onNewPlan,
  onClose,
}: {
  dayPlans: readonly PlanOption[];
  survival: readonly PlanOption[];
  survivalName: string;
  activePlanId: string | null;
  survivalOn: boolean;
  onPickPlan: (planId: string) => void;
  onPickLevel: (level: SurvivalLevel) => void;
  onNewPlan: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Which kind of day is it?" onClose={onClose} testId="plan-sheet">
      <ul aria-label="Day Plans" className="-mt-2 flex flex-col px-1">
        {dayPlans.map((option, index) => (
          <PlanOptionRow
            key={option.plan.id}
            option={option}
            tone="plain"
            divider={index > 0}
            selected={!survivalOn && option.plan.id === activePlanId}
            onPick={() => onPickPlan(option.plan.id)}
          />
        ))}
      </ul>
      {survival.length > 0 ? (
        <div className="rounded-[18px] bg-tint px-3.5 pt-1">
          <h3 className="pt-2.5 pb-0.5 text-[10.5px] font-semibold tracking-[0.12em] text-survival-text uppercase">
            {survivalName} Day
          </h3>
          <ul aria-label={`${survivalName} Day`} className="flex flex-col">
            {survival.map((option, index) => (
              <PlanOptionRow
                key={option.plan.id}
                option={option}
                tone="survival"
                divider={index > 0}
                selected={survivalOn && option.plan.id === activePlanId}
                onPick={() => (option.level ? onPickLevel(option.level) : undefined)}
              />
            ))}
          </ul>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onNewPlan}
        className="flex min-h-11 items-center justify-center gap-1.5 text-[13px] font-bold text-primary"
      >
        <Plus size={14} strokeWidth={2.4} aria-hidden /> New Day Plan
      </button>
    </Sheet>
  );
}
