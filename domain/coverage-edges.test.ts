import { link, occurrence, plan, section, settings, task } from "@/tests/factories";
import { ERROR_CODES, definitionOf, messageFor } from "@/lib/errors/codes";
import { firstNameFromEmail } from "./auth";
import { exportRows } from "./export";
import { planSectionNotifications } from "./notifications";
import { archivedPlans, archivedSections } from "./organise";
import { rankForPosition, type Ranked } from "./rank";
import { addDays, formatHHMM12, toClock12 } from "./time";
import { buildToday } from "./today";
import type { LogEntry } from "./types";

/** Edge cases that keep the defensive branches honest. */
describe("domain edge cases", () => {
  it("first names from unusual emails", () => {
    expect(firstNameFromEmail("sam")).toBe("Sam");
    expect(firstNameFromEmail("9lives@x.com")).toBe("there");
  });

  it("rank placement tolerates holes in the sibling list", () => {
    const sparse = new Array<Ranked>(2) as unknown as Ranked[];
    expect(rankForPosition(sparse, 1).rank).toBeTruthy();
  });

  it("time helpers survive malformed input", () => {
    expect(formatHHMM12("nope")).toBe("12:00 AM");
    expect(toClock12("nope")).toEqual({ hour: 12, minute: 0, period: "AM" });
    expect(addDays("2026", 1)).toBe("2026-01-02");
  });

  it("archive lists put the most recently archived first", () => {
    const a = plan({ name: "A", kind: "custom", archived_at: "2026-08-01T00:00:00Z" });
    const b = plan({ name: "B", kind: "custom", archived_at: "2026-09-01T00:00:00Z" });
    const c = plan({ name: "C", kind: "custom", archived_at: "2026-09-01T00:00:00Z" });
    const s1 = section({ name: "S1", archived_at: "2026-07-01T00:00:00Z" });
    const s2 = section({ name: "S2", archived_at: "2026-07-02T00:00:00Z" });
    const org = { plans: [a, b, c], planSections: [], sections: [s1, s2], tasks: [] };
    expect(archivedPlans(org).map((x) => x.plan.name)).toEqual(["B", "C", "A"]);
    expect(archivedSections(org).map((x) => x.section.name)).toEqual(["S2", "S1"]);
  });

  it("exports sort occurrences by day and the log by time, ties kept", () => {
    const normal = plan();
    const morning = section();
    const pint = task({ section_id: morning.id });
    const entry = (id: string, at: string): LogEntry => ({
      id,
      at,
      day_key: at.slice(0, 10),
      kind: "added",
      title: id,
      meta: "",
      task_id: null,
      section_id: null,
      updated_at: at,
    });
    const rows = exportRows({
      plans: [normal],
      sections: [morning],
      planSections: [link(normal.id, morning.id)],
      tasks: [pint],
      occurrences: [
        occurrence({ task_id: pint.id, day_key: "2026-09-03" }),
        occurrence({ task_id: pint.id, day_key: "2026-09-01" }),
        occurrence({ task_id: pint.id, day_key: "2026-09-03" }),
      ],
      dayRecords: [],
      log: [
        entry("b", "2026-09-02T00:00:00Z"),
        entry("a", "2026-09-01T00:00:00Z"),
        entry("c", "2026-09-02T00:00:00Z"),
      ],
      settings: settings(),
      includeArchive: true,
      exportedAt: "x",
      appVersion: "1",
    });
    expect(rows.occurrences.map((o) => o.day_key)).toEqual([
      "2026-09-01",
      "2026-09-03",
      "2026-09-03",
    ]);
    expect(rows.log.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("block-closing notifications summarise long lists", () => {
    const normal = plan();
    const morning = section({ name: "Morning", start_time: "07:00" });
    const later = section({ name: "Later", start_time: "12:00" });
    const tasks = ["A", "B", "C", "D", "E"].map((name, i) =>
      task({ section_id: morning.id, name, rank: `a${i}` }),
    );
    const view = buildToday({
      dayKey: "2026-09-08",
      plans: [normal],
      planSections: [link(normal.id, morning.id, "a0"), link(normal.id, later.id, "a1")],
      sections: [morning, later],
      tasks,
      occurrences: [],
      dayRecord: null,
      settings: settings(),
      filter: "all",
    });
    const closing = planSectionNotifications(view, new Date(2026, 8, 8, 6, 0), "00:00").find((p) =>
      p.title.startsWith("Morning closes"),
    );
    expect(closing?.body).toBe("Still open: A, B, C and 2 more");
  });

  it("error registry helpers", () => {
    expect(definitionOf("RR-DB-002")).toBe(ERROR_CODES["RR-DB-002"]);
    expect(messageFor("RR-VAL-006")).toBe("{plan} has no sections yet.");
    expect(messageFor("RR-VAL-006", { other: "x" })).toBe("{plan} has no sections yet.");
  });
});
