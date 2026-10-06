"use client";

import { Check, Clock } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useRef, useState } from "react";
import { InlineError } from "@/components/errors/inline-error";
import { ChoiceChip } from "@/components/ui/chip";
import { ConfirmDialog } from "@/components/ui/confirm";
import { ContextCard, GroupHeading } from "@/components/ui/layout";
import { canGoBack } from "@/components/ui/navigation";
import { FormBar, ScreenRoot } from "@/components/ui/screen";
import { SwitchRow } from "@/components/ui/toggle";
import { defaultContext } from "@/data/commands/context";
import { createSection, SECTION_COLORS, updateSection } from "@/data/commands/sections";
import { useEffectiveDayKey } from "@/data/hooks/use-day-key";
import { useTodaySnapshot, type TodaySnapshot } from "@/data/hooks/use-today-snapshot";
import { formatDuration } from "@/domain/duration";
import { activePlans, plansOfSection, tasksOfSection } from "@/domain/organise";
import { resolveDayPlans } from "@/domain/today";
import type { DayKey, Recurrence, Section } from "@/domain/types";
import { AppError } from "@/lib/errors/app-error";
import { isNativePlatform } from "@/lib/platform/platform";
import { useRun } from "@/features/common";
import { FrequencyField } from "@/features/recurrence";

const PAGE = "P04" as const;
const TIMES = ["06:30", "07:00", "09:30", "18:00", "21:00"] as const;
const LENGTHS = [15, 30, 45, 60, 90] as const;
const LEADS = [5, 10, 15, 30] as const;

interface SectionFormState {
  readonly name: string;
  readonly description: string;
  readonly color: string;
  readonly startTime: string | null;
  readonly recurrence: Recurrence | null;
  readonly lengthOverride: number | null;
  readonly notifyOnStart: boolean;
  readonly notifyBeforeClose: boolean;
  readonly closingLead: number;
  readonly otherPlanIds: readonly string[];
}

/** Spoken names for SECTION_COLORS, in the same order. */
const COLOR_NAMES = ["Amber", "Raspberry", "Purple", "Blue", "Green"] as const;
function fromSection(
  section: Section,
  contextPlanId: string,
  linked: readonly string[],
): SectionFormState {
  return {
    name: section.name,
    description: section.description,
    color: section.color,
    startTime: section.start_time,
    recurrence: section.recurrence,
    lengthOverride: section.length_override_minutes,
    notifyOnStart: section.notify_on_start,
    notifyBeforeClose: section.notify_before_close,
    closingLead: section.closing_lead_minutes ?? 15,
    otherPlanIds: linked.filter((id) => id !== contextPlanId),
  };
}

function blank(colorIndex: number): SectionFormState {
  return {
    name: "",
    description: "",
    color: SECTION_COLORS[colorIndex % SECTION_COLORS.length] ?? SECTION_COLORS[0],
    startTime: "07:00",
    recurrence: null,
    lengthOverride: null,
    notifyOnStart: true,
    notifyBeforeClose: true,
    closingLead: 15,
    otherPlanIds: [],
  };
}

/** Add / edit section (P04, handoff screen 12). `?id=` edits; `?plan=` is the Day Plan it's in. */
export function SectionFormScreen() {
  const params = useSearchParams();
  const dayKey = useEffectiveDayKey();
  const snapshot = useTodaySnapshot(dayKey);
  const id = params.get("id");
  if (params.has("id") && !id) throw new AppError("RR-APP-004", { context: { param: "id" } });
  if (!snapshot || !dayKey) return <ScreenRoot pageId={PAGE} />;

  const section = id
    ? snapshot.sections.find((s) => s.id === id && s.deleted_at === null)
    : undefined;
  if (id && !section)
    throw new AppError("RR-DB-005", { context: { entity: "section", pageId: PAGE } });

  const plans = activePlans(snapshot);
  const linked = section ? plansOfSection(snapshot, section.id).map((p) => p.id) : [];
  const requested = params.get("plan");
  const today = resolveDayPlans(snapshot.plans, snapshot.dayRecord, snapshot.settings).activePlan;
  const contextPlanId =
    (requested && plans.some((p) => p.id === requested) ? requested : null) ??
    linked[0] ??
    today?.id ??
    plans[0]?.id ??
    null;
  if (!contextPlanId)
    throw new AppError("RR-DB-005", { context: { entity: "day_plan", pageId: PAGE } });

  const initial = section
    ? fromSection(section, contextPlanId, linked)
    : blank(
        snapshot.planSections.filter((l) => l.plan_id === contextPlanId && l.deleted_at === null)
          .length,
      );
  return (
    <SectionForm
      key={id ?? `new:${contextPlanId}`}
      section={section ?? null}
      contextPlanId={contextPlanId}
      initial={initial}
      snapshot={snapshot}
      dayKey={dayKey}
    />
  );
}

