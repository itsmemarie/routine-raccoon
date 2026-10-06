"use client";

import { useId } from "react";
import { cleanCode } from "@/domain/auth";

/**
 * Six boxes over one real input (handoff: autocomplete one-time-code, auto-submits). The input
 * stays the accessible, focusable control; the boxes are decoration.
 */
export function CodeInput({
  value,
  onChange,
  invalid,
  disabled,
}: {
  value: string;
  onChange: (code: string) => void;
  invalid: boolean;
  disabled: boolean;
}) {
  const id = useId();
  const active = Math.min(value.length, 5);
  return (
    <div className="relative mt-6">
      <div aria-hidden className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className={`flex h-14 items-center justify-center rounded-[14px] bg-surface font-display text-2xl font-bold text-ink ${
              i === active && !disabled
                ? "border-[1.5px] border-primary shadow-selected"
                : invalid
                  ? "border-[1.5px] border-primary-light"
                  : "border border-border"
            }`}
          >
            {value[i] ?? ""}
          </div>
        ))}
      </div>
      <label htmlFor={id} className="sr-only">
        6-digit code
      </label>
      <input
        id={id}
        value={value}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        disabled={disabled}
        // The code is the only thing to do on this step.
        autoFocus
        aria-invalid={invalid}
        onChange={(event) => onChange(cleanCode(event.target.value))}
        className="absolute inset-0 size-full cursor-text text-[16px] opacity-0"
      />
    </div>
  );
}
