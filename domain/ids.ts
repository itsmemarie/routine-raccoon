import { v5 as uuidv5 } from "uuid";
import type { DayKey } from "./types";

/**
 * Fixed namespace for deterministic ids. Never change it: existing occurrence ids depend on it.
 */
export const OCCURRENCE_NAMESPACE = "6f1d3c2a-8b47-4e0f-9a6d-2c5b7e9f1a30";

/**
 * Deterministic occurrence id: the same task on the same logical day gets the same id on every
 * device, so two phones ticking offline converge on ONE row (upsert + last-write-wins) instead
 * of violating `unique (task_id, day_key)` (TECH_SPEC §2.4).
 */
export function occurrenceId(taskId: string, dayKey: DayKey): string {
  return uuidv5(`${taskId}:${dayKey}`, OCCURRENCE_NAMESPACE);
}
