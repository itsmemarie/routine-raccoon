import { getEnv } from "@/lib/env";
import { isNativePlatform } from "./platform";

/**
 * Offline app shell for the installed web app (public/sw.js). Web production only: the
 * Android shell already bundles the files, and staging/E2E builds stay uncached so every run
 * tests what was just built.
 */
export function shouldRegisterServiceWorker(): boolean {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  if (isNativePlatform()) return false;
  try {
    return getEnv().appEnv === "production";
  } catch {
    // Invalid env is reported by bootApp() as RR-APP-006; offline caching simply stays off.
    return false;
  }
}

export async function registerServiceWorker(): Promise<void> {
  if (!shouldRegisterServiceWorker()) return;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    // Best-effort like storage persistence: without it the app still works online, it just
    // won't open offline. Not a user-facing failure.
  }
}
