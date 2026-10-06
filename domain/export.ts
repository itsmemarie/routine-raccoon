import { compareRank } from "./rank";
import { recurrenceLabel } from "./recurrence";
import type {
  DayPlan,
  DayRecord,
  LogEntry,
  Occurrence,
  PlanSection,
  Section,
  Settings,
  Task,
} from "./types";

/**
 * "Export all data" (PRD R14/R20, GDPR portability). Plain files the user controls: a complete
 * JSON copy, plus CSVs of tasks and the log for spreadsheets. Deleted rows are never exported;
 * archived ones only when "Export the archive too" is on.
 */

export interface ExportInput {
  readonly plans: readonly DayPlan[];
  readonly sections: readonly Section[];
  readonly planSections: readonly PlanSection[];
  readonly tasks: readonly Task[];
  readonly occurrences: readonly Occurrence[];
  readonly dayRecords: readonly DayRecord[];
  readonly log: readonly LogEntry[];
  readonly settings: Settings;
  readonly includeArchive: boolean;
  readonly exportedAt: string;
  readonly appVersion: string;
}

export const EXPORT_FORMAT = "routine-raccoon-export";
export const EXPORT_FORMAT_VERSION = 1;

const live = <T extends { deleted_at: string | null }>(rows: readonly T[]) =>
  rows.filter((r) => r.deleted_at === null);

/** Rows to export after applying the archive setting. */
export function exportRows(input: ExportInput) {
  const keep = <T extends { deleted_at: string | null; archived_at: string | null }>(
    rows: readonly T[],
  ) => live(rows).filter((r) => input.includeArchive || r.archived_at === null);
  const plans = keep(input.plans).sort(compareRank);
  const sections = keep(input.sections);
  const planIds = new Set(plans.map((p) => p.id));
  const sectionIds = new Set(sections.map((s) => s.id));
  const planSections = live(input.planSections)
    .filter((l) => planIds.has(l.plan_id) && sectionIds.has(l.section_id))
    .sort(compareRank);
  const tasks = keep(input.tasks)
    .filter((t) => sectionIds.has(t.section_id))
    .sort(compareRank);
  const taskIds = new Set(tasks.map((t) => t.id));
  const occurrences = live(input.occurrences)
    .filter((o) => taskIds.has(o.task_id))
    .sort((a, b) => (a.day_key < b.day_key ? -1 : a.day_key > b.day_key ? 1 : 0));
  return {
    plans,
    sections,
    planSections,
    tasks,
    occurrences,
    dayRecords: live(input.dayRecords),
    log: [...input.log].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)),
  };
}

/** The complete copy as pretty-printed JSON. */
export function buildExportJson(input: ExportInput): string {
  const rows = exportRows(input);
  return `${JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: EXPORT_FORMAT_VERSION,
      exportedAt: input.exportedAt,
      app: { name: "Routine Raccoon", version: input.appVersion },
      includesArchive: input.includeArchive,
      settings: input.settings,
      dayPlans: rows.plans,
      sections: rows.sections,
      planSections: rows.planSections,
      tasks: rows.tasks,
      taskOccurrences: rows.occurrences,
      dayRecords: rows.dayRecords,
      log: rows.log,
    },
    null,
    2,
  )}\n`;
}

/**
 * One CSV cell (RFC 4180). Cells a spreadsheet would run as a formula (=, +, -, @, tab, CR)
 * get a leading apostrophe so a pasted task name can never execute (CSV injection).
 */
export function csvCell(value: string | number | boolean | null): string {
  let text = value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: readonly (readonly (string | number | boolean | null)[])[]): string {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** Tasks in Day Plan → section → task order, one row per task. */
export function buildTasksCsv(input: ExportInput): string {
  const rows = exportRows(input);
  const planNamesBySection = new Map<string, string[]>();
  for (const link of rows.planSections) {
    const plan = rows.plans.find((p) => p.id === link.plan_id);
    if (!plan) continue;
    planNamesBySection.set(link.section_id, [
      ...(planNamesBySection.get(link.section_id) ?? []),
      plan.name,
    ]);
  }
  const sectionsById = new Map(rows.sections.map((s) => [s.id, s]));
  const header = [
    "Day Plans",
    "Section",
    "Task",
    "Emoji",
    "Minutes",
    "Smaller minutes",
    "Hard",
    "Frequency",
    "Steps",
    "Mantra",
    "Notes",
    "Location",
    "Video",
    "Archived",
  ];
  const body = rows.tasks.map((task) => [
    (planNamesBySection.get(task.section_id) ?? []).join("; "),
    sectionsById.get(task.section_id)?.name ?? "",
    task.name,
    task.emoji,
    task.minutes,
    task.smaller_versions.minutes ?? null,
    task.hard,
    recurrenceLabel(task.recurrence),
    task.steps.map((s) => s.text).join(" / "),
    task.mantra,
    task.notes,
    task.location,
    task.video_url,
    task.archived_at !== null,
  ]);
  return csv([header, ...body]);
}

/** The full log, oldest first. `at` is written in UTC (ISO 8601) so it sorts and imports cleanly. */
export function buildLogCsv(input: Pick<ExportInput, "log">): string {
  const sorted = [...input.log].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return csv([
    ["Day", "When (UTC)", "Kind", "Title", "Details"],
    ...sorted.map((e) => [e.day_key, e.at, e.kind, e.title, e.meta]),
  ]);
}

/** File name with the export date, e.g. "routine-raccoon-2026-09-08.json". */
export function exportFileName(dayKey: string, kind: "json" | "tasks" | "log"): string {
  return kind === "json"
    ? `routine-raccoon-${dayKey}.json`
    : `routine-raccoon-${kind}-${dayKey}.csv`;
}
