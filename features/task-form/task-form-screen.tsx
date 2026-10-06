"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId, useRef, useState, type ClipboardEvent } from "react";
import { InlineError } from "@/components/errors/inline-error";
import { Button } from "@/components/ui/button";
import { AddChip, ChoiceChip } from "@/components/ui/chip";
import { ConfirmDialog, PromptDialog } from "@/components/ui/confirm";
import { ContextCard, GroupHeading } from "@/components/ui/layout";
import { canGoBack } from "@/components/ui/navigation";
import { FormBar, ScreenRoot } from "@/components/ui/screen";
import { Sheet } from "@/components/ui/sheet";
import { SwitchRow } from "@/components/ui/toggle";
import { defaultContext } from "@/data/commands/context";
import { createSection, SECTION_COLORS } from "@/data/commands/sections";
import { createTask, deleteTask, importPastedList, updateTask } from "@/data/commands/tasks";
import { useEffectiveDayKey } from "@/data/hooks/use-day-key";
import { useTodaySnapshot, type TodaySnapshot } from "@/data/hooks/use-today-snapshot";
import { activePlans, homePlanOf, sectionRows } from "@/domain/organise";
import { importToast, parsePastedList, type PasteParseResult } from "@/domain/paste-parser";
import { resolveDayPlans } from "@/domain/today";
import type { DayKey, DayPlan } from "@/domain/types";
import { parseVideoUrl } from "@/domain/video";
import { AppError } from "@/lib/errors/app-error";
import { useRun } from "@/features/common";
import { FrequencyField } from "@/features/recurrence";
import { EmojiPicker } from "./emoji-picker";
import {
  inputClass,
  MinutesField,
  SmallerVersionField,
  StepsEditor,
  SurvivalCopyField,
} from "./fields";
import {
  isDirty,
  newTaskState,
  stateFromTask,
  toDraft,
  withName,
  type TaskFormState,
} from "./form-state";
import { PasteDialog } from "./paste-dialog";

const PAGE = "P03" as const;

/** New / Edit task (P03, handoff screens 10–11). `?id=` edits; `?section=` / `?plan=` preset. */
export function TaskFormScreen() {
  const params = useSearchParams();
  const dayKey = useEffectiveDayKey();
  const snapshot = useTodaySnapshot(dayKey);
  const id = params.get("id");
  const sectionParam = params.get("section");
  const planParam = params.get("plan");
  if (params.has("id") && !id) throw new AppError("RR-APP-004", { context: { param: "id" } });
  if (!snapshot || !dayKey) return <ScreenRoot pageId={PAGE} />;

  const task = id ? snapshot.tasks.find((t) => t.id === id && t.deleted_at === null) : undefined;
  if (id && !task) throw new AppError("RR-DB-005", { context: { entity: "task", pageId: PAGE } });

  // Which plan the form is "Creating in": the section's plan, else today's plan.
  const plans = activePlans(snapshot);
  const sectionId = task?.section_id ?? sectionParam;
  const fromSection = sectionId ? homePlanOf(snapshot, sectionId) : null;
  const requested = planParam ? (plans.find((p) => p.id === planParam) ?? null) : null;
  const today = resolveDayPlans(snapshot.plans, snapshot.dayRecord, snapshot.settings).activePlan;
  const plan = requested ?? fromSection ?? today ?? plans[0] ?? null;
  const firstSection = plan ? (sectionRows(snapshot, plan.id)[0]?.section.id ?? null) : null;
  const initial = task
    ? stateFromTask(task, plan?.id ?? null)
    : newTaskState(plan?.id ?? null, sectionParam ?? firstSection);

  return (
    <TaskForm
      key={id ?? `new:${params.toString()}`}
      taskId={task?.id ?? null}
      initial={initial}
      snapshot={snapshot}
      dayKey={dayKey}
      sharedText={params.get("text")}
      pasteHint={params.get("paste") === "1"}
    />
  );
}

