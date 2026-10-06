"use client";

import { useState } from "react";
import { ChoiceChip } from "@/components/ui/chip";
import {
  customDraft,
  frequencyOf,
  presetRecurrence,
  recurrenceLabel,
  type FrequencyKind,
} from "@/domain/recurrence";
import type { DayKey, Recurrence } from "@/domain/types";
import { RecurrenceSheet } from "./recurrence-sheet";

const CHIPS: readonly [FrequencyKind, string][] = [
  ["every day", "Every day"],
  ["every week", "Every week"],
  ["every month", "Every month"],
  ["custom", "Custom"],
];

/**
 * Frequency chips (tasks: "Frequency", sections: "Repeats"). Custom opens the recurrence
 * sheet; a saved custom rule shows as a summary row that reopens it.
 */
export function FrequencyField({
  value,
  today,
  onChange,
  labelledBy,
}: {
  value: Recurrence | null;
  today: DayKey;
  onChange: (next: Recurrence | null) => void;
  labelledBy: string;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const current = frequencyOf(value);
  return (
    <>
      <div role="group" aria-labelledby={labelledBy} className="mt-2.5 flex flex-wrap gap-[7px]">
        {CHIPS.map(([kind, label]) => (
          <ChoiceChip
            key={kind}
            selected={current === kind}
            onClick={() => {
              if (kind === "custom") setSheetOpen(true);
              else if (kind !== current) onChange(presetRecurrence(kind, today));
            }}
          >
            {label}
          </ChoiceChip>
        ))}
      </div>
      {value?.kind === "custom" ? (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="mt-2.5 flex w-full items-center gap-2.5 rounded-[14px] border border-border bg-surface px-[15px] py-[13px] text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-semibold text-ink">Custom recurrence</span>
            <span className="mt-0.5 block text-[11.5px] font-medium text-text-muted">
              {recurrenceLabel(value)}
            </span>
          </span>
          <span className="shrink-0 text-[12px] font-bold text-primary">Edit</span>
        </button>
      ) : null}
      {sheetOpen ? (
        <RecurrenceSheet
          initial={customDraft(value, today)}
          onCancel={() => setSheetOpen(false)}
          onSave={(rec) => {
            setSheetOpen(false);
            onChange(rec);
          }}
        />
      ) : null}
    </>
  );
}
