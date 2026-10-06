import { z } from "zod";
import type { SyncTable } from "@/data/db/schema";
import {
  DayPlanSchema,
  DayRecordSchema,
  LogEntrySchema,
  OccurrenceSchema,
  PlanSectionSchema,
  SectionSchema,
  TaskSchema,
} from "@/domain/schemas";
import { normalizeSettings } from "@/domain/settings";
import type { RemoteRow } from "./gateway";

/**
 * Flip to true in the same change that applies migration
 * `20261003090000_routine_raccoon_hardening` to production. Until then the columns it adds
 * (`sections.length_override_minutes`, `day_records.plan_id`) stay on the device: pushing a
 * column PostgREST doesn't know fails the whole batch (PGRST204).
 */
export const HARDENING_MIGRATION_APPLIED = false;

/** Columns that exist locally but not (yet) remotely, per table. A pull must not wipe them. */
export const LOCAL_ONLY_COLUMNS: Record<SyncTable, readonly string[]> = {
  day_plans: [],
  sections: HARDENING_MIGRATION_APPLIED ? [] : ["length_override_minutes"],
  plan_sections: [],
  tasks: [],
  task_occurrences: [],
  day_records: HARDENING_MIGRATION_APPLIED ? [] : ["plan_id"],
  user_settings: [],
  log_entries: [],
};

/**
 * Row mapping between Dexie and Postgres.
 *
 * Push uses an explicit column ALLOWLIST per table (from database.types.ts), so local-only
 * fields (`_dirty`, `key`, `day_records.plan_id` until its migration lands) never reach the
 * server, and `user_id` / `server_*` are always left to the database.
 *
 * Pull validates every row with Zod (a trust boundary) before it touches local storage.
 */

export const REMOTE_COLUMNS: Record<SyncTable, readonly string[]> = {
  day_plans: [
    "id",
    "name",
    "description",
    "kind",
    "survival_level",
    "rank",
    "archived_at",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
  sections: [
    "id",
    "name",
    "description",
    "color",
    "start_time",
    "recurrence",
    "notify_on_start",
    "notify_before_close",
    "closing_lead_minutes",
    ...(HARDENING_MIGRATION_APPLIED ? ["length_override_minutes"] : []),
    "archived_at",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
  plan_sections: ["plan_id", "section_id", "rank", "created_at", "updated_at", "deleted_at"],
  tasks: [
    "id",
    "section_id",
    "rank",
    "name",
    "emoji",
    "minutes",
    "hard",
    "never_shrink",
    "survival_level",
    "recurrence",
    "mantra",
    "notes",
    "video_url",
    "location",
    "steps",
    "smaller_versions",
    "archived_at",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
  task_occurrences: [
    "id",
    "task_id",
    "day_key",
    "status",
    "completed_at",
    "checked_step_ids",
    "minutes_credited",
    "survival_level_at_completion",
    "carried_from_day_key",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
  day_records: [
    "day_key",
    "survival_on",
    "survival_level",
    "closed_at",
    ...(HARDENING_MIGRATION_APPLIED ? ["plan_id"] : []),
    "created_at",
    "updated_at",
    "deleted_at",
  ],
  user_settings: ["settings", "created_at", "updated_at", "deleted_at"],
  log_entries: [
    "id",
    "at",
    "day_key",
    "kind",
    "title",
    "meta",
    "task_id",
    "section_id",
    "updated_at",
  ],
};

/** PostgREST `on_conflict` target per table. */
export const CONFLICT_TARGET: Record<SyncTable, string> = {
  day_plans: "id",
  sections: "id",
  plan_sections: "plan_id,section_id",
  tasks: "id",
  task_occurrences: "id",
  day_records: "user_id,day_key",
  user_settings: "user_id",
  log_entries: "id",
};

/** Local primary key of a row, as Dexie expects it. */
export function localKey(
  table: SyncTable,
  row: Readonly<Record<string, unknown>>,
): string | [string, string] {
  switch (table) {
    case "plan_sections":
      return [String(row.plan_id), String(row.section_id)];
    case "day_records":
      return String(row.day_key);
    case "user_settings":
      return "me";
    case "day_plans":
    case "sections":
    case "tasks":
    case "task_occurrences":
    case "log_entries":
      return String(row.id);
  }
}

export function toRemote(table: SyncTable, row: Readonly<Record<string, unknown>>): RemoteRow {
  const out: Record<string, unknown> = {};
  for (const column of REMOTE_COLUMNS[table]) {
    if (column in row) out[column] = row[column];
  }
  return out;
}

const UserSettingsRemoteSchema = z.object({
  // The cloud copy may hold the retired app's key names; map them instead of resetting them.
  settings: z.unknown().transform(normalizeSettings),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

const PULL_SCHEMAS: Record<SyncTable, z.ZodType<Record<string, unknown>>> = {
  day_plans: DayPlanSchema,
  sections: SectionSchema,
  plan_sections: PlanSectionSchema,
  tasks: TaskSchema,
  task_occurrences: OccurrenceSchema,
  day_records: DayRecordSchema,
  user_settings: UserSettingsRemoteSchema,
  log_entries: LogEntrySchema,
};

/**
 * Validates a pulled row and shapes it for Dexie. Unknown columns (user_id, server_*) are
 * stripped by the schema. Returns null for an invalid row: the caller reports RR-DB-006 and
 * skips it rather than failing the whole pull.
 */
export function fromRemote(table: SyncTable, row: RemoteRow): Record<string, unknown> | null {
  const parsed = PULL_SCHEMAS[table].safeParse(row);
  if (!parsed.success) return null;
  const local: Record<string, unknown> = { ...parsed.data, _dirty: 0 };
  if (table === "user_settings") local.key = "me";
  return local;
}

/**
 * Keeps the device's value for columns the server doesn't have yet. Without this, pulling
 * another device's edit of a section would reset its local length override to null.
 */
export function preserveLocalOnly(
  table: SyncTable,
  remote: RemoteRow,
  incoming: Record<string, unknown>,
  existing: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  if (!existing) return incoming;
  const merged = { ...incoming };
  for (const column of LOCAL_ONLY_COLUMNS[table]) {
    if (!Object.hasOwn(remote, column) && Object.hasOwn(existing, column)) {
      merged[column] = existing[column];
    }
  }
  return merged;
}
