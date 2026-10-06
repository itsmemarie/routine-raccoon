import { z } from "zod";

/**
 * Zod schemas for every entity and JSON column (TECH_SPEC §2.2). Types in domain/types.ts are
 * inferred from these, so the runtime check and the compile-time type can't drift.
 *
 * Parse at trust boundaries: remote pull, import, Dexie upgrade. Column names mirror Postgres
 * (snake_case) so rows move between Supabase, Dexie and the domain without renaming.
 */

export const UuidSchema = z.uuid();
export const DayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const HHMMSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24h)");
export const IsoDateTimeSchema = z.string().min(1);
export const SurvivalLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/** Google-Calendar-shaped recurrence. `n` is an INTERVAL ("every n weeks"). 0 = Monday. */
export const RecurrenceSchema = z.object({
  kind: z.enum(["every day", "every week", "every month", "custom"]),
  days: z.array(z.number().int().min(0).max(6)).default([]),
  n: z.number().int().min(1).max(99).default(1),
  per: z.enum(["day", "week", "month", "year"]).default("week"),
  ends: z.enum(["never", "count", "date"]).default("never"),
  count: z.number().int().min(1).max(999).optional(),
  until: DayKeySchema.optional(),
  /** Interval anchor. Defaults to the day the row was created. */
  start: DayKeySchema.optional(),
});

export const StepSchema = z.object({ id: z.string().min(1), text: z.string().max(300) });
export const StepsSchema = z.array(StepSchema).max(50);

/** tasks.smaller_versions (prototype `svMins` + optional smaller content). */
export const SmallerVersionSchema = z.object({
  minutes: z.number().int().min(1).max(600).optional(),
  steps: StepsSchema.optional(),
  text: z.string().max(4000).optional(),
});

/**
 * user_settings.settings. Every key falls back to its default on a missing or invalid value,
 * so an older or newer app version can never crash on settings (forward/backward compatible).
 */
export const SettingsSchema = z.object({
  showLevel: z.boolean().catch(true),
  roll: z.boolean().catch(false),
  firstStep: z.boolean().catch(false),
  exportArchive: z.boolean().catch(true),
  resetAt: HHMMSchema.catch("00:00"),
  longAt: z.number().int().min(1).max(600).catch(20),
  keepSurvivalOvernight: z.boolean().catch(false),
  survivalName: z.string().min(1).max(40).catch("Survival Mode"),
  defaultLevel: SurvivalLevelSchema.catch(2),
  survivalCountsAsFullDay: z.boolean().catch(false),
});

const synced = {
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
  deleted_at: IsoDateTimeSchema.nullable(),
};

export const DayPlanSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(80),
  description: z.string().max(4000),
  kind: z.enum(["primary", "survival", "custom"]),
  survival_level: SurvivalLevelSchema.nullable(),
  rank: z.string().min(1),
  archived_at: IsoDateTimeSchema.nullable(),
  ...synced,
});

export const SectionSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(80),
  description: z.string().max(4000),
  color: z.string().max(40),
  start_time: HHMMSchema.nullable(),
  recurrence: RecurrenceSchema.nullable(),
  notify_on_start: z.boolean(),
  notify_before_close: z.boolean(),
  closing_lead_minutes: z.number().int().min(0).max(240).nullable(),
  /** Fixed section length; null = the sum of its tasks. Remote column pending migration. */
  length_override_minutes: z.number().int().min(1).max(600).nullable().default(null),
  archived_at: IsoDateTimeSchema.nullable(),
  ...synced,
});

export const PlanSectionSchema = z.object({
  plan_id: UuidSchema,
  section_id: UuidSchema,
  rank: z.string().min(1),
  ...synced,
});

export const TaskSchema = z.object({
  id: UuidSchema,
  section_id: UuidSchema,
  rank: z.string().min(1),
  name: z.string().min(1).max(80),
  emoji: z.string().min(1).max(16),
  minutes: z.number().int().min(1).max(600),
  hard: z.boolean(),
  never_shrink: z.boolean(),
  survival_level: SurvivalLevelSchema.nullable(),
  recurrence: RecurrenceSchema.nullable(),
  mantra: z.string().max(300),
  notes: z.string().max(4000),
  video_url: z.string().max(500),
  location: z.string().max(120),
  steps: StepsSchema,
  smaller_versions: SmallerVersionSchema,
  archived_at: IsoDateTimeSchema.nullable(),
  ...synced,
});

export const OccurrenceSchema = z.object({
  id: UuidSchema,
  task_id: UuidSchema,
  day_key: DayKeySchema,
  status: z.enum(["pending", "done", "skipped"]),
  completed_at: IsoDateTimeSchema.nullable(),
  checked_step_ids: z.array(z.string()),
  minutes_credited: z.number().int().min(0).nullable(),
  survival_level_at_completion: SurvivalLevelSchema.nullable(),
  carried_from_day_key: DayKeySchema.nullable(),
  ...synced,
});

export const DayRecordSchema = z.object({
  day_key: DayKeySchema,
  survival_on: z.boolean(),
  survival_level: SurvivalLevelSchema,
  closed_at: IsoDateTimeSchema.nullable(),
  /** Non-survival plan picked for this day; null = primary. Remote column pending migration. */
  plan_id: UuidSchema.nullable().default(null),
  ...synced,
});

export const LogKindSchema = z.enum([
  "completed",
  "uncompleted",
  "skipped",
  "added",
  "edited",
  "imported",
  "survival",
  "closed",
]);

export const LogEntrySchema = z.object({
  id: UuidSchema,
  at: IsoDateTimeSchema,
  day_key: DayKeySchema,
  kind: LogKindSchema,
  title: z.string().max(200),
  meta: z.string().max(300),
  task_id: UuidSchema.nullable(),
  section_id: UuidSchema.nullable(),
  updated_at: IsoDateTimeSchema,
});