function TaskForm({
  taskId,
  initial,
  snapshot,
  dayKey,
  sharedText,
  pasteHint,
}: {
  taskId: string | null;
  initial: TaskFormState;
  snapshot: TodaySnapshot;
  dayKey: DayKey;
  sharedText: string | null;
  pasteHint: boolean;
}) {
  const router = useRouter();
  const run = useRun(PAGE);
  // Text shared from another app (Android share sheet, Phase 3) runs the same paste dialog.
  const shared = sharedText ? parsePastedList(sharedText, initial.minutes) : null;
  const [state, setState] = useState(() =>
    sharedText && shared === null ? withName(initial, sharedText.trim().slice(0, 80)) : initial,
  );
  const [error, setError] = useState<AppError | null>(() =>
    shared && "tooLong" in shared
      ? new AppError("RR-IMP-002", { context: { lines: shared.lineCount } })
      : null,
  );
  const [videoError, setVideoError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paste, setPaste] = useState<PasteParseResult | null>(() =>
    shared && !("tooLong" in shared) ? shared : null,
  );
  const [sheet, setSheet] = useState<
    "emoji" | "plan" | "new-section" | "discard" | "delete" | null
  >(null);
  const [sectionError, setSectionError] = useState<AppError | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const ids = {
    name: useId(),
    hard: useId(),
    freq: useId(),
    section: useId(),
    notes: useId(),
    where: useId(),
  };
  const survivalName = snapshot.settings.survivalName;
  const isEdit = taskId !== null;
  const update = (patch: Partial<TaskFormState>) => setState((s) => ({ ...s, ...patch }));

  const plans = activePlans(snapshot);
  const plan: DayPlan | null = plans.find((p) => p.id === state.planId) ?? null;
  const sections = plan ? sectionRows(snapshot, plan.id).map((r) => r.section) : [];
  // The task's own section may live only in another plan; keep it pickable.
  const currentSection = snapshot.sections.find(
    (s) => s.id === state.sectionId && s.deleted_at === null,
  );
  const sectionChoices =
    currentSection && !sections.some((s) => s.id === currentSection.id)
      ? [currentSection, ...sections]
      : sections;
  const survivalPlans = plans
    .filter((p) => p.kind === "survival")
    .sort((a, b) => (a.survival_level ?? 0) - (b.survival_level ?? 0));

  const showError = (next: AppError) => {
    setError(next);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const leave = (fallback: string) => {
    if (canGoBack()) router.back();
    else router.replace(fallback);
  };

  const tryPaste = (text: string): boolean => {
    const parsed = parsePastedList(text, state.minutes);
    if (parsed === null) return false;
    if ("tooLong" in parsed) {
      showError(new AppError("RR-IMP-002", { context: { lines: parsed.lineCount } }));
      return true;
    }
    setPaste(parsed);
    return true;
  };

  const onNamePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (tryPaste(text)) event.preventDefault();
  };

  const importAs = async (choice: "separate" | "one") => {
    if (!paste) return;
    const drafts =
      choice === "separate" ? paste.asSeparateTasks : paste.asOneTask ? [paste.asOneTask] : [];
    setPaste(null);
    if (!state.sectionId) return showError(new AppError("RR-VAL-010"));
    const result = await run(
      importPastedList(defaultContext(), { sectionId: state.sectionId, tasks: drafts }),
      { onInputError: showError, success: () => importToast(drafts) },
    );
    if (result.ok) router.replace("/");
  };

  const save = async () => {
    setError(null);
    if (!state.sectionId) return showError(new AppError("RR-VAL-010"));
    if (state.videoUrl.trim() && !parseVideoUrl(state.videoUrl)) {
      setVideoError(true);
      return showError(new AppError("RR-VAL-003"));
    }
    setSaving(true);
    const ctx = defaultContext();
    const draft = toDraft(state, state.sectionId);
    const copied = (names: readonly string[]) =>
      names.length ? ` · copied to ${names.join(", ")}` : "";
    if (isEdit) {
      const result = await run(
        updateTask(ctx, { taskId, draft, copyToLevels: state.copyToLevels }),
        {
          onInputError: showError,
          success: (v) => `Saved${copied(v.copiedTo)}`,
        },
      );
      setSaving(false);
      if (result.ok) leave(`/task/?id=${encodeURIComponent(taskId)}`);
    } else {
      const result = await run(createTask(ctx, { draft, copyToLevels: state.copyToLevels }), {
        onInputError: showError,
        success: (v) => `Added to ${v.sectionName}${copied(v.copiedTo)}`,
      });
      setSaving(false);
      if (result.ok) router.replace("/");
    }
  };

  const cancel = () => {
    if (isDirty(initial, state)) setSheet("discard");
    else leave(isEdit ? `/task/?id=${encodeURIComponent(taskId)}` : "/");
  };

  const planLabel = plan
    ? `${plan.name} · ${plan.kind === "primary" ? "primary Day Plan" : plan.kind === "survival" ? survivalName : "Day Plan"}`
    : "No Day Plan";

  return (
    <ScreenRoot pageId={PAGE} className="pb-12">
      <FormBar
        title={isEdit ? "Edit task" : "New task"}
        onCancel={cancel}
        onSave={() => void save()}
        busy={saving}
      />
      <div ref={topRef} className="scroll-mt-20 px-3.5 pt-3.5">
        {error ? <InlineError error={error} pageId={PAGE} className="mb-3.5" /> : null}
        <ContextCard
          label={isEdit ? "Editing in" : "Creating in"}
          value={planLabel}
          action={
            plans.length > 1 ? (
              <button
                type="button"
                onClick={() => setSheet("plan")}
                className="min-h-11 shrink-0 px-1 text-[12px] font-semibold text-primary-light"
              >
                Change
              </button>
            ) : undefined
          }
        />

        <div className="mt-3.5 flex items-center gap-2.5">
          <button
            type="button"
            aria-label={`Icon ${state.emoji}, change`}
            onClick={() => setSheet("emoji")}
            className="flex size-[52px] shrink-0 items-center justify-center rounded-card border border-border bg-surface text-2xl"
          >
            {state.emoji}
          </button>
          <label htmlFor={ids.name} className="sr-only">
            Task name
          </label>
          <input
            id={ids.name}
            value={state.name}
            maxLength={80}
            // The name is the form's whole point: start there (and pasting a list needs focus).
            autoFocus={!isEdit}
            placeholder={pasteHint ? "Paste your list here" : "What is it?"}
            onChange={(event) => update(withName(state, event.target.value))}
            onPaste={onNamePaste}
            className="min-h-[52px] min-w-0 flex-1 rounded-[14px] border-[1.5px] border-primary bg-surface px-4 text-[15px] font-medium text-ink shadow-selected outline-none placeholder:text-text-faint"
          />
        </div>
        {pasteHint ? (
          <p className="mt-2 text-[11.5px] text-text-muted">
            Paste two or more lines and you can add them as separate tasks or one task with
            subtasks.
          </p>
        ) : null}

        <MinutesField value={state.minutes} onChange={(minutes) => update({ minutes })} />

        <div className="mt-4 rounded-[14px] border border-border bg-surface">
          <SwitchRow
            id={ids.hard}
            title="Hard task"
            description="Labelled on the card and listed under Extra Support"
            checked={state.hard}
            onChange={(hard) => update({ hard })}
          />
        </div>

        <section aria-labelledby={ids.section} className="mt-5">
          <GroupHeading id={ids.section}>Section</GroupHeading>
          <div
            role="group"
            aria-labelledby={ids.section}
            className="mt-2.5 flex flex-wrap gap-[7px]"
          >
            {sectionChoices.map((section) => (
              <ChoiceChip
                key={section.id}
                dot={section.color}
                selected={state.sectionId === section.id}
                onClick={() => update({ sectionId: section.id })}
              >
                {section.name}
              </ChoiceChip>
            ))}
            {plan ? (
              <AddChip
                onClick={() => {
                  setSectionError(null);
                  setSheet("new-section");
                }}
              >
                + New section
              </AddChip>
            ) : null}
          </div>
        </section>

        <StepsEditor steps={state.steps} onChange={(steps) => update({ steps })} />

        <section aria-labelledby={ids.notes} className="mt-5">
          <GroupHeading id={ids.notes}>Notes</GroupHeading>
          <div className="mt-2.5 rounded-[14px] border border-l-[3px] border-border border-l-primary bg-surface px-[15px] py-[13px]">
            <input
              aria-label="Mantra"
              value={state.mantra}
              maxLength={300}
              placeholder="One line that gets you moving"
              onChange={(event) => update({ mantra: event.target.value })}
              className="w-full bg-transparent text-[13px] leading-normal font-bold text-primary outline-none placeholder:font-semibold placeholder:text-text-faint"
            />
            <textarea
              aria-label="Notes"
              value={state.notes}
              rows={2}
              maxLength={4000}
              placeholder="Anything else"
              onChange={(event) => update({ notes: event.target.value })}
              className="mt-[7px] w-full resize-none bg-transparent text-[13.5px] leading-[1.55] text-ink-muted outline-none placeholder:text-text-faint"
            />
            <div className="mt-2 border-t border-border pt-3">
              <input
                aria-label="Video link"
                aria-invalid={videoError}
                inputMode="url"
                value={state.videoUrl}
                maxLength={500}
                placeholder="Paste a YouTube or TikTok link"
                onChange={(event) => {
                  setVideoError(false);
                  update({ videoUrl: event.target.value });
                }}
                onBlur={() =>
                  setVideoError(state.videoUrl.trim() !== "" && !parseVideoUrl(state.videoUrl))
                }
                className="w-full bg-transparent text-[13px] text-ink-muted outline-none placeholder:text-text-faint"
              />
              {videoError ? (
                <InlineError error={new AppError("RR-VAL-003")} pageId={PAGE} className="mt-2" />
              ) : null}
            </div>
          </div>
        </section>

        <section aria-labelledby={ids.where} className="mt-5">
          <GroupHeading id={ids.where}>Location</GroupHeading>
          <input
            aria-labelledby={ids.where}
            value={state.location}
            maxLength={120}
            placeholder="Where does it happen?"
            onChange={(event) => update({ location: event.target.value })}
            className={`${inputClass} mt-2.5`}
          />
        </section>

        <section aria-labelledby={ids.freq} className="mt-5">
          <GroupHeading id={ids.freq}>Frequency</GroupHeading>
          <FrequencyField
            value={state.recurrence}
            today={dayKey}
            labelledBy={ids.freq}
            onChange={(recurrence) => update({ recurrence })}
          />
        </section>

        <SmallerVersionField
          minutes={state.minutes}
          smallerMinutes={state.smallerMinutes}
          smallerText={state.smallerText}
          neverShrink={state.neverShrink}
          survivalName={survivalName}
          onChange={(patch) => update(patch)}
        />

        <SurvivalCopyField
          plans={survivalPlans}
          selected={state.copyToLevels}
          minutes={state.minutes}
          survivalName={survivalName}
          onChange={(copyToLevels) => update({ copyToLevels })}
        />

        {isEdit ? (
          <Button
            variant="tint"
            className="mt-6 min-h-[52px] w-full"
            onClick={() => setSheet("delete")}
          >
            Delete task
          </Button>
        ) : null}
      </div>

      {sheet === "emoji" ? (
        <EmojiPicker
          current={state.emoji}
          onClose={() => setSheet(null)}
          onPick={(emoji) => {
            update({ emoji, emojiChosen: true });
            setSheet(null);
          }}
        />
      ) : null}
      {sheet === "plan" ? (
        <Sheet title={isEdit ? "Editing in" : "Creating in"} onClose={() => setSheet(null)}>
          <div className="flex flex-wrap gap-[7px]">
            {plans.map((p) => (
              <ChoiceChip
                key={p.id}
                selected={p.id === state.planId}
                onClick={() => {
                  const first = sectionRows(snapshot, p.id)[0]?.section.id ?? null;
                  update({ planId: p.id, sectionId: isEdit ? state.sectionId : first });
                  setSheet(null);
                }}
              >
                {p.name}
              </ChoiceChip>
            ))}
          </div>
        </Sheet>
      ) : null}
      {sheet === "new-section" && plan ? (
        <PromptDialog
          title="New section"
          label="Section name"
          placeholder="Morning, Wind down, Out the house…"
          maxLength={80}
          submitLabel="Add section"
          error={sectionError ? <InlineError error={sectionError} pageId={PAGE} /> : undefined}
          onCancel={() => setSheet(null)}
          onSubmit={(name) =>
            void run(
              createSection(defaultContext(), {
                draft: {
                  name,
                  description: "",
                  color:
                    SECTION_COLORS[sections.length % SECTION_COLORS.length] ?? SECTION_COLORS[0],
                  startTime: null,
                  recurrence: null,
                  lengthOverride: null,
                  notifyOnStart: true,
                  notifyBeforeClose: true,
                  closingLeadMinutes: 15,
                  planIds: [plan.id],
                },
              }),
              { onInputError: setSectionError, success: (v) => `Added section ${v.name}` },
            ).then((result) => {
              if (!result.ok) return;
              update({ sectionId: result.value.sectionId });
              setSheet(null);
            })
          }
        />
      ) : null}
      {sheet === "discard" ? (
        <ConfirmDialog
          title="Discard changes?"
          body="What you typed here isn't saved yet."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          onCancel={() => setSheet(null)}
          onConfirm={() => {
            setSheet(null);
            leave(isEdit ? `/task/?id=${encodeURIComponent(taskId)}` : "/");
          }}
        />
      ) : null}
      {sheet === "delete" && taskId ? (
        <ConfirmDialog
          title={`Delete “${initial.name}”?`}
          body="The task and its steps are removed for good. You can skip it for today instead."
          confirmLabel="Delete task"
          onCancel={() => setSheet(null)}
          onConfirm={() => {
            setSheet(null);
            void run(deleteTask(defaultContext(), { taskId }), {
              success: `Deleted ${initial.name}`,
            }).then((r) => {
              if (r.ok) router.replace("/");
            });
          }}
        />
      ) : null}
      {paste ? (
        <PasteDialog
          parsed={paste}
          onCancel={() => setPaste(null)}
          onSeparate={() => void importAs("separate")}
          onOne={() => void importAs("one")}
        />
      ) : null}
    </ScreenRoot>
  );
}
