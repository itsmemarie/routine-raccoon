import { normalizeSettings } from "@/domain/settings";
import type { DayInput } from "@/domain/today";
import type { DayKey } from "@/domain/types";
import type { RoutineDb } from "./schema";

export type { DayInput };

/**
 * Reads one consistent snapshot of the definitions plus one day's occurrences and record.
 * Shared by the live hooks (inside liveQuery) and by commands (inside their transaction), so
 * the screen and the write path always agree on what "today" contains.
 */
export async function readDayInput(db: RoutineDb, dayKey: DayKey): Promise<DayInput> {
  const [plans, planSections, sections, tasks, occurrences, dayRecord, settingsRow] =
    await Promise.all([
      db.day_plans.toArray(),
      db.plan_sections.toArray(),
      db.sections.toArray(),
      db.tasks.toArray(),
      db.task_occurrences.where("day_key").equals(dayKey).toArray(),
      db.day_records.get(dayKey),
      db.user_settings.get("me"),
    ]);
  return {
    dayKey,
    plans,
    planSections,
    sections,
    tasks,
    occurrences,
    dayRecord: dayRecord && dayRecord.deleted_at === null ? dayRecord : null,
    settings: normalizeSettings(settingsRow?.settings),
  };
}
