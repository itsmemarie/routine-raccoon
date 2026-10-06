"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChoiceChip } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { recurrenceLabel } from "@/domain/recurrence";
import { DayKeySchema } from "@/domain/schemas";
import type { Recurrence } from "@/domain/types";

const WEEKDAYS = [
  ["M", "Monday"],
  ["T", "Tuesday"],
  ["W", "Wednesday"],
  ["T", "Thursday"],
  ["F", "Friday"],
  ["S", "Saturday"],
  ["S", "Sunday"],
] as const;
const PERIODS = ["day", "week", "month", "year"] as const;
const ENDS = [
  ["never", "Never"],
  ["count", "After X times"],
  ["date", "On a date"],
] as const;

/**
 * Custom recurrence (handoff screen 13, Google-Calendar shaped): weekdays, "every n
 * {day|week|month|year}" (an interval, TECH_SPEC §2.2) and an end. Nothing changes until saved.
 */
export function RecurrenceSheet({
  initial,
  onSave,
  onCancel,
}: {
  initial: Recurrence;
  onSave: (rec: Recurrence) => void;
  onCancel: () => void;
}) {
  const [rec, setRec] = useState<Recurrence>(initial);
  const nId = useId();
  const countId = useId();
  const untilId = useId();
  const update = (patch: Partial<Recurrence>) => setRec((r) => ({ ...r, ...patch }));
  const untilValid = rec.ends !== "date" || DayKeySchema.safeParse(rec.until ?? "").success;

  const toggleDay = (day: number) =>
    update({
      days: rec.days.includes(day)
        ? rec.days.filter((d) => d !== day)
        : [...rec.days, day].sort((a, b) => a - b),
    });

  return (
    <Sheet
      title="Custom recurrence"
      description="Nothing changes until you save it."
      onClose={onCancel}
      testId="recurrence-sheet"
      footer={
        <div className="flex gap-2.5">
          <Button variant="tertiary" onClick={onCancel} className="px-5">
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={!untilValid}
            onClick={() => {
              const next: Recurrence = { ...rec, kind: "custom" };
              if (next.ends !== "count") delete next.count;
              if (next.ends !== "date") delete next.until;
              onSave(next);
            }}
          >
            Save recurrence
          </Button>
        </div>
      }
    >
      <fieldset>
        <legend className="text-[12px] font-semibold text-ink">Days of the week</legend>
        <div className="mt-2.5 flex gap-1.5">
          {WEEKDAYS.map(([letter, name], day) => {
            const on = rec.days.includes(day);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                aria-label={name}
                onClick={() => toggleDay(day)}
                className={`flex h-11 min-w-0 flex-1 items-center justify-center rounded-xl text-[12.5px] font-bold ${on ? "bg-primary text-white" : "border border-border bg-surface text-text-muted"}`}
              >
                {letter}
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-[12px] font-semibold text-ink">How often</legend>
        <div className="mt-2.5 flex flex-wrap items-center gap-[7px]">
          <label
            htmlFor={nId}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-screen px-3 text-[12px] font-medium text-text-muted"
          >
            Every
            <input
              id={nId}
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={rec.n}
              onChange={(event) =>
                update({
                  n: Math.min(99, Math.max(1, Math.round(Number(event.target.value) || 1))),
                })
              }
              className="w-10 bg-transparent text-[13px] font-bold text-ink outline-none"
            />
          </label>
          {PERIODS.map((per) => (
            <ChoiceChip key={per} selected={rec.per === per} onClick={() => update({ per })}>
              {rec.n > 1 ? `${per}s` : per}
            </ChoiceChip>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-[12px] font-semibold text-ink">Ends</legend>
        <div className="mt-2.5 flex flex-wrap gap-[7px]">
          {ENDS.map(([value, label]) => (
            <ChoiceChip
              key={value}
              selected={rec.ends === value}
              onClick={() =>
                update({
                  ends: value,
                  ...(value === "count" && rec.count === undefined ? { count: 10 } : {}),
                })
              }
            >
              {label}
            </ChoiceChip>
          ))}
        </div>
        {rec.ends === "count" ? (
          <label
            htmlFor={countId}
            className="mt-2.5 flex min-h-11 items-center gap-2 rounded-xl bg-screen px-[13px] text-[12.5px] text-text-muted"
          >
            <input
              id={countId}
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              value={rec.count ?? 10}
              onChange={(event) =>
                update({
                  count: Math.min(999, Math.max(1, Math.round(Number(event.target.value) || 1))),
                })
              }
              className="w-12 bg-transparent text-[13px] font-bold text-ink outline-none"
            />
            times, then it stops
          </label>
        ) : null}
        {rec.ends === "date" ? (
          <label
            htmlFor={untilId}
            className="mt-2.5 flex min-h-11 items-center gap-2.5 rounded-xl bg-screen px-[13px] text-[12.5px] text-text-muted"
          >
            Last day
            <input
              id={untilId}
              type="date"
              value={rec.until ?? ""}
              onChange={(event) => update({ until: event.target.value || undefined })}
              className="bg-transparent text-[12.5px] font-semibold text-ink outline-none"
            />
          </label>
        ) : null}
      </fieldset>
      <p className="text-[12px] text-text-muted">
        Repeats:{" "}
        <span className="font-semibold text-ink">
          {recurrenceLabel({ ...rec, kind: "custom" })}
        </span>
      </p>
    </Sheet>
  );
}