function SectionForm({
  section,
  contextPlanId,
  initial,
  snapshot,
  dayKey,
}: {
  section: Section | null;
  contextPlanId: string;
  initial: SectionFormState;
  snapshot: TodaySnapshot;
  dayKey: DayKey;
}) {
  const router = useRouter();
  const run = useRun(PAGE);
  const [state, setState] = useState(initial);
  const [error, setError] = useState<AppError | null>(null);
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const ids = {
    name: useId(),
    desc: useId(),
    color: useId(),
    custom: useId(),
    time: useId(),
    timeInput: useId(),
    length: useId(),
    lengthInput: useId(),
    repeats: useId(),
    reminders: useId(),
    plans: useId(),
  };
  const update = (patch: Partial<SectionFormState>) => setState((s) => ({ ...s, ...patch }));
  const plans = activePlans(snapshot);
  const contextPlan = plans.find((p) => p.id === contextPlanId);
  const fromTasks = section
    ? tasksOfSection(snapshot, section.id).reduce((sum, t) => sum + t.minutes, 0)
    : 0;
  const customColor = !(SECTION_COLORS as readonly string[]).includes(state.color);
  const fallback = "/";

  const leave = () => {
    if (canGoBack()) router.back();
    else router.replace(fallback);
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    const draft = {
      name: state.name,
      description: state.description,
      color: state.color,
      startTime: state.startTime,
      recurrence: state.recurrence,
      lengthOverride: state.lengthOverride,
      notifyOnStart: state.notifyOnStart,
      notifyBeforeClose: state.notifyBeforeClose,
      closingLeadMinutes: state.closingLead,
      planIds: [contextPlanId, ...state.otherPlanIds],
    };
    const onInputError = (next: AppError) => {
      setError(next);
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const result = section
      ? await run(updateSection(defaultContext(), { sectionId: section.id, draft }), {
          onInputError,
          success: "Section saved",
        })
      : await run(createSection(defaultContext(), { draft }), {
          onInputError,
          success:
            state.otherPlanIds.length > 0
              ? "Section saved and added to your other Day Plans"
              : "Section saved",
        });
    setSaving(false);
    if (result.ok) leave();
  };

  return (
    <ScreenRoot pageId={PAGE} className="pb-12">
      <FormBar
        title={section ? "Edit section" : "Add section"}
        onCancel={() =>
          JSON.stringify(initial) !== JSON.stringify(state) ? setDiscard(true) : leave()
        }
        onSave={() => void save()}
        busy={saving}
      />
      <div ref={topRef} className="scroll-mt-20 px-3.5 pt-3.5">
        {error ? <InlineError error={error} pageId={PAGE} className="mb-3.5" /> : null}
        <ContextCard label="Section in" value={contextPlan?.name ?? "Day Plan"} />

        <GroupHeading as="h2" className="mt-5">
          <label htmlFor={ids.name}>Name</label>
        </GroupHeading>
        <input
          id={ids.name}
          value={state.name}
          maxLength={80}
          // Naming the section is the first thing to do on this form.
          autoFocus={!section}
          placeholder="Morning, Wind down, Out the house…"
          onChange={(event) => update({ name: event.target.value })}
          className="mt-2.5 min-h-[52px] w-full rounded-[14px] border-[1.5px] border-primary bg-surface px-4 text-[15px] font-medium text-ink shadow-selected outline-none placeholder:text-text-faint"
        />

        <GroupHeading as="h2" className="mt-5">
          <label htmlFor={ids.desc}>
            Description{" "}
            <span className="text-[13px] font-medium tracking-normal text-text-faint">
              optional
            </span>
          </label>
        </GroupHeading>
        <textarea
          id={ids.desc}
          rows={2}
          maxLength={4000}
          value={state.description}
          placeholder="What is this section for?"
          onChange={(event) => update({ description: event.target.value })}
          className="mt-2.5 w-full resize-none rounded-[14px] border border-border bg-surface px-[15px] py-[13px] text-[13.5px] leading-normal text-ink-muted outline-none placeholder:text-text-faint focus:border-primary"
        />

        <section aria-labelledby={ids.color} className="mt-5">
          <GroupHeading id={ids.color}>Colour</GroupHeading>
          <div
            role="group"
            aria-labelledby={ids.color}
            className="mt-2.5 flex flex-wrap items-center gap-[9px]"
          >
            {SECTION_COLORS.map((color, index) => (
              <button
                key={color}
                type="button"
                aria-label={COLOR_NAMES[index] ?? `Colour ${index + 1}`}
                aria-pressed={state.color === color}
                onClick={() => update({ color })}
                className={`flex size-11 items-center justify-center rounded-xl ${state.color === color ? "ring-2 ring-ink ring-offset-2" : ""}`}
                style={{ background: color }}
              >
                {state.color === color ? (
                  <Check size={16} strokeWidth={3} className="text-white" aria-hidden />
                ) : null}
              </button>
            ))}
            <label
              htmlFor={ids.custom}
              className={`relative flex size-11 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-[1.5px] border-dashed border-border-strong ${customColor ? "ring-2 ring-ink ring-offset-2" : ""}`}
              style={customColor ? { background: state.color } : undefined}
            >
              <span aria-hidden className="text-[15px] font-bold text-text-faint">
                +
              </span>
              <span className="sr-only">Custom colour</span>
              <input
                id={ids.custom}
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(state.color) ? state.color : "#e5134a"}
                onChange={(event) => update({ color: event.target.value })}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
          <p className="mt-2 text-[11.5px] text-text-muted">Tap + for a custom colour.</p>
        </section>

        <section aria-labelledby={ids.time} className="mt-5">
          <GroupHeading id={ids.time}>Starts at</GroupHeading>
          <div
            role="group"
            aria-labelledby={ids.time}
            className="mt-2.5 flex flex-wrap items-center gap-[7px]"
          >
            {TIMES.map((time) => (
              <ChoiceChip
                key={time}
                selected={state.startTime === time}
                onClick={() => update({ startTime: time })}
              >
                {time}
              </ChoiceChip>
            ))}
            <label
              htmlFor={ids.timeInput}
              className={`flex min-h-10 items-center gap-1.5 rounded-full border-[1.5px] border-dashed px-3 text-text-muted ${state.startTime && !(TIMES as readonly string[]).includes(state.startTime) ? "border-primary" : "border-border-strong"}`}
            >
              <Clock size={12} strokeWidth={1.7} aria-hidden />
              <span className="sr-only">Other time</span>
              <input
                id={ids.timeInput}
                type="time"
                value={state.startTime ?? ""}
                onChange={(event) => update({ startTime: event.target.value || null })}
                className="w-[84px] bg-transparent text-[12.5px] font-semibold text-ink outline-none"
              />
            </label>
            <ChoiceChip
              selected={state.startTime === null}
              onClick={() => update({ startTime: null })}
            >
              No set time
            </ChoiceChip>
          </div>
        </section>

        <section aria-labelledby={ids.length} className="mt-5">
          <GroupHeading id={ids.length}>Length</GroupHeading>
          <div className="mt-2.5 rounded-card border border-border bg-surface">
            <SwitchRow
              id={`${ids.length}-set`}
              title="Set it myself"
              description={`Otherwise: ${formatDuration(fromTasks)} from its tasks`}
              checked={state.lengthOverride !== null}
              onChange={(on) => update({ lengthOverride: on ? fromTasks || 30 : null })}
            />
            {state.lengthOverride !== null ? (
              <div className="flex flex-wrap items-center gap-[7px] border-t border-border px-[15px] py-3.5">
                {LENGTHS.map((m) => (
                  <ChoiceChip
                    key={m}
                    selected={state.lengthOverride === m}
                    onClick={() => update({ lengthOverride: m })}
                  >
                    {formatDuration(m)}
                  </ChoiceChip>
                ))}
                <label
                  htmlFor={ids.lengthInput}
                  className="flex min-h-10 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-border-strong px-3 text-[12px] text-text-muted"
                >
                  <input
                    id={ids.lengthInput}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={600}
                    value={state.lengthOverride}
                    onChange={(event) =>
                      update({
                        lengthOverride: Math.min(
                          600,
                          Math.max(1, Math.round(Number(event.target.value) || 1)),
                        ),
                      })
                    }
                    className="w-12 bg-transparent text-[12.5px] font-semibold text-ink outline-none"
                  />
                  min
                </label>
              </div>
            ) : null}
          </div>
        </section>

        <section aria-labelledby={ids.repeats} className="mt-5">
          <GroupHeading id={ids.repeats}>Repeats</GroupHeading>
          <FrequencyField
            value={state.recurrence}
            today={dayKey}
            labelledBy={ids.repeats}
            onChange={(recurrence) => update({ recurrence })}
          />
        </section>

        <section aria-labelledby={ids.reminders} className="mt-5">
          <GroupHeading id={ids.reminders}>Reminders</GroupHeading>
          <div className="mt-2.5 divide-y divide-border rounded-card border border-border bg-surface">
            <SwitchRow
              id={`${ids.reminders}-start`}
              title="When it starts"
              description="Names the first task still to do"
              checked={state.notifyOnStart}
              onChange={(notifyOnStart) => update({ notifyOnStart })}
            />
            <SwitchRow
              id={`${ids.reminders}-close`}
              title="Before it closes"
              description="Lists what's still unticked before the next section"
              checked={state.notifyBeforeClose}
              onChange={(notifyBeforeClose) => update({ notifyBeforeClose })}
            />
            {state.notifyBeforeClose ? (
              <div
                role="group"
                aria-label="How long before"
                className="flex flex-wrap gap-[7px] px-[15px] py-3.5"
              >
                {LEADS.map((m) => (
                  <ChoiceChip
                    key={m}
                    selected={state.closingLead === m}
                    onClick={() => update({ closingLead: m })}
                  >
                    {m} min before
                  </ChoiceChip>
                ))}
              </div>
            ) : null}
          </div>
          {isNativePlatform() ? null : (
            <p className="mt-2 text-[11.5px] text-text-muted">
              Reminders arrive on the Android app.
            </p>
          )}
        </section>

        {plans.length > 1 ? (
          <section aria-labelledby={ids.plans} className="mt-5">
            <GroupHeading id={ids.plans}>Also in</GroupHeading>
            <div
              role="group"
              aria-labelledby={ids.plans}
              className="mt-2.5 flex flex-wrap gap-[7px]"
            >
              {plans
                .filter((p) => p.id !== contextPlanId)
                .map((p) => {
                  const on = state.otherPlanIds.includes(p.id);
                  return (
                    <ChoiceChip
                      key={p.id}
                      selected={on}
                      onClick={() =>
                        update({
                          otherPlanIds: on
                            ? state.otherPlanIds.filter((id) => id !== p.id)
                            : [...state.otherPlanIds, p.id],
                        })
                      }
                    >
                      {p.name}
                    </ChoiceChip>
                  );
                })}
            </div>
            <p className="mt-[9px] text-[11.5px] leading-normal text-text-muted">
              It&apos;s the same section in every Day Plan you pick: change it once and it changes
              everywhere.
            </p>
          </section>
        ) : null}
      </div>
      {discard ? (
        <ConfirmDialog
          title="Discard changes?"
          body="What you typed here isn't saved yet."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          onCancel={() => setDiscard(false)}
          onConfirm={() => {
            setDiscard(false);
            leave();
          }}
        />
      ) : null}
    </ScreenRoot>
  );
}
