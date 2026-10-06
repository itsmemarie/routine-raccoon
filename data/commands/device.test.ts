import Dexie from "dexie";
import { bootstrapDatabase } from "@/data/bootstrap";
import { readKv, writeKv } from "@/data/db/kv";
import { RoutineDb } from "@/data/db/schema";
import { testContext } from "@/tests/db";
import { forgetAccount, retryQuarantined } from "./account";
import { writeKvCommand } from "./device";
import { prepareExport } from "./export";

describe("device-only commands, export and account housekeeping", () => {
  let t: ReturnType<typeof testContext>;
  beforeEach(async () => {
    t = testContext();
    expect((await bootstrapDatabase({ seedDemo: true, ctx: t.ctx })).ok).toBe(true);
  });
  afterEach(async () => {
    await t.close();
  });

  it("writeKvCommand stores a UI flag without logging or queueing a sync", async () => {
    const logBefore = await t.db.log_entries.count();
    expect((await writeKvCommand(t.ctx, { key: "welcome_dismissed", value: true })).ok).toBe(true);
    expect(await readKv(t.db, "welcome_dismissed")).toBe(true);
    expect(await t.db.log_entries.count()).toBe(logBefore);
  });

  it("prepareExport renders each kind with a dated file name", async () => {
    const json = await prepareExport(t.ctx, { kind: "json", appVersion: "1.2.3" });
    expect(json.ok).toBe(true);
    if (!json.ok) return;
    expect(json.value.fileName).toBe("routine-raccoon-2026-09-08.json");
    expect(json.value.mimeType).toBe("application/json");
    const parsed = JSON.parse(json.value.content) as Record<string, unknown>;
    expect(parsed).toMatchObject({ app: { name: "Routine Raccoon", version: "1.2.3" } });

    const tasks = await prepareExport(t.ctx, { kind: "tasks", appVersion: "1.2.3" });
    expect(tasks.ok && tasks.value.fileName).toBe("routine-raccoon-tasks-2026-09-08.csv");
    expect(tasks.ok && tasks.value.mimeType).toBe("text/csv");
    expect(tasks.ok && tasks.value.content).toContain("Drink a pint");

    const log = await prepareExport(t.ctx, { kind: "log", appVersion: "1.2.3" });
    expect(log.ok && log.value.fileName).toBe("routine-raccoon-log-2026-09-08.csv");
  });

  it("prepareExport: RR-EXP-001 when rendering fails, RR-DB-001 when storage is closed", async () => {
    vi.spyOn(t.db.tasks, "toArray").mockRejectedValueOnce(new Error("boom"));
    const failed = await prepareExport(t.ctx, { kind: "json", appVersion: "1" });
    expect(failed.ok ? null : failed.error.code).toBe("RR-EXP-001");
    t.db.close();
    const closed = await prepareExport(t.ctx, { kind: "json", appVersion: "1" });
    expect(closed.ok ? null : closed.error.code).toBe("RR-DB-001");
  });

  it("forgetAccount drops the link to the account and the sync cursors", async () => {
    await writeKv(t.db, "sync_owner", "user-a");
    await writeKv(t.db, "last_synced_at", "2026-09-08T07:00:00.000Z");
    await t.db.sync_state.put({ table: "tasks", cursor: "2026-09-08T07:00:00.000Z" } as never);
    expect((await forgetAccount(t.ctx)).ok).toBe(true);
    expect(await readKv(t.db, "sync_owner")).toBeNull();
    expect(await readKv(t.db, "last_synced_at")).toBeNull();
    expect(await t.db.sync_state.count()).toBe(0);
  });

  it("retryQuarantined re-queues refused rows, skips unknown tables, and clears the list", async () => {
    await t.db.tasks.toCollection().modify({ _dirty: 0 });
    const task = (await t.db.tasks.toArray())[0];
    const link = (await t.db.plan_sections.toArray())[0];
    if (!task || !link) throw new Error("seed");
    await t.db.plan_sections.update([link.plan_id, link.section_id], { _dirty: 0 });
    await writeKv(t.db, "sync_quarantine", [
      { table: "tasks", key: task.id, code: "RR-SYNC-003", at: "2026-09-08T07:00:00.000Z" },
      {
        table: "plan_sections",
        key: [link.plan_id, link.section_id],
        code: "RR-SYNC-003",
        at: "2026-09-08T07:00:00.000Z",
      },
      { table: "kv", key: "sync_owner", code: "RR-SYNC-003", at: "2026-09-08T07:00:00.000Z" },
      { table: "tasks", key: "gone", code: "RR-SYNC-003", at: "2026-09-08T07:00:00.000Z" },
    ]);
    const result = await retryQuarantined(t.ctx);
    expect(result.ok && result.value.count).toBe(2);
    expect((await t.db.tasks.get(task.id))?._dirty).toBe(1);
    expect((await t.db.plan_sections.get([link.plan_id, link.section_id]))?._dirty).toBe(1);
    expect(await readKv(t.db, "sync_quarantine")).toBeNull();

    // Nothing quarantined: a no-op that still succeeds.
    const empty = await retryQuarantined(t.ctx);
    expect(empty.ok && empty.value.count).toBe(0);
  });
});

describe("database upgrade v1 → v2", () => {
  it("fills the local-only columns on rows written by v1, leaving _dirty alone", async () => {
    const name = `upgrade-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({
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
    await v1.table("sections").bulkPut([
      { id: "s1", name: "Morning", _dirty: 0 },
      { id: "s2", name: "Evening", length_override_minutes: 30, _dirty: 1 },
    ]);
    await v1.table("day_records").bulkPut([
      { day_key: "2026-09-07", _dirty: 0 },
      { day_key: "2026-09-08", plan_id: "p1", _dirty: 1 },
    ]);
    v1.close();

    const db = new RoutineDb(name);
    try {
      const sections = await db.sections.toArray();
      expect(sections.map((s) => [s.id, s.length_override_minutes, s._dirty])).toEqual([
        ["s1", null, 0],
        ["s2", 30, 1],
      ]);
      const days = await db.day_records.toArray();
      expect(days.map((d) => [d.day_key, d.plan_id, d._dirty])).toEqual([
        ["2026-09-07", null, 0],
        ["2026-09-08", "p1", 1],
      ]);
    } finally {
      db.close();
      await db.delete();
    }
  });
});
