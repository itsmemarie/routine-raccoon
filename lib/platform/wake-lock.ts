import { onAppResume } from "./lifecycle";
import { isNativePlatform } from "./platform";

/**
 * Keeps the screen on until the returned function is called (TECH_SPEC §1.2 platform adapter).
 * A locked phone freezes a web app, so without this a timer could not ping once the screen timed
 * out. The browser drops the lock whenever the app leaves the screen, so it is retaken on return.
 * Native: a no-op, because the scheduled notification fires with the screen off.
 */
export function keepScreenOn(): () => void {
  if (isNativePlatform() || !("wakeLock" in navigator)) return () => undefined;
  let lock: WakeLockSentinel | null = null;
  let wanted = true;

  const acquire = async () => {
    try {
      const next = await navigator.wakeLock.request("screen");
      if (wanted) lock = next;
      else await next.release();
    } catch {
      // Refused (battery saver, app left the screen). Best-effort: the phone just sleeps as usual.
    }
  };

  void acquire();
  const unsubscribe = onAppResume(() => void acquire());
  return () => {
    wanted = false;
    unsubscribe();
    void lock?.release();
  };
}
