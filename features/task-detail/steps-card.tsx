"use client";

import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { InlineText } from "@/components/ui/inline-text";
import { GroupHeading } from "@/components/ui/layout";
import type { Step } from "@/domain/types";

/**
 * Steps on Task detail (handoff screen 6): tickable for today, "1 of 3 done", text editable in
 * place, "Add subtask". Ticking every step does not complete the task. In Survival Mode the
 * default smaller version is "the first two steps, the rest greyed" (PRD R6): `greyFrom`.
 */
export function StepsCard({
  steps,
  checked,
  greyFrom,
  editable,
  note,
  onToggle,
  onEdit,
  onAdd,
}: {
  steps: readonly Step[];
  checked: ReadonlySet<string>;
  greyFrom: number;
  editable: boolean;
  note: string | null;
  onToggle: (stepId: string, next: boolean) => void;
  onEdit: (stepId: string, text: string) => void;
  onAdd: (text: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const done = steps.filter((s) => checked.has(s.id)).length;

  const finishAdd = () => {
    if (draft.trim()) onAdd(draft);
    setDraft("");
    setAdding(false);
  };

  return (
    <section aria-labelledby="steps-heading" className="mt-5">
      <div className="flex items-baseline justify-between">
        <GroupHeading id="steps-heading">Steps</GroupHeading>
        {steps.length > 0 ? (
          <span className="text-[12px] font-semibold text-text-muted">
            {done} of {steps.length} done
          </span>
        ) : null}
      </div>
      {note ? <p className="mt-1.5 text-[12px] text-survival-text">{note}</p> : null}
      <div className="mt-[9px] rounded-[14px] border border-border bg-surface px-3.5 pt-1 pb-3">
        <ul>
          {steps.map((step, index) => {
            const isDone = checked.has(step.id);
            const greyed = index >= greyFrom;
            return (
              <li
                key={step.id}
                className={`flex items-center gap-[11px] border-b border-border py-1.5 ${greyed ? "opacity-45" : ""}`}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isDone}
                  aria-label={`${isDone ? "Untick" : "Tick"} step: ${step.text}`}
                  onClick={() => onToggle(step.id, !isDone)}
                  className="-ml-2 flex size-11 shrink-0 items-center justify-center"
                >
                  <span
                    className={`flex size-5 items-center justify-center rounded-[7px] ${isDone ? "bg-primary" : "border-[1.5px] border-grip"}`}
                  >
                    {isDone ? (
                      <Check size={11} strokeWidth={3} className="text-white" aria-hidden />
                    ) : null}
                  </span>
                </button>
                {editable ? (
                  <InlineText
                    value={step.text}
                    label={`Step ${index + 1}`}
                    maxLength={300}
                    onCommit={(text) => onEdit(step.id, text)}
                    className={`text-[13.5px] ${isDone ? "text-text-faint line-through" : "text-ink-muted"}`}
                  />
                ) : (
                  <span
                    className={`text-[13.5px] ${isDone ? "text-text-faint line-through" : "text-ink-muted"}`}
                  >
                    {step.text}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {editable ? (
          adding ? (
            <div className="mt-2 flex items-center gap-[11px] rounded-[11px] bg-screen px-3">
              <Plus
                size={12}
                strokeWidth={2.4}
                className="shrink-0 text-primary-dark"
                aria-hidden
              />
              <input
                // A fresh input the user just asked for: focusing it is the expected result.
                autoFocus
                aria-label="New subtask"
                value={draft}
                maxLength={300}
                placeholder="Step"
                onChange={(event) => setDraft(event.target.value)}
                onBlur={finishAdd}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    setDraft("");
                    setAdding(false);
                  }
                }}
                className="min-h-11 flex-1 bg-transparent text-[13.5px] text-ink outline-none"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-2 flex min-h-11 w-full items-center gap-[9px] rounded-[11px] bg-tint px-3 text-[12.5px] font-bold text-primary-dark"
            >
              <Plus size={12} strokeWidth={2.4} aria-hidden /> Add subtask
            </button>
          )
        ) : null}
      </div>
    </section>
  );
}
