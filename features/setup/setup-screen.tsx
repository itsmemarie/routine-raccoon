"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { InlineError } from "@/components/errors/inline-error";
import { Button } from "@/components/ui/button";
import { ChoiceChip } from "@/components/ui/chip";
import { canGoBack } from "@/components/ui/navigation";
import { ScreenRoot } from "@/components/ui/screen";
import { defaultContext } from "@/data/commands/context";
import { createSection, SECTION_COLORS } from "@/data/commands/sections";
import { createTask, DEFAULT_MANTRA } from "@/data/commands/tasks";
import { useEffectiveDayKey } from "@/data/hooks/use-day-key";
import { useTodaySnapshot } from "@/data/hooks/use-today-snapshot";
import { defaultSmallerMinutes } from "@/domain/duration";
import { suggestEmoji } from "@/domain/emoji";
import { sectionRows } from "@/domain/organise";
import { primaryPlan } from "@/domain/survival";
import { AppError } from "@/lib/errors/app-error";
import { useRun } from "@/features/common";

const PAGE = "P15" as const;

interface Answers {
  readonly avoiding: string;
  readonly feeling: string;
  readonly smaller: string;
  readonly firstAction: string;
  readonly minutes: number;
}

const EMPTY: Answers = { avoiding: "", feeling: "", smaller: "", firstAction: "", minutes: 10 };

const QUESTIONS = [
  {
    key: "avoiding",
    title: "What am I avoiding?",
    hint: "The thing that keeps sliding to tomorrow. It becomes a hard task.",
    placeholder: "Book the dentist",
  },
  {
    key: "feeling",
    title: "What feeling or thought makes me avoid it?",
    hint: "Naming it takes some of its power away. It's saved in the task's notes.",
    placeholder: "I'll have to explain why I haven't been in years",
  },
  {
    key: "smaller",
    title: "What's the smaller version?",
    hint: "What you'd do on a bad day instead. It becomes the task's smaller version.",
    placeholder: "Find the number and save it",
  },
  {
    key: "firstAction",
    title: "What's the first physical action?",
    hint: "Something your hands do, not a decision. It becomes the first step.",
    placeholder: "Pick up the phone",
  },
] as const;

/**
 * Setup (P15, PRD R12): five questions, one per screen, that turn something avoided into a
 * small first step. Q1/Q2 make a hard task, Q3 the smaller version, Q4 the first subtask,
 * Q5 the timer length. Runs from the first-launch card and from Settings.
 */
