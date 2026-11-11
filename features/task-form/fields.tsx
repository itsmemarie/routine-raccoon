"use client";

import { Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { ChoiceChip } from "@/components/ui/chip";
import { GroupHeading } from "@/components/ui/layout";
import { applyMove, SortableList } from "@/components/ui/sortable-list";
import { SwitchRow } from "@/components/ui/toggle";
import { defaultSmallerMinutes, displayMinutes } from "@/domain/duration";
import type { DayPlan, Section } from "@/domain/types";
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

/**
 * Steps editor: one input per step, drag grip to reorder, remove ×, Add subtask. Blank steps
 * are dropped on save.
 */
export function StepsEditor({
  steps,
  onChange,
}: {
  steps: readonly StepDraft[];
  onChange: (next: StepDraft[]) => void;
}) {
  const headingId = useId();
  const [focusKey, setFocusKey] = useState<string | null>(null);
  // SortableList keys rows by `id`; a draft's stable identity is its `key`.
  const rows = steps.map((step) => ({ id: step.key, step }));
  return (
    <section aria-labelledby={headingId} className="mt-5">
      <GroupHeading id={headingId}>Steps</GroupHeading>
      <div className="mt-2.5 rounded-[14px] border border-border bg-surface px-3.5 pt-1 pb-3">
        <SortableList
          items={rows}
          label="Steps"
          nameOf={(row) => row.step.text || "empty step"}
          onReorder={(key, afterKey) =>
            onChange(applyMove(rows, key, afterKey).map((row) => row.step))
          }
          className="flex flex-col"
          render={({ step }, { handle, index }) => (
            <div className="flex items-center gap-[11px] border-b border-border py-1">
              {handle}
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
            </div>
          )}
        />
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

function toggled(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/**
 * "Also add to" (handoff "Task copies"): the current plan's other sections and the other Day
 * Plans, multi-select. Saving makes one independent copy per pick. `alreadyIn` names the plans
 * left out because the task's section sits in them too, so a missing plan is never a mystery.
 */
export function CopyToField({
  planName,
  sectionName,
  sections,
  plans,
  alreadyIn,
  selectedSections,
  selectedPlans,
  minutes,
  smallerMinutes,
  neverShrink,
  survivalName,
  onSections,
  onPlans,
  coupled,
  onCoupled,
}: {
  planName: string;
  sectionName: string;
  sections: readonly Section[];
  plans: readonly DayPlan[];
  alreadyIn: readonly DayPlan[];
  selectedSections: readonly string[];
  selectedPlans: readonly string[];
  minutes: number;
  smallerMinutes: number | null;
  neverShrink: boolean;
  survivalName: string;
  onSections: (next: string[]) => void;
  onPlans: (next: string[]) => void;
  coupled: boolean;
  onCoupled: (next: boolean) => void;
}) {
  const headingId = useId();
  const coupledId = useId();
  const sectionsId = useId();
  const plansId = useId();
  if (sections.length === 0 && plans.length === 0 && alreadyIn.length === 0) return null;

  const allSections = sections.every((s) => selectedSections.includes(s.id));
  const survivalPicked = plans.some(
    (plan) => plan.kind === "survival" && selectedPlans.includes(plan.id),
  );
  const shownMinutes = displayMinutes(
    {
      minutes,
      never_shrink: neverShrink,
      smaller_versions: smallerMinutes === null ? {} : { minutes: smallerMinutes },
    },
    true,
  );
  return (
    <section aria-labelledby={headingId} className="mt-5">
      <GroupHeading id={headingId}>Also add to</GroupHeading>
      {sections.length > 0 ? (
        <>
          <p id={sectionsId} className="mt-2.5 text-[11.5px] font-semibold text-text-muted">
            Other sections in {planName}
          </p>
          <div role="group" aria-labelledby={sectionsId} className="mt-2 flex flex-wrap gap-[7px]">
            {sections.length > 1 ? (
              <ChoiceChip
                selected={allSections}
                onClick={() => onSections(allSections ? [] : sections.map((s) => s.id))}
              >
                All sections
              </ChoiceChip>
            ) : null}
            {sections.map((section) => (
              <ChoiceChip
                key={section.id}
                dot={section.color}
                selected={selectedSections.includes(section.id)}
                onClick={() => onSections(toggled(selectedSections, section.id))}
              >
                {section.name}
              </ChoiceChip>
            ))}
          </div>
        </>
      ) : null}
      {plans.length > 0 ? (
        <>
          <p id={plansId} className="mt-3 text-[11.5px] font-semibold text-text-muted">
            Other Day Plans
          </p>
          <div role="group" aria-labelledby={plansId} className="mt-2 flex flex-wrap gap-[7px]">
            {plans.map((plan) => (
              <ChoiceChip
                key={plan.id}
                selected={selectedPlans.includes(plan.id)}
                onClick={() => onPlans(toggled(selectedPlans, plan.id))}
              >
                {plan.name}
              </ChoiceChip>
            ))}
          </div>
        </>
      ) : null}
      {alreadyIn.length > 0 ? (
        <p className="mt-[9px] text-[11.5px] leading-normal text-text-muted">
          {sectionName} is also in {alreadyIn.map((plan) => plan.name).join(", ")}, so this task
          already shows there.
        </p>
      ) : null}
      {selectedSections.length + selectedPlans.length > 0 ? (
        <SwitchRow
          id={coupledId}
          title="Keep them coupled"
          description="Edits to this task update every copy."
          checked={coupled}
          onChange={onCoupled}
          className="mt-3 rounded-card border border-border bg-surface"
        />
      ) : null}
      {sections.length > 0 || plans.length > 0 ? (
        <p className="mt-[9px] text-[11.5px] leading-normal text-text-muted">
          {coupled && selectedSections.length + selectedPlans.length > 0
            ? "The copies share edits; ticking one leaves the others alone."
            : "Each copy is its own task, so ticking one leaves the others alone. A copy won't follow your edits unless you keep them coupled."}
          {survivalPicked ? ` In ${survivalName} plans it shows at about ${shownMinutes} min.` : ""}
        </p>
      ) : null}
    </section>
  );
}
