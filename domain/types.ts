import type { z } from "zod";
import type {
  DayPlanSchema,
  DayRecordSchema,
  LogEntrySchema,
  LogKindSchema,
  OccurrenceSchema,
  PlanSectionSchema,
  RecurrenceSchema,
  SectionSchema,
  SettingsSchema,
  SmallerVersionSchema,
  StepSchema,
  SurvivalLevelSchema,
  TaskSchema,
} from "./schemas";

/** 'YYYY-MM-DD', the logical day (see domain/time.ts dayKeyFor). */
export type DayKey = string;
/** 'HH:MM', 24h. */
export type HHMM = string;

export type SurvivalLevel = z.infer<typeof SurvivalLevelSchema>;
export type Recurrence = z.infer<typeof RecurrenceSchema>;
export type Step = z.infer<typeof StepSchema>;
export type SmallerVersion = z.infer<typeof SmallerVersionSchema>;
export type Settings = z.infer<typeof SettingsSchema>;

export type DayPlan = z.infer<typeof DayPlanSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type PlanSection = z.infer<typeof PlanSectionSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Occurrence = z.infer<typeof OccurrenceSchema>;
export type DayRecord = z.infer<typeof DayRecordSchema>;
export type LogKind = z.infer<typeof LogKindSchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;

/** Rows that are live: not soft-deleted. Archived rows are live but hidden from Today. */
export function isLive(row: { deleted_at: string | null }): boolean {
  return row.deleted_at === null;
}

export function isActive(row: { deleted_at: string | null; archived_at: string | null }): boolean {
  return row.deleted_at === null && row.archived_at === null;
}
