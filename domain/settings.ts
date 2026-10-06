import { SettingsSchema } from "./schemas";
import type { Settings } from "./types";

/**
 * Settings normalisation (TECH_SPEC §2.2).
 *
 * The cloud copy still holds a settings object written by the retired Expo app, with different
 * key names (verified against the live project on 3 Oct 2026). Parsing it straight through
 * SettingsSchema would silently reset every one of those values to its default, so legacy keys
 * are mapped first. A current key always wins over its legacy twin.
 */
const LEGACY_KEYS: Readonly<Record<string, keyof Settings>> = {
  showLevelPicker: "showLevel",
  carryOverUnfinished: "roll",
  exportIncludesArchive: "exportArchive",
  extraSupportThresholdMinutes: "longAt",
  defaultSurvivalLevel: "defaultLevel",
  survivalDayCountsAsFullDay: "survivalCountsAsFullDay",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Any stored settings value (current, legacy, partial, corrupt) → complete, valid Settings. */
export function normalizeSettings(raw: unknown): Settings {
  const source: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};
  for (const [legacy, current] of Object.entries(LEGACY_KEYS)) {
    if (!Object.hasOwn(source, current) && Object.hasOwn(source, legacy)) {
      source[current] = source[legacy];
    }
  }
  return SettingsSchema.parse(source);
}

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

/** Choices offered for the Extra Support threshold (handoff screen 15). */
export const LONG_AT_OPTIONS = [10, 15, 20, 30, 45] as const;
