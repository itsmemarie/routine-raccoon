import { Capacitor } from "@capacitor/core";

/**
 * Platform adapters (TECH_SPEC §1.2). Every native capability sits behind a small interface
 * with a web fallback, so the Phase 2 web build and unit tests run without Android.
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function platformName(): "android" | "ios" | "web" {
  const name = Capacitor.getPlatform();
  return name === "android" || name === "ios" ? name : "web";
}
