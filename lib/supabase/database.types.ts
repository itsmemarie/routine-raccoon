// Types for the app_routine_raccoon schema in the shared "Master of Projects" project.
// Hand-written because the Supabase type generator only covers `public`; keep in sync
// with migrations. Other apps' schemas (app_cravings, app_recipes, ...) are deliberately
// left out so they can't be queried from this app by accident.
//
// Sync conventions inherited from the original app (enforced by the `stamp` trigger):
// - `id`, `created_at` and `updated_at` have no DB default: the client generates them.
// - An UPDATE with an older `updated_at` than the stored row is silently dropped (last write wins).
// - `server_seq` / `server_updated_at` are always overwritten by the server.
// - Rows are soft-deleted via `deleted_at`; there is no DELETE grant.
// - `user_id` defaults to auth.uid() and cannot be changed.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Simplify<T> = { [K in keyof T]: T[K] } & {};

// Insert shape: columns with a DB default (or nullable) become optional.
type InsertOf<Row, Optional extends keyof Row> = Simplify<
  Omit<Row, Optional> & Partial<Pick<Row, Optional>>
>;

type ServerStamped = "user_id" | "server_seq" | "server_updated_at";

type DayPlanRow = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  kind: "primary" | "survival" | "custom";
  /** 1-3; set only when kind = 'survival'. */
  survival_level: number | null;
  rank: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_seq: number;
  server_updated_at: string;
};

type DayRecordRow = {
  user_id: string;
  day_key: string;
  survival_on: boolean;
  survival_level: number;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_seq: number;
  server_updated_at: string;
};

type LogEntryRow = {
  id: string;
  user_id: string;
  at: string;
  day_key: string;
  kind:
    | "completed"
    | "uncompleted"
    | "skipped"
    | "added"
    | "edited"
    | "imported"
    | "survival"
    | "closed";
  title: string;
  meta: string;
  task_id: string | null;
  section_id: string | null;
  updated_at: string;
  server_seq: number;
  server_updated_at: string;
};

type PlanSectionRow = {
  plan_id: string;
  section_id: string;
  user_id: string;
  rank: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_seq: number;
  server_updated_at: string;
};

type SectionRow = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  color: string;
  /** "HH:MM", 24h. */
  start_time: string | null;
  recurrence: Json | null;
  notify_on_start: boolean;
  notify_before_close: boolean;
  closing_lead_minutes: number | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_seq: number;
  server_updated_at: string;
};

type TaskOccurrenceRow = {
  id: string;
  user_id: string;
  task_id: string;
  day_key: string;
  status: "pending" | "done" | "skipped";
  completed_at: string | null;
  checked_step_ids: Json;
  minutes_credited: number | null;
  survival_level_at_completion: number | null;
  carried_from_day_key: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_seq: number;
  server_updated_at: string;
};

type TaskRow = {
  id: string;
  user_id: string;
  section_id: string;
  rank: string;
  name: string;
  emoji: string;
  /** 1-600. */
  minutes: number;
  hard: boolean;
  never_shrink: boolean;
  survival_level: number | null;
  recurrence: Json | null;
  mantra: string;
  notes: string;
  video_url: string;
  location: string;
  steps: Json;
  smaller_versions: Json;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_seq: number;
  server_updated_at: string;
};

type UserSettingsRow = {
  user_id: string;
  settings: Json;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_seq: number;
  server_updated_at: string;
};

type Table<Row, Optional extends keyof Row, Relationships extends unknown[] = []> = {
  Row: Row;
  Insert: InsertOf<Row, Optional>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  app_routine_raccoon: {
    Tables: {
      day_plans: Table<
        DayPlanRow,
        ServerStamped | "description" | "survival_level" | "archived_at" | "deleted_at"
      >;
      day_records: Table<
        DayRecordRow,
        ServerStamped | "survival_on" | "survival_level" | "closed_at" | "deleted_at"
      >;
      log_entries: Table<
        LogEntryRow,
        ServerStamped | "meta" | "task_id" | "section_id" | "updated_at"
      >;
      plan_sections: Table<
        PlanSectionRow,
        ServerStamped | "deleted_at",
        [
          {
            foreignKeyName: "plan_sections_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "day_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_sections_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["id"];
          },
        ]
      >;
      sections: Table<
        SectionRow,
        | ServerStamped
        | "description"
        | "start_time"
        | "recurrence"
        | "notify_on_start"
        | "notify_before_close"
        | "closing_lead_minutes"
        | "archived_at"
        | "deleted_at"
      >;
      task_occurrences: Table<
        TaskOccurrenceRow,
        | ServerStamped
        | "completed_at"
        | "checked_step_ids"
        | "minutes_credited"
        | "survival_level_at_completion"
        | "carried_from_day_key"
        | "deleted_at",
        [
          {
            foreignKeyName: "task_occurrences_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ]
      >;
      tasks: Table<
        TaskRow,
        | ServerStamped
        | "hard"
        | "never_shrink"
        | "survival_level"
        | "recurrence"
        | "mantra"
        | "notes"
        | "video_url"
        | "location"
        | "steps"
        | "smaller_versions"
        | "archived_at"
        | "deleted_at",
        [
          {
            foreignKeyName: "tasks_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["id"];
          },
        ]
      >;
      user_settings: Table<UserSettingsRow, ServerStamped | "deleted_at">;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      /** Counts one AI-assist call for today; returns false once over the limit. */
      consume_assist_quota: {
        Args: { daily_limit?: number };
        Returns: boolean;
      };
      /**
       * Email-first sign-in hint: { exists, providers[], first_name }. Rate limited per IP and
       * per email (migration 20261004120000_routine_raccoon_account_rpcs, pending approval).
       */
      lookup_account: {
        Args: { p_email: string };
        Returns: Json;
      };
      /** Deletes every app_routine_raccoon row of the calling user (same migration). */
      delete_my_data: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type AppSchema = Database["app_routine_raccoon"];

export type Tables<T extends keyof AppSchema["Tables"]> = AppSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof AppSchema["Tables"]> = AppSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof AppSchema["Tables"]> = AppSchema["Tables"][T]["Update"];
