"use client";

import { useEffect, useMemo, useState } from "react";
import { toAppError } from "@/lib/errors/app-error";
import type { PageId } from "@/lib/errors/pages";
import { newErrorId, reportError } from "@/lib/errors/report";
import { ErrorPanel } from "./error-panel";

/** Props Next.js passes to every `error.tsx` (v16: `retry` re-fetches and re-renders). */
export interface RouteErrorProps {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
  readonly reset?: () => void;
}

/**
 * The body of every route's `error.tsx` (TECH_SPEC §1.5 rule 3). Reports once, then shows the
 * code, page ID and error id with recovery actions. Each route passes its own page ID.
 */
export function RouteError({ error, retry, pageId }: RouteErrorProps & { pageId: PageId }) {
  const appError = useMemo(() => toAppError(error, "RR-APP-001"), [error]);
  // Generated once per mount, shown on screen and attached to the report.
  const [errorId] = useState(newErrorId);

  useEffect(() => {
    reportError(appError, { pageId, errorId });
  }, [appError, pageId, errorId]);

  return (
    <ErrorPanel
      error={appError}
      pageId={pageId}
      errorId={errorId}
      onRetry={appError.code === "RR-APP-005" ? () => window.location.reload() : retry}
      showHome={pageId !== "P01"}
    />
  );
}
