"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/data/db/client";
import { matchesLogFilter, type LogFilter } from "@/domain/log";
import type { LogEntry } from "@/domain/types";
import { toAppError } from "@/lib/errors/app-error";

export interface LogPage {
  readonly entries: readonly LogEntry[];
  /** More entries exist beyond `limit`. */
  readonly hasMore: boolean;
}

/**
 * The read-only Log, newest first: everything (with a filter) or one task's activity.
 * `limit` grows as the user asks for older entries.
 */
export function useLog(options: {
  filter: LogFilter;
  taskId: string | null;
  limit: number;
}): LogPage | undefined {
  const { filter, taskId, limit } = options;
  return useLiveQuery(async () => {
    try {
      const db = getDb();
      let entries: LogEntry[];
      if (taskId) {
        entries = (await db.log_entries.where("task_id").equals(taskId).toArray()).sort((a, b) =>
          a.at < b.at ? 1 : a.at > b.at ? -1 : 0,
        );
        entries = entries.slice(0, limit + 1);
      } else {
        entries = await db.log_entries
          .orderBy("at")
          .reverse()
          .filter((e) => matchesLogFilter(filter, e.kind))
          .limit(limit + 1)
          .toArray();
      }
      return { entries: entries.slice(0, limit), hasMore: entries.length > limit };
    } catch (error) {
      throw toAppError(error, "RR-DB-001");
    }
  }, [filter, taskId, limit]);
}

/** Number of log entries (Settings → Data → Log). */
export function useLogCount(): number | undefined {
  return useLiveQuery(async () => {
    try {
      return await getDb().log_entries.count();
    } catch (error) {
      throw toAppError(error, "RR-DB-001");
    }
  }, []);
}
