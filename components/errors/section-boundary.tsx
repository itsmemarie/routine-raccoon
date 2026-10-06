"use client";

import { catchError, type ErrorInfo } from "next/error";
import { useEffect, useMemo, useState } from "react";
import { toAppError } from "@/lib/errors/app-error";
import type { ErrorCode } from "@/lib/errors/codes";
import type { PageId } from "@/lib/errors/pages";
import { newErrorId, reportError } from "@/lib/errors/report";
import { ErrorPanel } from "./error-panel";

interface SectionBoundaryProps {
  readonly pageId: PageId;
  /** Code to use when the thrown value carries none (e.g. RR-MED-001 around a video embed). */
  readonly fallback?: ErrorCode;
}

function SectionFallback({ pageId, fallback }: SectionBoundaryProps, { error, retry }: ErrorInfo) {
  const appError = useMemo(() => toAppError(error, fallback ?? "RR-APP-001"), [error, fallback]);
  const [errorId] = useState(newErrorId);
  useEffect(() => {
    reportError(appError, { pageId, errorId });
  }, [appError, pageId, errorId]);
  return (
    <ErrorPanel
      error={appError}
      pageId={pageId}
      errorId={errorId}
      onRetry={retry}
      showHome={false}
      layout="inline"
    />
  );
}

/**
 * Widget-level error boundary (TECH_SPEC §1.6): a broken section, card list or video embed
 * shows an inline panel with its code while the rest of the screen keeps working.
 *
 * @example <SectionBoundary pageId="P02" fallback="RR-MED-001"><VideoEmbed … /></SectionBoundary>
 */
export const SectionBoundary = catchError(SectionFallback);
