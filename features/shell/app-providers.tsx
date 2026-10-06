"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { ErrorPanel } from "@/components/errors/error-panel";
import { NavigationTracker } from "@/components/ui/navigation";
import { Toaster } from "@/components/ui/toaster";
import { toastError } from "@/components/ui/toast-store";
import { bootstrapDatabase } from "@/data/bootstrap";
import { getEnv } from "@/lib/env";
import { toAppError, type AppError } from "@/lib/errors/app-error";
import { installGlobalErrorHandlers } from "@/lib/errors/global-handlers";
import { reportError } from "@/lib/errors/report";
import { initTelemetry } from "@/lib/telemetry/telemetry";
import { TimerBar } from "@/features/timer";
import { DayController } from "./day-controller";
import { SyncController } from "./sync-controller";

type GateState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "failed"; error: AppError; errorId: string };

/** Opens storage and ensures the baseline. Never throws: failures become a coded gate state. */
async function bootApp(): Promise<GateState> {
  try {
    const env = getEnv();
    const result = await bootstrapDatabase({
      seedDemo: env.seedDemo && env.appEnv !== "production",
    });
    if (result.ok) return { status: "ready" };
    return { status: "failed", error: result.error, errorId: reportError(result.error).errorId };
  } catch (error) {
    const reported = reportError(toAppError(error, "RR-APP-006"));
    return { status: "failed", error: reported.error, errorId: reported.errorId };
  }
}

/**
 * App shell (page P00): telemetry, global error handlers (RR-APP-002 → toast), and the
 * database gate. Nothing renders until local storage is open and the baseline exists; if that
 * fails the user sees RR-DB-001 / RR-DB-004 / RR-APP-006 with a retry, never a blank screen.
 * Once ready it also runs the day controller and shows the pinned timer bar.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<GateState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const uninstall = installGlobalErrorHandlers(({ error, errorId }) =>
      toastError(error, null, errorId),
    );
    try {
      const env = getEnv();
      void initTelemetry({ dsn: env.sentryDsn, environment: env.appEnv, release: env.version });
    } catch {
      // Invalid env is reported by bootApp() as RR-APP-006; telemetry simply stays off.
    }
    void bootApp().then((next) => {
      if (active) setGate(next);
    });
    return () => {
      active = false;
      uninstall();
    };
  }, []);

  const retry = () => {
    setGate({ status: "loading" });
    void bootApp().then(setGate);
  };

  return (
    <>
      <Suspense fallback={null}>
        <NavigationTracker />
      </Suspense>
      {gate.status === "ready" ? (
        <>
          {children}
          <DayController />
          <SyncController />
          <TimerBar />
        </>
      ) : null}
      {gate.status === "loading" ? (
        <div
          className="flex min-h-dvh items-center justify-center"
          aria-busy="true"
          aria-label="Loading your day"
        />
      ) : null}
      {gate.status === "failed" ? (
        <ErrorPanel
          error={gate.error}
          pageId="P00"
          errorId={gate.errorId}
          onRetry={retry}
          showHome={false}
        />
      ) : null}
      <Toaster />
    </>
  );
}
