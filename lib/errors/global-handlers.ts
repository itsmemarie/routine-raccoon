import { reportError, type ReportedError } from "./report";

/**
 * Catches errors that escape React (event handlers, timers, promises) so nothing fails
 * silently (TECH_SPEC §1.5 rule 5). `onReported` is used by the shell to show a toast.
 * Returns an uninstall function for tests and Fast Refresh.
 */
export function installGlobalErrorHandlers(
  onReported: (reported: ReportedError) => void,
): () => void {
  const onError = (event: ErrorEvent) => {
    onReported(reportError(event.error ?? event.message, { fallback: "RR-APP-002" }));
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    onReported(reportError(event.reason, { fallback: "RR-APP-002" }));
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
