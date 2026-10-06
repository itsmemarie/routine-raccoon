"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog } from "./sheet";

/** "Delete “X”?" style confirmation (handoff screen 9). Confirm is the primary action. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  cancelLabel = "Cancel",
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  return (
    <Dialog title={title} description={body} onClose={onCancel} role="alertdialog" testId="confirm">
      <div className="mt-[18px] flex flex-col gap-2">
        <Button onClick={onConfirm}>{confirmLabel}</Button>
        <Button variant="tertiary" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * One-field prompt (rename, new Day Plan, description…). Submits on Enter. `error` shows an
 * inline message (with its code) under the field.
 */
export function PromptDialog({
  title,
  label,
  initialValue = "",
  placeholder,
  multiline = false,
  maxLength,
  submitLabel = "Save",
  error,
  onSubmit,
  onCancel,
}: {
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  submitLabel?: string;
  error?: ReactNode;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputId = useId();
  const fieldClass =
    "mt-1.5 w-full rounded-xl border-[1.5px] border-primary bg-screen px-3.5 py-[13px] text-[14px] font-medium text-ink outline-none";
  return (
    <Dialog title={title} onClose={onCancel} testId="prompt">
      <form
        className="mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(value);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        {multiline ? (
          <textarea
            id={inputId}
            value={value}
            rows={3}
            maxLength={maxLength}
            placeholder={placeholder}
            onChange={(event) => setValue(event.target.value)}
            className={`${fieldClass} resize-none`}
          />
        ) : (
          <input
            id={inputId}
            value={value}
            maxLength={maxLength}
            placeholder={placeholder}
            autoComplete="off"
            onChange={(event) => setValue(event.target.value)}
            className={fieldClass}
          />
        )}
        {error ? <div className="mt-2">{error}</div> : null}
        <div className="mt-3.5 flex gap-[9px]">
          <Button variant="tertiary" onClick={onCancel} className="px-4">
            Cancel
          </Button>
          <Button type="submit" className="flex-1">
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
