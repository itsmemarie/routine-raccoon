"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatHHMM12, fromClock12, toClock12, type Clock12 } from "@/domain/time";
import type { HHMM } from "@/domain/types";

const QUICK: readonly HHMM[] = ["00:00", "02:00", "04:00", "06:00"];

function Wheel({
  label,
  value,
  previous,
  next,
  onPrevious,
  onNext,
}: {
  label: string;
  value: string;
  previous: string;
  next: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="relative z-10 flex flex-1 flex-col items-center"
    >
      <button
        type="button"
        aria-label={`${label}: ${previous}`}
        onClick={onPrevious}
        className="flex min-h-11 w-full flex-col items-center justify-center font-display text-[17px] text-text-muted"
      >
        <ChevronUp size={14} strokeWidth={1.8} aria-hidden />
        <span aria-hidden>{previous}</span>
      </button>
      <span
        aria-live="polite"
        className="flex h-12 items-center font-display text-[25px] font-bold text-ink"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={`${label}: ${next}`}
        onClick={onNext}
        className="flex min-h-11 w-full flex-col items-center justify-center font-display text-[17px] text-text-muted"
      >
        <span aria-hidden>{next}</span>
        <ChevronDown size={14} strokeWidth={1.8} aria-hidden />
      </button>
    </div>
  );
}

/**
 * "Day resets at" (handoff screen 16): wheels for hour, minute (5-minute steps) and AM/PM,
 * plus quick chips. Saved as 24h "HH:MM".
 */
export function ResetTimeSheet({
  value,
  survivalName,
  onSave,
  onClose,
}: {
  value: HHMM;
  survivalName: string;
  onSave: (next: HHMM) => void;
  onClose: () => void;
}) {
  const [clock, setClock] = useState<Clock12>(() => {
    const c = toClock12(value);
    return { ...c, minute: (Math.round(c.minute / 5) * 5) % 60 };
  });
  const hhmm = fromClock12(clock);
  const step = (patch: Partial<Clock12>) => setClock((c) => ({ ...c, ...patch }));
  const hour = (h: number) => ((h - 1 + 12) % 12) + 1;
  const pad = (m: number) => String((m + 60) % 60).padStart(2, "0");
  const flip = clock.period === "AM" ? "PM" : "AM";

  return (
    <Sheet
      title="Day resets at"
      description={`A ${survivalName} Day never carries past this time. Late risers often push it a few hours.`}
      onClose={onClose}
      testId="reset-sheet"
      footer={
        <div className="flex gap-2.5">
          <Button variant="tertiary" onClick={onClose} className="px-5">
            Cancel
          </Button>
          <Button className="flex-1" onClick={() => onSave(hhmm)}>
            Set {formatHHMM12(hhmm)}
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2">
        {QUICK.map((quick) => (
          <button
            key={quick}
            type="button"
            aria-pressed={quick === hhmm}
            onClick={() => setClock(toClock12(quick))}
            className={`min-h-10 rounded-full px-[13px] text-[12.5px] font-semibold ${quick === hhmm ? "border border-tint-border bg-tint text-primary" : "bg-canvas text-text-muted"}`}
          >
            {formatHHMM12(quick)}
          </button>
        ))}
      </div>
      <div className="relative flex items-center rounded-[20px] border border-border bg-screen px-2.5">
        <span
          aria-hidden
          className="absolute inset-x-2.5 top-1/2 h-12 -translate-y-1/2 rounded-[14px] border border-tint-border bg-tint"
        />
        <Wheel
          label="Hour"
          value={String(clock.hour)}
          previous={String(hour(clock.hour - 1))}
          next={String(hour(clock.hour + 1))}
          onPrevious={() => step({ hour: hour(clock.hour - 1) })}
          onNext={() => step({ hour: hour(clock.hour + 1) })}
        />
        <Wheel
          label="Minutes"
          value={pad(clock.minute)}
          previous={pad(clock.minute - 5)}
          next={pad(clock.minute + 5)}
          onPrevious={() => step({ minute: (clock.minute + 55) % 60 })}
          onNext={() => step({ minute: (clock.minute + 5) % 60 })}
        />
        <Wheel
          label="AM or PM"
          value={clock.period}
          previous={flip}
          next={flip}
          onPrevious={() => step({ period: flip })}
          onNext={() => step({ period: flip })}
        />
      </div>
    </Sheet>
  );
}
