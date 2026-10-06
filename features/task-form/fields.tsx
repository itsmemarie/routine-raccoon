"use client";

import { Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { ChoiceChip } from "@/components/ui/chip";
import { GroupHeading } from "@/components/ui/layout";
import { SwitchRow } from "@/components/ui/toggle";
import { defaultSmallerMinutes } from "@/domain/duration";
import type { DayPlan, SurvivalLevel } from "@/domain/types";
import { MINUTE_CHOICES, newStepKey, type StepDraft } from "./form-state";

export const inputClass =
  "w-full rounded-[14px] border border-border bg-surface px-[15px] py-[13px] text-[13.5px] text-ink outline-none placeholder:text-text-faint focus:border-primary focus:shadow-selected";

function clampMinutes(raw: string): number {
  const value = Math.round(Number(raw));
  return Number.isFinite(value) ? Math.min(600, Math.max(1, value)) : 1;
}

/** Estimated time: 5 / 15 / 30 / 60 min / Custom (handoff screen 10). */
export function MinutesField({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const headingId = useId();
  const inputId = useId();
  const preset = (MINUTE_CHOICES as readonly number[]).includes(value);
  const [custom, setCustom] = useState(!preset);
  return (
    <section aria-labelledby={headingId} className="mt-5">
      <GroupHeading id={headingId}>Estimated time</GroupHeading>
      <div className="mt-2.5 flex flex-wrap items-center gap-[7px]">
        {MINUTE_CHOICES.map((m) => (
          <ChoiceChip
            key={m}
            selected={!custom && value === m}
            onClick={() => {
              setCustom(false);
              onChange(m);
            }}
          >
            {m} min
          </ChoiceChip>
        ))}
        <ChoiceChip selected={custom} onClick={() => setCustom(true)}>
          Custom
        </ChoiceChip>
        {custom ? (
          <label
            htmlFor={inputId}
            className="flex min-h-10 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-border-strong bg-surface px-3 text-[12px] text-text-muted"
          >
            <input
              id={inputId}
              type="number"
              inputMode="numeric"
              min={1}
              max={600}
              value={value}
              onChange={(event) => onChange(clampMinutes(event.target.value))}
              className="w-12 bg-transparent text-[12.5px] font-semibold text-ink outline-none"
            />
            min
          </label>
        ) : null}
      </div>
    </section>
  );
}

/** Steps editor: one input per step, remove ×, Add subtask. Blank steps are dropped on save. */
export function StepsEditor({
  steps,
  onChange,
}: {
  steps: readonly StepDraft[];
  onChange: (next: StepDraft[]) => void;
}) {
  const headingId = useId();
  const [focusKey, setFocusKey] = useState<string | null>(null);
  return (
    <section aria-labelledby={headingId} className="mt-5">
      <GroupHeading id={headingId}>Steps</GroupHeading>
      <div className="mt-2.5 rounded-[14px] border border-border bg-surface px-3.5 pt-1 pb-3">
        <ol>
          {steps.map((step, index) => (
            <li key={step.key} className="flex items-center gap-[11px] border-b border-border py-1">
              <span
                aria-hidden
                className="w-4 text-center text-[11.5px] font-semibold text-text-faint"
              >
                {index + 1}
              </span>
              <input
                aria-label={`Step ${index + 1}`}
                value={step.text}
                maxLength={300}
                placeholder="Step"
                // Focus only the step the user just added.
                autoFocus={step.key === focusKey}
                onChange={(event) =>
                  onChange(
                    steps.map((s) => (s.key === step.key ? { ...s, text: event.target.value } : s)),
                  )
                }
                className="min-h-11 flex-1 bg-transparent text-[13.5px] text-ink-muted outline-none"
              />
              <button
                type="button"
                aria-label={`Remove step ${index + 1}`}
                onClick={() => onChange(steps.filter((s) => s.key !== step.key))}
                className="flex size-11 shrink-0 items-center justify-center"
              >
                <span className="flex size-7 items-center justify-center rounded-[9px] bg-screen text-text-muted">
                  <X size={14} strokeWidth={1.8} aria-hidden />
                </span>
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => {
            const key = newStepKey();
            setFocusKey(key);
            onChange([...steps, { key, text: "" }]);
          }}
          className="mt-3 flex min-h-11 items-center gap-[9px] rounded-[11px] bg-tint px-3 text-[12.5px] font-bold text-primary-dark"
        >
          <Plus size={12} strokeWidth={2.4} aria-hidden /> Add subtask
        </button>
      </div>
    </section>
  );
}

/**
 * The smaller version (PRD R6): its own time (auto = half, at least 2 min), what it is, and
 * "never shrink" for tasks that can't be made smaller.
 */
export function SmallerVersionField({
  minutes,
  smallerMinutes,
  smallerText,
  neverShrink,
  survivalName,
  onChange,
}: {
  minutes: number;
  smallerMinutes: number | null;
  smallerText: string;
  neverShrink: boolean;
  survivalName: string;
  onChange: (patch: {
    smallerMinutes?: number | null;
    smallerText?: string;
    neverShrink?: boolean;
  }) => void;
}) {
  const headingId = useId();
  const textId = useId();
  const customId = useId();
  const auto = defaultSmallerMinutes(minutes);
  const presets = [2, 5, 10].filter((m) => m < minutes);
  const [custom, setCustom] = useState(
    smallerMinutes !== null && !presets.includes(smallerMinutes),
  );
  return (
    <section aria-labelledby={headingId} className="mt-5">
      <GroupHeading id={headingId}>Smaller version</GroupHeading>
      <p className="mt-1.5 text-[11.5px] leading-normal text-text-muted">
        What this task becomes on a {survivalName} day.
      </p>
      <div className="mt-2.5 rounded-[14px] border border-border bg-surface">
        <SwitchRow
          id={`${headingId}-never`}
          title="Never shrink"
          description="Keeps its full time even on hard days"
          checked={neverShrink}
          onChange={(next) => onChange({ neverShrink: next })}
        />
        {neverShrink ? null : (
          <div className="border-t border-border px-[15px] py-3.5">
            <div
              role="group"
              aria-label="Smaller version time"
              className="flex flex-wrap items-center gap-[7px]"
            >
              <ChoiceChip
                selected={!custom && smallerMinutes === null}
                onClick={() => {
                  setCustom(false);
                  onChange({ smallerMinutes: null });
                }}
              >
                About {auto} min
              </ChoiceChip>
              {presets.map((m) => (
                <ChoiceChip
                  key={m}
                  selected={!custom && smallerMinutes === m}
                  onClick={() => {
                    setCustom(false);
                    onChange({ smallerMinutes: m });
                  }}
                >
                  {m} min
                </ChoiceChip>
              ))}
              <ChoiceChip
                selected={custom}
                onClick={() => {
                  setCustom(true);
                  onChange({ smallerMinutes: smallerMinutes ?? auto });
                }}
              >
                Custom
              </ChoiceChip>
              {custom ? (
                <label
                  htmlFor={customId}
                  className="flex min-h-10 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-border-strong px-3 text-[12px] text-text-muted"
                >
                  <input
                    id={customId}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={600}
                    value={smallerMinutes ?? auto}
                    onChange={(event) =>
                      onChange({ smallerMinutes: clampMinutes(event.target.value) })
                    }
                    className="w-12 bg-transparent text-[12.5px] font-semibold text-ink outline-none"
                  />
                  min
                </label>
              ) : null}
            </div>
            <label htmlFor={textId} className="sr-only">
              What the smaller version is
            </label>
            <textarea
              id={textId}
              rows={2}
              maxLength={4000}
              value={smallerText}
              placeholder="What's the smaller version? e.g. Just the first step"
              onChange={(event) => onChange({ smallerText: event.target.value })}
              className={`${inputClass} mt-3 resize-none`}
            />
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * "Also add to {survivalName} plans" (handoff "Survival copies"): copies on save, one per plan.
 */
export function SurvivalCopyField({
  plans,
  selected,
  minutes,
  survivalName,
  onChange,
}: {
  plans: readonly DayPlan[];
  selected: readonly SurvivalLevel[];
  minutes: number;
  survivalName: string;
  onChange: (next: SurvivalLevel[]) => void;
}) {
  const headingId = useId();
  if (plans.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="mt-5">
      <GroupHeading id={headingId}>Also add to {survivalName} plans</GroupHeading>
      <div role="group" aria-labelledby={headingId} className="mt-2.5 flex flex-wrap gap-[7px]">
        {plans.map((plan) => {
          const level = plan.survival_level;
          if (level === null) return null;
          const on = selected.includes(level);
          return (
            <ChoiceChip
              key={plan.id}
              selected={on}
              onClick={() =>
                onChange(on ? selected.filter((l) => l !== level) : [...selected, level])
              }
            >
              {plan.name}
            </ChoiceChip>
          );
        })}
      </div>
      <p className="mt-[9px] text-[11.5px] leading-normal text-text-muted">
        {selected.length > 0
          ? `A copy goes into each plan you pick, at about ${defaultSmallerMinutes(minutes)} min.`
          : "Pick a plan to put a copy of this task in it. Copies are separate afterwards."}
      </p>
    </section>
  );
}
