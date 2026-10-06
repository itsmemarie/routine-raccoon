"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AppError } from "@/lib/errors/app-error";
import type { PageId } from "@/lib/errors/pages";
import { ErrorCodeTag } from "./error-code-tag";

export interface ErrorPanelProps {
  readonly error: AppError;
  readonly pageId: PageId | null;
  readonly errorId?: string;
  /** Re-render / re-run the failed thing. Shown only when the code is retryable. */
  readonly onRetry?: () => void;
  /** Show "Go to Today" (off on Today itself). */
  readonly showHome?: boolean;
  readonly layout?: "screen" | "inline";
}

/**
 * Presentational error UI: title, user message, code + page reference, and recovery actions.
 * Used by route error boundaries (full screen), section boundaries and inline failures.
 */
export function ErrorPanel({
  error,
  pageId,
  errorId,
  onRetry,
  showHome = true,
  layout = "screen",
}: ErrorPanelProps) {
  const [copied, setCopied] = useState(false);

  const copyDetails = async () => {
    const details = [
      `Code: ${error.code}`,
      `Page: ${pageId ?? "P00"}`,
      errorId ? `Error id: ${errorId}` : null,
      `Version: ${process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}`,
      `Time: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (permissions, insecure context). The code stays visible on screen.
      setCopied(false);
    }
  };

  const body = (
    <div
      role="alert"
      data-testid="error-panel"
      className={
        layout === "screen"
          ? "flex w-full max-w-sm animate-pop flex-col gap-4 rounded-card-lg bg-surface p-5 shadow-mode-card"
          : "flex flex-col gap-3 rounded-card border border-tint-border bg-surface p-4"
      }
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-lg leading-tight font-bold tracking-tight text-ink">
          {error.title}
        </h2>
        <p className="text-[13.5px] leading-relaxed text-ink-muted">{error.userMessage}</p>
      </div>
      <ErrorCodeTag code={error.code} pageId={pageId} {...(errorId ? { errorId } : {})} />
      <div className="flex flex-col gap-2">
        {onRetry && error.retryable ? <Button onClick={onRetry}>Try again</Button> : null}
        {showHome ? (
          <Link
            href="/"
            className="flex min-h-11 items-center justify-center rounded-chip bg-canvas px-4 text-[14px] font-bold text-ink"
          >
            Go to Today
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => void copyDetails()}
          className="min-h-11 text-[13px] font-semibold text-text-muted"
        >
          {copied ? "Details copied" : "Copy details"}
        </button>
      </div>
    </div>
  );

  return layout === "screen" ? (
    <div className="flex min-h-dvh items-center justify-center bg-screen px-4">{body}</div>
  ) : (
    body
  );
}
