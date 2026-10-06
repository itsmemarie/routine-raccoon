"use client";

import { useRef, useState, type KeyboardEvent } from "react";

/**
 * "Click into fields to edit them" (user notes, PRD R5): looks like text, edits in place, and
 * commits on blur or Enter; Escape cancels. While focused it keeps its own draft, so a sync
 * landing mid-edit can't overwrite what the user is typing; otherwise it shows the stored value.
 */
export function InlineText({
  value,
  onCommit,
  label,
  placeholder,
  multiline = false,
  maxLength,
  className = "",
  rows = 2,
}: {
  value: string;
  onCommit: (next: string) => void;
  /** Accessible label (the field has no visible one). */
  label: string;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  className?: string;
  rows?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // The blur that follows Escape runs before React re-renders, so the commit decision reads a
  // ref rather than the (stale) state in its closure.
  const draftRef = useRef<string | null>(null);
  const shown = draft ?? value;

  const update = (next: string | null) => {
    draftRef.current = next;
    setDraft(next);
  };
  const commit = () => {
    const pending = draftRef.current;
    if (pending !== null && pending !== value) onCommit(pending);
    update(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      update(null);
      event.currentTarget.blur();
    } else if (event.key === "Enter" && !multiline) {
      event.currentTarget.blur();
    }
  };
  const base = `w-full border-none bg-transparent p-0 outline-none placeholder:text-text-faint focus:rounded-md focus:bg-screen ${className}`;
  return multiline ? (
    <textarea
      aria-label={label}
      value={shown}
      rows={rows}
      maxLength={maxLength}
      placeholder={placeholder}
      onFocus={() => update(value)}
      onChange={(event) => update(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className={`${base} resize-none`}
    />
  ) : (
    <input
      aria-label={label}
      value={shown}
      maxLength={maxLength}
      placeholder={placeholder}
      onFocus={() => update(value)}
      onChange={(event) => update(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className={base}
    />
  );
}
