"use client";

import { useId, useRef, type ReactNode } from "react";
import { useFocusTrap } from "./use-focus-trap";

/**
 * Bottom sheet (handoff: sheet top radius 28, `up` motion, scrim). Modal: focus is trapped,
 * Escape and the scrim close it.
 */
export function Sheet({
  title,
  description,
  onClose,
  children,
  footer,
  tone = "default",
  testId,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: "default" | "tint";
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useFocusTrap(ref, onClose, { initialFocus: "container" });
  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/35"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        data-testid={testId}
        className={`relative flex max-h-[88dvh] animate-up flex-col gap-4 overflow-y-auto rounded-t-sheet px-[18px] pt-[14px] pb-[max(26px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.18)] outline-none ${tone === "tint" ? "bg-tint" : "bg-surface"}`}
      >
        <span
          aria-hidden
          className="h-1 w-[38px] shrink-0 self-center rounded-full bg-toggle-off"
        />
        <div>
          <h2
            id={titleId}
            className="font-display text-[21px] leading-[1.15] font-bold tracking-[-0.02em] text-ink"
          >
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-[12.5px] leading-normal text-text-muted">
              {description}
            </p>
          ) : null}
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}

/** Centred dialog (confirm, prompt, paste choice). */
export function Dialog({
  title,
  description,
  onClose,
  children,
  role = "dialog",
  testId,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  role?: "dialog" | "alertdialog";
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useFocusTrap(ref, onClose);
  return (
    <div className="fixed inset-0 z-[60] mx-auto flex max-w-[480px] items-center justify-center px-[22px]">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        data-testid={testId}
        className="relative w-full animate-pop rounded-[22px] bg-surface p-5 shadow-[0_18px_44px_rgba(0,0,0,0.26)]"
      >
        <h2
          id={titleId}
          className="font-display text-[19px] leading-[1.2] font-bold tracking-[-0.02em] text-ink"
        >
          {title}
        </h2>
        {description ? (
          <div id={descriptionId} className="mt-1.5 text-[13px] leading-[1.55] text-ink-muted">
            {description}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
