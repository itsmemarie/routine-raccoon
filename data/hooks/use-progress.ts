"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/data/db/client";
import { LOOKBACK_DAYS, type ProgressInput } from "@/domain/progress";
import { normalizeSettings } from "@/domain/settings";
import { addDays, daysBetween, daysInMonth, partsOf } from "@/domain/time";
import type { DayKey } from "@/domain/types";
import { toAppError } from "@/lib/errors/app-error";

/**
 * The data Progress needs for one month, live: the definitions, and occurrences and day
 * records from LOOKBACK_DAYS before `today` (for "days running") through the month's end.
 */
export function useProgressInput(month: DayKey, today: DayKey | null): ProgressInput | undefined {
  return useLiveQuery(async () => {
    if (!today) return undefined;
    try {
      const db = getDb();
      const { year, month: m } = partsOf(month);
      const first = `${year}-${String(m).padStart(2, "0")}-01`;
      const last = addDays(first, daysInMonth(year, m) - 1);
      const lookback = addDays(today, -LOOKBACK_DAYS);
      const from = daysBetween(first, lookback) < 0 ? lookback : first;
      const to = daysBetween(today, last) > 0 ? last : today;
      const [plans, planSections, sections, tasks, occurrences, dayRecords, settingsRow] =
        await Promise.all([
          db.day_plans.toArray(),
          db.plan_sections.toArray(),
          db.sections.toArray(),
          db.tasks.toArray(),
          db.task_occurrences.where("day_key").between(from, to, true, true).toArray(),
          db.day_records.where(":id").between(from, to, true, true).toArray(),
          db.user_settings.get("me"),
        ]);
      return {
        month,
        today,
        definitions: { plans, planSections, sections, tasks },
        occurrences,
        dayRecords,
        settings: normalizeSettings(settingsRow?.settings),
      };
    } catch (error) {
      throw toAppError(error, "RR-DB-001");
    }
  }, [month, today]);
}
