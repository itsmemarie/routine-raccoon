import type { AppError } from "@/lib/errors/app-error";
import type { PageId } from "@/lib/errors/pages";

/**
 * Telemetry port. The app talks to this interface; Sentry is one adapter (TECH_SPEC D9).
 * Without a DSN the no-op adapter is used, so local builds never phone home.
 */
export interface Telemetry {
  captureError(error: AppError, context: { pageId: PageId | null; errorId: string }): void;
}

export const noopTelemetry: Telemetry = {
  captureError() {
    /* intentionally empty: no DSN configured */
  },
};

let active: Telemetry = noopTelemetry;

export function getTelemetry(): Telemetry {
  return active;
}

/** Test seam and the hook used by initTelemetry(). */
export function setTelemetry(telemetry: Telemetry): void {
  active = telemetry;
}

/**
 * Lazily loads Sentry only when a DSN is configured, keeping it out of the critical bundle.
 * Privacy (TECH_SPEC §3.7): no default PII, no replay, breadcrumbs that may carry user text dropped.
 */
export async function initTelemetry(options: {
  dsn: string | undefined;
  environment: string;
  release: string;
}): Promise<void> {
  if (!options.dsn) return;
  const Sentry = await import("@sentry/react");
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    // Sentry 11: collect no user info, cookies, headers, bodies or query params.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    // Keep "Failed to fetch" intact for toAppError(); the hostname is added to the report only.
    enhanceFetchErrorMessages: "report-only",
    tracesSampleRate: 0,
    beforeBreadcrumb(crumb) {
      return crumb.category === "console" || crumb.category === "ui.input" ? null : crumb;
    },
    beforeSend(event) {
      delete event.user;
      delete event.request;
      return event;
    },
  });
  setTelemetry({
    captureError(error, context) {
      Sentry.captureException(error, {
        tags: {
          "error.code": error.code,
          "page.id": context.pageId ?? "P00",
          "error.id": context.errorId,
        },
        // AppError.context is documented as PII-free (ids, counts, table names).
        extra: { ...error.context },
        level:
          error.severity === "fatal" ? "fatal" : error.severity === "error" ? "error" : "warning",
      });
    },
  });
}
