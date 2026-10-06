import Dexie, { type EntityTable, type Table } from "dexie";
import type {
  DayPlan,
  DayRecord,
  LogEntry,
  Occurrence,
  PlanSection,
  Section,
  Settings,
  Task,
} from "@/domain/types";

/**
 * On-device database: the source of truth (TECH_SPEC D1, §2.3).
 *
 * Tables and columns mirror `app_routine_raccoon` 1:1 so rows move between Supabase, Dexie and
 * the domain without renaming. Local rows drop `user_id` / `server_*` and add `_dirty`
 * (1 = changed locally, not yet pushed). It's numeric because IndexedDB can't index booleans.
 *
 * Schema changes: add `this.version(N + 1).stores({...}).upgrade(tx => ...)`. Never edit an
 * existing version. A failing upgrade surfaces as RR-DB-004.
 */

export type Dirty = 0 | 1;
export type LocalRow<T> = T & { _dirty: Dirty };

export type LocalDayPlan = LocalRow<DayPlan>;
export type LocalSection = LocalRow<Section>;
export type LocalPlanSection = LocalRow<PlanSection>;
export type LocalTask = LocalRow<Task>;
export type LocalOccurrence = LocalRow<Occurrence>;
export type LocalDayRecord = LocalRow<DayRecord>;
export type LocalLogEntry = LocalRow<LogEntry>;

/** user_settings is one row per user remotely; locally it is the single row `key = "me"`. */
export interface LocalSettingsRow {
  readonly key: "me";
  settings: Settings;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  _dirty: Dirty;
}

/** Device-only key/value state: running timer, last seen day_key, sync quarantine. Never synced. */
export interface KvRow {
  readonly key: string;
  value: unknown;
}

export const SYNC_TABLES = [
  "day_plans",
  "sections",
  "plan_sections",
  "tasks",
  "task_occurrences",
  "day_records",
  "user_settings",
  "log_entries",
] as const;

/** Synced tables in FOREIGN-KEY order: parents are pushed before children. */
export type SyncTable = (typeof SYNC_TABLES)[number];

export interface SyncStateRow {
  readonly table: SyncTable;
  /** Highest `server_seq` applied locally for this table. */
  cursor: number;
}

export class RoutineDb extends Dexie {
  declare readonly day_plans: EntityTable<LocalDayPlan, "id">;
  declare readonly sections: EntityTable<LocalSection, "id">;
  declare readonly plan_sections: Table<LocalPlanSection, [string, string]>;
  declare readonly tasks: EntityTable<LocalTask, "id">;
  declare readonly task_occurrences: EntityTable<LocalOccurrence, "id">;
  declare readonly day_records: EntityTable<LocalDayRecord, "day_key">;
  declare readonly user_settings: EntityTable<LocalSettingsRow, "key">;
  declare readonly log_entries: EntityTable<LocalLogEntry, "id">;
  declare readonly kv: EntityTable<KvRow, "key">;
  declare readonly sync_state: EntityTable<SyncStateRow, "table">;

  constructor(name = "routine-raccoon") {
    super(name);
    this.version(1).stores({
      day_plans: "id, kind, _dirty",
      sections: "id, _dirty",
      plan_sections: "[plan_id+section_id], plan_id, section_id, _dirty",
      tasks: "id, section_id, _dirty",
      task_occurrences: "id, &[task_id+day_key], day_key, task_id, _dirty",
      day_records: "day_key, _dirty",
      user_settings: "key, _dirty",
      log_entries: "id, at, day_key, task_id, kind, _dirty",
      kv: "key",
      sync_state: "table",
    });
    // v2 (M1): columns that exist locally before their remote migration lands. Rows written by
    // v1 lack them; fill the defaults so every read sees the full shape. Not a user edit, so
    // `_dirty` is left as it was.
    this.version(2)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table<Record<string, unknown>>("sections")
          .toCollection()
          .modify((row) => {
            if (row.length_override_minutes === undefined) row.length_override_minutes = null;
          });
        await tx
          .table<Record<string, unknown>>("day_records")
          .toCollection()
          .modify((row) => {
            if (row.plan_id === undefined) row.plan_id = null;
          });
      });
  }
}
