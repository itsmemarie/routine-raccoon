import { SettingsSchema } from "@/domain/schemas";
import type {
  DayPlan,
  DayRecord,
  Occurrence,
  PlanSection,
  Section,
  Settings,
  Task,
} from "@/domain/types";

/**
 * Test factories. Synthetic data only: tests never use real user data (TECH_SPEC §4).
 * Ids are deterministic per factory call order within a test file via a counter.
 */
let counter = 0;
export function testId(): string {
  counter++;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

const T0 = "2026-09-01T08:00:00.000Z";
const synced = { created_at: T0, updated_at: T0, deleted_at: null };

export function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...SettingsSchema.parse({}), ...overrides };
}

export function plan(overrides: Partial<DayPlan> = {}): DayPlan {
  return {
    id: testId(),
    name: "Normal",
    description: "",
    kind: "primary",
    survival_level: null,
    rank: "a0",
    archived_at: null,
    ...synced,
    ...overrides,
  };
}

export function section(overrides: Partial<Section> = {}): Section {
  return {
    id: testId(),
    name: "Morning",
    description: "",
    color: "#E5134A",
    start_time: "07:00",
    recurrence: null,
    notify_on_start: true,
    notify_before_close: true,
    closing_lead_minutes: 15,
    length_override_minutes: null,
    archived_at: null,
    ...synced,
    ...overrides,
  };
}

export function link(planId: string, sectionId: string, rank = "a0"): PlanSection {
  return { plan_id: planId, section_id: sectionId, rank, ...synced };
}

export function task(overrides: Partial<Task> & Pick<Task, "section_id">): Task {
  return {
    id: testId(),
    rank: "a0",
    name: "Drink a pint",
    emoji: "💧",
    minutes: 10,
    hard: false,
    never_shrink: false,
    survival_level: null,
    recurrence: null,
    mantra: "",
    notes: "",
    video_url: "",
    location: "",
    steps: [],
    smaller_versions: {},
    archived_at: null,
    ...synced,
    ...overrides,
  };
}

export function occurrence(
  overrides: Partial<Occurrence> & Pick<Occurrence, "task_id" | "day_key">,
): Occurrence {
  return {
    id: testId(),
    status: "done",
    completed_at: T0,
    checked_step_ids: [],
    minutes_credited: null,
    survival_level_at_completion: null,
    carried_from_day_key: null,
    ...synced,
    ...overrides,
  };
}

export function dayRecord(overrides: Partial<DayRecord> & Pick<DayRecord, "day_key">): DayRecord {
  return {
    survival_on: false,
    survival_level: 2,
    closed_at: null,
    plan_id: null,
    ...synced,
    ...overrides,
  };
}
