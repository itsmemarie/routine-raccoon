"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { splitLinks } from "@/domain/links";

/**
 * "Click into fields to edit them" (user notes, PRD R5): looks like text, edits in place, and
 * commits on blur or Enter; Escape cancels. While focused it keeps its own draft, so a sync
 * landing mid-edit can't overwrite what the user is typing; otherwise it shows the stored value.
 *
 * With `linkify` (multi-line only), text holding a web address reads as text with real links,
 * since a textarea can't contain any. Tapping the plain text or the Edit button brings the field
 * back; the button is what makes a note that is nothing but a link editable at all.
 */
export function InlineText({
  value,
  onCommit,
  onDirtyChange,
  label,
  placeholder,
  multiline = false,
  linkify = false,
  maxLength,
  className = "",
  rows = 2,
}: {
  value: string;
  onCommit: (next: string) => void;
  /** The draft started or stopped holding a change that hasn't been committed yet. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Accessible label (the field has no visible one). */
  label: string;
  placeholder?: string;
  multiline?: boolean;
  linkify?: boolean;
  maxLength?: number;
  className?: string;
  rows?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // The blur that follows Escape runs before React re-renders, so the commit decision reads a
  // ref rather than the (stale) state in its closure.
  const draftRef = useRef<string | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // Leaving the screen (the phone's back gesture, a link) removes the field without a blur, so
  // whatever is still being typed would be lost. Commit it on the way out.
  const latest = useRef({ value, onCommit });
  useEffect(() => {
    latest.current = { value, onCommit };
  });
  useEffect(
    () => () => {
      const pending = draftRef.current;
      if (pending !== null && pending !== latest.current.value) latest.current.onCommit(pending);
    },
    [],
  );
  const shown = draft ?? value;
  const parts = linkify && draft === null ? splitLinks(value) : [];
  const reading = parts.some((part) => part.kind === "link");

  const update = (next: string | null) => {
    draftRef.current = next;
    setDraft(next);
    onDirtyChange?.(next !== null && next !== value);
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
  // flushSync shows the field before focusing it: phones only raise the keyboard for a focus made
  // inside the tap itself.
  const startEditing = () => {
    flushSync(() => update(value));
    fieldRef.current?.focus();
  };
  const base = `w-full border-none bg-transparent p-0 outline-none placeholder:text-text-faint focus:rounded-md focus:bg-screen ${className}`;
  return multiline ? (
    <>
      {reading ? (
        <div className={className}>
          {/* The tap is a shortcut for touch and mouse; keyboards use the Edit button below. */}
          <p onClick={startEditing} className="cursor-text wrap-break-word whitespace-pre-wrap">
            {parts.map((part, index) =>
              part.kind === "link" ? (
                <a
                  key={index}
                  href={part.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="break-all text-primary underline"
                >
                  {part.text}
                </a>
              ) : (
                part.text
              ),
            )}
          </p>
          <button
            type="button"
            onClick={startEditing}
            className="-mb-3 flex min-h-11 items-center text-[12px] font-semibold text-text-muted"
          >
            Edit {label.toLowerCase()}
          </button>
        </div>
      ) : null}
      {/* Grows with its text, so tapping a wrapped note doesn't collapse it to `rows` lines. */}
      <textarea
        ref={fieldRef}
        hidden={reading}
        aria-label={label}
        value={shown}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        onFocus={() => update(value)}
        onChange={(event) => update(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        style={{ minHeight: `${rows}lh` }}
        className={`${base} field-sizing-content resize-none`}
      />
    </>
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
