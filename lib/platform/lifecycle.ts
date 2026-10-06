import { App } from "@capacitor/app";
import { isNativePlatform } from "./platform";

/**
 * Calls `onResume` whenever the app comes back to the foreground. Used to recompute day_key
 * (rollover at resetAt) and to trigger a sync (TECH_SPEC §2.4, §2.6). Returns an unsubscribe.
 */
export function onAppResume(onResume: () => void): () => void {
  if (isNativePlatform()) {
    const handle = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) onResume();
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }
  const onVisibility = () => {
    if (document.visibilityState === "visible") onResume();
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => document.removeEventListener("visibilitychange", onVisibility);
}
