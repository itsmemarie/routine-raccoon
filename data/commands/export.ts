import { buildExportJson, buildLogCsv, buildTasksCsv, exportFileName } from "@/domain/export";
import { normalizeSettings } from "@/domain/settings";
import type { AppError } from "@/lib/errors/app-error";
import { tryAsync, type Result } from "@/lib/errors/result";
import type { CommandContext } from "./context";
import { currentDayKey } from "./shared";

export type ExportKind = "json" | "tasks" | "log";

export interface ExportFile {
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: string;
}

/**
 * "Export all data" (PRD R14): reads everything in one read transaction and renders the file.
 * Saving it is the platform's job (lib/platform/files). Failure → RR-EXP-001 (storage that
 * can't be opened keeps its own RR-DB code, which tells the user what to do).
 */
export function prepareExport(
  ctx: CommandContext,
  input: { kind: ExportKind; appVersion: string },
): Promise<Result<ExportFile, AppError>> {
  return tryAsync(
    () =>
      ctx.db.transaction("r", ctx.db.tables, async () => {
        const db = ctx.db;
        const [plans, sections, planSections, tasks, occurrences, dayRecords, log, settingsRow] =
          await Promise.all([
            db.day_plans.toArray(),
            db.sections.toArray(),
            db.plan_sections.toArray(),
            db.tasks.toArray(),
            db.task_occurrences.toArray(),
            db.day_records.toArray(),
            db.log_entries.toArray(),
            db.user_settings.get("me"),
          ]);
        const settings = normalizeSettings(settingsRow?.settings);
        const dayKey = await currentDayKey(ctx);
        const data = {
          plans,
          sections,
          planSections,
          tasks,
          occurrences,
          dayRecords,
          log,
          settings,
          includeArchive: settings.exportArchive,
          exportedAt: ctx.now().toISOString(),
          appVersion: input.appVersion,
        };
        switch (input.kind) {
          case "json":
            return {
              fileName: exportFileName(dayKey, "json"),
              mimeType: "application/json",
              content: buildExportJson(data),
            };
          case "tasks":
            return {
              fileName: exportFileName(dayKey, "tasks"),
              mimeType: "text/csv",
              content: buildTasksCsv(data),
            };
          case "log":
            return {
              fileName: exportFileName(dayKey, "log"),
              mimeType: "text/csv",
              content: buildLogCsv(data),
            };
        }
      }),
    "RR-EXP-001",
  );
}
