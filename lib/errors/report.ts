import { recordDiagnostic } from "@/lib/telemetry/diagnostics";
import { getTelemetry } from "@/lib/telemetry/telemetry";
import { toAppError, type AppError } from "./app-error";
import type { ErrorCode } from "./codes";
import type { PageId } from "./pages";

export interface ReportedError {
  readonly error: AppError;
  /** Short reference the user can quote; also tagged in Sentry. */
  readonly errorId: string;
}

/** 8 hex chars: unique enough to find one event, short enough to read out loud. */
export function newErrorId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The single exit for every error that reaches the user (TECH_SPEC §1.5 rule 5):
 * normalises → records in the local diagnostics buffer → sends to telemetry → logs in dev.
 * It never throws, so it is safe to call from catch blocks and error boundaries.
 */
export function reportError(
  value: unknown,
  options: { pageId?: PageId | null; fallback?: ErrorCode; now?: Date; errorId?: string } = {},
): ReportedError {
  const error = toAppError(value, options.fallback ?? "RR-APP-001");
  const errorId = options.errorId ?? newErrorId();
  const pageId = options.pageId ?? null;
  try {
    recordDiagnostic({
      at: (options.now ?? new Date()).toISOString(),
      code: error.code,
      pageId,
      errorId,
    });
    getTelemetry().captureError(error, { pageId, errorId });
    if (process.env.NODE_ENV !== "production") {
      console.error(`[${error.code} · ${pageId ?? "P00"} · #${errorId}]`, error.cause ?? error);
    }
  } catch (reportingFailure) {
    // Reporting must never take the app down; fall back to the console only.
    console.error("reportError failed", reportingFailure);
  }
  return { error, errorId };
}
