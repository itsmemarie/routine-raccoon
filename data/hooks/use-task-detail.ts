"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/data/db/client";
import { readDayInput } from "@/data/db/queries";
import type { RoutineDb } from "@/data/db/schema";
import { plansOfSection, survivalPlansWithTask } from "@/domain/organise";
import { dayFactsReader, LOOKBACK_DAYS, skipRun } from "@/domain/progress";
import { addDays } from "@/domain/time";
import { buildToday, type TodayTask } from "@/domain/today";
import type { DayKey, DayPlan, Occurrence, Section, Settings, Task } from "@/domain/types";
import { toAppError } from "@/lib/errors/app-error";

export interface TaskDetail {
  readonly task: Task;
  readonly section: Section | null;
  /** Live plans the task's section is in. */
  readonly plans: readonly DayPlan[];
  /** Today's occurrence (ticks, checked steps), if any. */
  readonly occurrence: Occurrence | null;
  /** The task as Today shows it (minutes, shrunk, done), or null when it isn't on today's list. */
  readonly today: TodayTask | null;
  readonly survivalOn: boolean;
  /** Days running it wasn't done ("Skipped" info row). */
  readonly skipRun: number;
  /** Survival plans holding a same-named copy ("Also in"). */
  readonly alsoIn: readonly DayPlan[];
  readonly settings: Settings;
}

async function readRange(db: RoutineDb, from: DayKey, to: DayKey) {
  const [occurrences, dayRecords] = await Promise.all([
    db.task_occurrences.where("day_key").between(from, to, true, true).toArray(),
    db.day_records.where(":id").between(from, to, true, true).toArray(),
  ]);
  return { occurrences, dayRecords };
}

/**
 * Everything Task detail shows, live. `null` when the task doesn't exist or was deleted (the
 * screen shows RR-DB-005); `undefined` while loading.
 */
export function useTaskDetail(
  taskId: string,
  dayKey: DayKey | null,
): TaskDetail | null | undefined {
  return useLiveQuery(async () => {
    if (!dayKey) return undefined;
    try {
      const db = getDb();
      const day = await readDayInput(db, dayKey);
      const task = day.tasks.find((t) => t.id === taskId);
      if (!task || task.deleted_at !== null) return null;
      const org = day;
      const view = buildToday({ ...day, filter: "all" });
      const today =
        view.sections.flatMap((s) => s.tasks).find((item) => item.task.id === taskId) ?? null;
      const range = await readRange(db, addDays(dayKey, -LOOKBACK_DAYS), dayKey);
      const factsOf = dayFactsReader({
        month: dayKey,
        today: dayKey,
        definitions: day,
        occurrences: range.occurrences,
        dayRecords: range.dayRecords,
        settings: day.settings,
      });
      return {
        task,
        section:
          day.sections.find((s) => s.id === task.section_id && s.deleted_at === null) ?? null,
        plans: plansOfSection(org, task.section_id),
        occurrence:
          day.occurrences.find((o) => o.task_id === taskId && o.deleted_at === null) ?? null,
        today,
        survivalOn: view.survivalOn,
        skipRun: skipRun(taskId, dayKey, factsOf),
        alsoIn: task.survival_level === null ? survivalPlansWithTask(org, task) : [],
        settings: day.settings,
      };
    } catch (error) {
      throw toAppError(error, "RR-DB-001");
    }
  }, [taskId, dayKey]);
}
