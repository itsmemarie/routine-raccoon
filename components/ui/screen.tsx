"use client";

import { ArrowLeft, ChevronLeft } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { useFaultInjection } from "@/lib/errors/fault-injection";
import type { PageId } from "@/lib/errors/pages";
import { useBack } from "./navigation";

function FaultProbe({ pageId }: { pageId: PageId }) {
  useFaultInjection(pageId);
  return null;
}

/**
 * Root element of every screen (TECH_SPEC §1.5 rule 4). Stamps `data-page-id` (used by E2E and
 * telemetry) and wires test-only fault injection. Errors thrown here reach the route error.tsx.
 */
export function ScreenRoot({
  pageId,
  children,
  className = "",
}: {
  pageId: PageId;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-page-id={pageId}
      className={`mx-auto min-h-dvh w-full max-w-[480px] bg-screen ${className}`}
    >
      <Suspense fallback={null}>
        <FaultProbe pageId={pageId} />
      </Suspense>
      {children}
    </div>
  );
}

/** Tab screens' big title (handoff: 700 26px, -0.03em); sub-screens can show a back arrow. */
export function ScreenHeader({
  title,
  back = true,
  fallback = "/",
}: {
  title: string;
  back?: boolean;
  fallback?: string;
}) {
  const goBack = useBack(fallback);
  return (
    <header className="flex items-center gap-2 px-3.5 pt-4 pb-2">
      {back ? (
        <button
          type="button"
          aria-label="Back"
          onClick={goBack}
          className="-ml-1 flex size-11 items-center justify-center rounded-full text-ink"
        >
          <ArrowLeft size={20} strokeWidth={1.8} />
        </button>
      ) : null}
      <h1 className="font-display text-[26px] leading-none font-bold tracking-[-0.03em] text-ink">
        {title}
      </h1>
    </header>
  );
}

/**
 * Sub-screen bar (handoff: "‹ Settings" on the left, centred title, optional action right).
 */
export function BackBar({
  backLabel,
  title,
  fallback,
  action,
}: {
  backLabel: string;
  title?: string;
  fallback: string;
  action?: ReactNode;
}) {
  const goBack = useBack(fallback);
  return (
    <header className="sticky top-0 z-30 flex min-h-[60px] items-center gap-2.5 border-b border-border bg-surface px-4 pt-[env(safe-area-inset-top)]">
      <button
        type="button"
        onClick={goBack}
        className="-ml-2 flex min-h-11 shrink-0 items-center gap-1 rounded-chip px-2 text-[13px] font-semibold text-text-muted"
      >
        <ChevronLeft size={18} strokeWidth={1.8} aria-hidden />
        {backLabel}
      </button>
      {title ? (
        <h1 className="min-w-0 flex-1 truncate text-center font-display text-base font-bold text-ink">
          {title}
        </h1>
      ) : (
        <span className="flex-1" />
      )}
      <span className="flex min-w-12 shrink-0 justify-end">{action}</span>
    </header>
  );
}

/** Form bar: Cancel · title · Save (handoff screens 10, 12). */
export function FormBar({
  title,
  onCancel,
  onSave,
  saveLabel = "Save",
  busy = false,
}: {
  title: string;
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  busy?: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 flex min-h-[60px] items-center gap-3 border-b border-border bg-surface px-[18px] pt-[env(safe-area-inset-top)]">
      <button
        type="button"
        onClick={onCancel}
        className="-ml-2 min-h-11 shrink-0 px-2 text-[13px] font-semibold text-text-muted"
      >
        Cancel
      </button>
      <h1 className="min-w-0 flex-1 truncate text-center font-display text-base font-bold text-ink">
        {title}
      </h1>
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="-mr-2 min-h-11 shrink-0 px-2 text-[13px] font-bold text-primary disabled:opacity-50"
      >
        {saveLabel}
      </button>
    </header>
  );
}
