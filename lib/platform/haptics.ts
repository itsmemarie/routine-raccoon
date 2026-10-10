/**
 * Haptic feedback (TECH_SPEC §1.2 platform adapter). Web: the Vibration API where the browser
 * has it (Chrome on Android); elsewhere a no-op. Phase 3 can swap in @capacitor/haptics.
 */

function tick(): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  navigator.vibrate(10);
}

/** A short tick when a long-press picks a row up for dragging. */
export function pickupFeedback(): void {
  tick();
}

/** A short tick when a swipe has gone far enough that letting go acts. */
export function swipeArmedFeedback(): void {
  tick();
}