export function SetupScreen() {
  const router = useRouter();
  const run = useRun(PAGE);
  const dayKey = useEffectiveDayKey();
  const snapshot = useTodaySnapshot(dayKey);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [saving, setSaving] = useState(false);
  const fieldId = useId();

  if (!snapshot) return <ScreenRoot pageId={PAGE} />;
  const plan = primaryPlan(snapshot.plans);
  const sections = plan ? sectionRows(snapshot, plan.id).map((r) => r.section) : [];
  const chosen = sectionId ?? sections[0]?.id ?? null;
  const total = QUESTIONS.length + 2; // four text questions, the minutes question, the review

  const leave = () => (canGoBack() ? router.back() : router.replace("/"));
  const next = () => {
    setError(null);
    if (step === 0 && answers.avoiding.trim() === "") {
      setError(new AppError("RR-VAL-001"));
      return;
    }
    setStep((s) => Math.min(total - 1, s + 1));
  };

  const save = async () => {
    if (!plan) return setError(new AppError("RR-DB-005", { context: { entity: "day_plan" } }));
    setSaving(true);
    const ctx = defaultContext();
    let target = chosen;
    if (!target) {
      const created = await run(
        createSection(ctx, {
          draft: {
            name: "Smash it",
            description: "The one you keep putting off.",
            color: SECTION_COLORS[1],
            startTime: "09:30",
            recurrence: null,
            lengthOverride: null,
            notifyOnStart: true,
            notifyBeforeClose: true,
            closingLeadMinutes: 15,
            planIds: [plan.id],
          },
        }),
      );
      if (!created.ok) return setSaving(false);
      target = created.value.sectionId;
      // If saving the task fails, a retry uses this section instead of making another.
      setSectionId(target);
    }
    const name = answers.avoiding.trim();
    const result = await run(
      createTask(ctx, {
        draft: {
          name,
          emoji: suggestEmoji(name),
          minutes: answers.minutes,
          hard: true,
          sectionId: target,
          steps: answers.firstAction.trim() ? [{ text: answers.firstAction }] : [],
          mantra: DEFAULT_MANTRA,
          notes: answers.feeling.trim() ? `Why I avoid it: ${answers.feeling.trim()}` : "",
          videoUrl: "",
          location: "",
          recurrence: null,
          neverShrink: false,
          smaller: { minutes: null, text: answers.smaller },
        },
        copyToLevels: [],
      }),
      { onInputError: setError, success: (v) => `Added to ${v.sectionName}` },
    );
    setSaving(false);
    if (result.ok) router.replace("/");
  };

  const question = step < QUESTIONS.length ? QUESTIONS[step] : null;

  return (
    <ScreenRoot
      pageId={PAGE}
      className="flex min-h-dvh flex-col px-5 pt-[max(18px,env(safe-area-inset-top))] pb-8"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={leave}
          className="-ml-2 min-h-11 px-2 text-[13px] font-semibold text-text-muted"
        >
          Close
        </button>
        <span className="text-[12px] font-semibold text-text-muted" aria-live="polite">
          {step + 1} of {total}
        </span>
      </div>
      <div aria-hidden className="mt-2 flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-toggle-off"}`}
          />
        ))}
      </div>

      <div className="mt-8 flex-1">
        {error ? <InlineError error={error} pageId={PAGE} className="mb-4" /> : null}
        {question ? (
          <>
            <h1 className="font-display text-[28px] leading-[1.1] font-bold tracking-[-0.03em] text-ink">
              <label htmlFor={fieldId}>{question.title}</label>
            </h1>
            <p className="mt-2.5 text-[13.5px] leading-[1.6] text-text-muted">{question.hint}</p>
            <textarea
              key={question.key}
              id={fieldId}
              // Each question screen is about this one field.
              autoFocus
              rows={3}
              maxLength={question.key === "avoiding" ? 80 : 300}
              value={answers[question.key]}
              placeholder={question.placeholder}
              onChange={(event) =>
                setAnswers((a) => ({ ...a, [question.key]: event.target.value }))
              }
              className="mt-5 w-full resize-none rounded-[14px] border-[1.5px] border-primary bg-surface px-4 py-3.5 text-[15px] leading-normal text-ink shadow-selected outline-none placeholder:text-text-faint"
            />
          </>
        ) : step === QUESTIONS.length ? (
          <>
            <h1 className="font-display text-[28px] leading-[1.1] font-bold tracking-[-0.03em] text-ink">
              Can I do just 5–10 minutes?
            </h1>
            <p className="mt-2.5 text-[13.5px] leading-[1.6] text-text-muted">
              That&apos;s the timer when you start it. Stopping after is allowed.
            </p>
            <div role="group" aria-label="Minutes" className="mt-5 flex flex-wrap gap-2">
              {[5, 10, 15].map((m) => (
                <ChoiceChip
                  key={m}
                  selected={answers.minutes === m}
                  onClick={() => setAnswers((a) => ({ ...a, minutes: m }))}
                >
                  {m} min
                </ChoiceChip>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1 className="font-display text-[28px] leading-[1.1] font-bold tracking-[-0.03em] text-ink">
              Here&apos;s your first step
            </h1>
            <div className="mt-5 rounded-card border border-border bg-surface p-4">
              <p className="text-[16px] font-semibold text-ink">
                {suggestEmoji(answers.avoiding)} {answers.avoiding.trim()}
              </p>
              <p className="mt-1 text-[12px] font-semibold tracking-[0.06em] text-primary-dark uppercase">
                Hard · {answers.minutes} min · smaller version about{" "}
                {defaultSmallerMinutes(answers.minutes)} min
              </p>
              {answers.firstAction.trim() ? (
                <p className="mt-3 text-[13.5px] text-ink-muted">
                  First step: {answers.firstAction.trim()}
                </p>
              ) : null}
              {answers.smaller.trim() ? (
                <p className="mt-1 text-[13.5px] text-ink-muted">
                  Smaller version: {answers.smaller.trim()}
                </p>
              ) : null}
            </div>
            <h2 className="mt-5 text-[13px] font-semibold text-ink">Put it in</h2>
            {sections.length > 0 ? (
              <div role="group" aria-label="Section" className="mt-2.5 flex flex-wrap gap-[7px]">
                {sections.map((s) => (
                  <ChoiceChip
                    key={s.id}
                    dot={s.color}
                    selected={chosen === s.id}
                    onClick={() => setSectionId(s.id)}
                  >
                    {s.name}
                  </ChoiceChip>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-[12.5px] text-text-muted">
                A new section, “Smash it”, at 09:30.
              </p>
            )}
          </>
        )}
      </div>

      <div className="mt-6 flex gap-2.5">
        {step > 0 ? (
          <Button variant="tertiary" className="px-5" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        ) : null}
        {step < total - 1 ? (
          <Button className="min-h-[52px] flex-1" onClick={next}>
            {step > 0 &&
            step < QUESTIONS.length &&
            !answers[QUESTIONS[step]?.key ?? "avoiding"].trim()
              ? "Skip"
              : "Next"}
          </Button>
        ) : (
          <Button className="min-h-[52px] flex-1" disabled={saving} onClick={() => void save()}>
            Add to my day
          </Button>
        )}
      </div>
    </ScreenRoot>
  );
}
