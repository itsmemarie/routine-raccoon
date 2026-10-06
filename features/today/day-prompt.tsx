"use client";

import type { PlanOption } from "@/domain/today";
import type { SurvivalLevel } from "@/domain/types";
import { PlanOptionRow } from "./plan-sheet";

/**
 * "Which kind of day is it?" (Settings → "Show the Day Plan picker on Today", PRD R7 "level
 * picker opens automatically"). Shown on Today until a plan is picked for the day or the box
 * is hidden; it asks rather than blocks, so a low day is one tap from smaller.
 */
export function DayPrompt({
  dayPlans,
  survival,
  survivalName,
  onPickPlan,
  onPickLevel,
  onHide,
}: {
  dayPlans: readonly PlanOption[];
  survival: readonly PlanOption[];
  survivalName: string;
  onPickPlan: (planId: string) => void;
  onPickLevel: (level: SurvivalLevel) => void;
  onHide: () => void;
}) {
  return (
    <section
      aria-labelledby="day-prompt-title"
      data-testid="day-prompt"
      className="mt-3 rounded-[20px] border border-tint-border bg-surface px-3.5 pt-3 pb-1"
    >
      <div className="flex items-center gap-2.5">
        <h2 id="day-prompt-title" className="flex-1 text-[13px] font-semibold text-ink">
          Which kind of day is it?
        </h2>
        <button
          type="button"
          onClick={onHide}
          className="min-h-9 rounded-full bg-canvas px-[13px] text-[11.5px] font-semibold text-text-muted"
        >
          Hide
        </button>
      </div>
      <ul aria-label="Day Plans" className="mt-1 flex flex-col">
        {dayPlans.map((option, index) => (
          <PlanOptionRow
            key={option.plan.id}
            option={option}
            tone="plain"
            divider={index > 0}
            selected={false}
            onPick={() => onPickPlan(option.plan.id)}
          />
        ))}
      </ul>
      {survival.length > 0 ? (
        <>
          <h3 className="mt-1 border-t border-border pt-2.5 text-[10.5px] font-semibold tracking-[0.12em] text-survival-text uppercase">
            {survivalName} Day
          </h3>
          <ul aria-label={`${survivalName} Day`} className="flex flex-col">
            {survival.map((option, index) => (
              <PlanOptionRow
                key={option.plan.id}
                option={option}
                tone="survival"
                divider={index > 0}
                selected={false}
                onPick={() => (option.level ? onPickLevel(option.level) : undefined)}
              />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
