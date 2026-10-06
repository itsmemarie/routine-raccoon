import { link, occurrence, plan, section, settings, task } from "@/tests/factories";
import {
  buildExportJson,
  buildLogCsv,
  buildTasksCsv,
  csvCell,
  exportFileName,
  exportRows,
  type ExportInput,
} from "./export";
import type { LogEntry } from "./types";

function input(includeArchive: boolean): ExportInput {
  const normal = plan({ name: "Normal" });
  const old = plan({
    name: "Old",
    kind: "custom",
    archived_at: "2026-08-01T00:00:00Z",
    rank: "a1",
  });
  const gone = plan({
    name: "Gone",
    kind: "custom",
    deleted_at: "2026-08-01T00:00:00Z",
    rank: "a2",
  });
  const morning = section({ name: "Morning" });
  const shelf = section({ name: "Shelf", archived_at: "2026-08-01T00:00:00Z" });
  const pint = task({
    section_id: morning.id,
    name: "=cmd|' /C calc'!A0",
    steps: [
      { id: "a", text: "Fill" },
      { id: "b", text: 'Say "cheers"' },
    ],
  });
  const archivedTask = task({ section_id: shelf.id, name: "Dust" });
  const deletedTask = task({ section_id: morning.id, name: "Deleted", deleted_at: "x" });
  const log: LogEntry = {
    id: "00000000-0000-4000-8000-00000000c001",
    at: "2026-09-08T07:41:00.000Z",
    day_key: "2026-09-08",
    kind: "completed",
    title: "Completed Pint",
    meta: "Morning, 2 min",
    task_id: pint.id,
    section_id: morning.id,
    updated_at: "2026-09-08T07:41:00.000Z",
  };
  return {
    plans: [normal, old, gone],
    sections: [morning, shelf],
    planSections: [link(normal.id, morning.id), link(old.id, shelf.id)],
    tasks: [pint, archivedTask, deletedTask],
    occurrences: [occurrence({ task_id: pint.id, day_key: "2026-09-08" })],
    dayRecords: [],
    log: [log],
    settings: settings(),
    includeArchive,
    exportedAt: "2026-09-08T10:00:00.000Z",
    appVersion: "1.0.0",
  };
}

describe("export", () => {
  it("never exports deleted rows; archived ones only when asked", () => {
    const without = exportRows(input(false));
    expect(without.plans.map((p) => p.name)).toEqual(["Normal"]);
    expect(without.tasks.map((t) => t.name)).toEqual(["=cmd|' /C calc'!A0"]);
    const withArchive = exportRows(input(true));
    expect(withArchive.plans.map((p) => p.name)).toEqual(["Normal", "Old"]);
    expect(withArchive.tasks.map((t) => t.name)).toContain("Dust");
    expect(withArchive.tasks.map((t) => t.name)).not.toContain("Deleted");
  });

  it("writes a versioned JSON copy", () => {
    const parsed: unknown = JSON.parse(buildExportJson(input(true)));
    expect(parsed).toMatchObject({
      format: "routine-raccoon-export",
      version: 1,
      includesArchive: true,
      app: { version: "1.0.0" },
    });
  });

  it("CSV escapes quotes, commas and newlines and neutralises formulas", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@here")).toBe("'@here");
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
    expect(csvCell(true)).toBe("true");
  });

  it("tasks CSV has one row per task with plans, section and steps", () => {
    const lines = buildTasksCsv(input(false)).trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Day Plans,Section,Task,Emoji,Minutes/);
    expect(lines[1]).toContain("Normal,Morning,'=cmd|' /C calc'!A0");
    expect(lines[1]).toContain('"Fill / Say ""cheers"""');
    expect(lines[1]).toContain("every day");
  });

  it("log CSV lists entries oldest first", () => {
    const lines = buildLogCsv(input(false)).trimEnd().split("\r\n");
    expect(lines).toEqual([
      "Day,When (UTC),Kind,Title,Details",
      '2026-09-08,2026-09-08T07:41:00.000Z,completed,Completed Pint,"Morning, 2 min"',
    ]);
  });

  it("file names carry the day", () => {
    expect(exportFileName("2026-09-08", "json")).toBe("routine-raccoon-2026-09-08.json");
    expect(exportFileName("2026-09-08", "log")).toBe("routine-raccoon-log-2026-09-08.csv");
  });
});
