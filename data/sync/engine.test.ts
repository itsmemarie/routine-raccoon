import { ensureBaseline } from "@/data/commands/baseline";
import { tickTask } from "@/data/commands/day";
import { seedDemo } from "@/data/db/seed-demo";
import { AppError } from "@/lib/errors/app-error";
import { testContext } from "@/tests/db";
import { QUARANTINE_KEY, SyncEngine, type QuarantineEntry } from "./engine";
import { MemoryGateway } from "./memory-gateway";
import { fromRemote, localKey, toRemote } from "./mapping";

const DAY = "2026-09-08";
const fastRetry = { sleep: () => Promise.resolve(), attempts: 3 };

describe("SyncEngine (integration with MemoryGateway)", () => {
  let t: ReturnType<typeof testContext>;
  let server: MemoryGateway;
  let engine: SyncEngine;

  beforeEach(async () => {
    t = testContext();
    server = new MemoryGateway();
    engine = new SyncEngine({ db: t.db, gateway: server, retry: fastRetry, now: t.ctx.now });
    await ensureBaseline(t.ctx);
    await seedDemo(t.ctx, DAY);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(async () => {
    await t.close();
  });

  it("pushes every dirty row in FK order, then clears _dirty", async () => {
    const result = await engine.sync();
    expect(result.ok).toBe(true);
    expect(server.rows("tasks").length).toBe(await t.db.tasks.count());
    expect(await t.db.tasks.where("_dirty").equals(1).count()).toBe(0);
    const pushOrder = [...new Set(server.calls.filter((c) => c.op === "push").map((c) => c.table))];
    expect(pushOrder.indexOf("sections")).toBeLessThan(pushOrder.indexOf("tasks"));
    expect(pushOrder.indexOf("tasks")).toBeLessThan(
      pushOrder.indexOf("task_occurrences") === -1
        ? Infinity
        : pushOrder.indexOf("task_occurrences"),
    );
  });

  it("never sends local-only or server-owned columns", async () => {
    await engine.sync();
    const [task] = server.rows("tasks");
    expect(task).not.toHaveProperty("_dirty");
    expect(task).not.toHaveProperty("user_id");
    const [settings] = server.rows("user_settings");
    expect(settings).not.toHaveProperty("key");
  });

  it("keeps a row dirty when it was edited while the push was in flight (compare-and-clear)", async () => {
    const task = await t.db.tasks.toCollection().first();
    const push = server.push.bind(server);
    vi.spyOn(server, "push").mockImplementation(async (table, rows) => {
      await push(table, rows);
      if (table === "tasks" && task)
        await t.db.tasks.update(task.id, {
          name: "Edited mid-push",
          updated_at: "2026-09-08T09:00:00.000Z",
        });
    });
    await engine.sync();
    expect((await t.db.tasks.get(task?.id ?? ""))?._dirty).toBe(1);
  });

  it("retries transient failures, then succeeds", async () => {
    server.failNext(new AppError("RR-NET-001"), new AppError("RR-NET-004"));
    const result = await engine.sync();
    expect(result.ok).toBe(true);
  });

  it("returns RR-SYNC-001-family errors after the retry budget and leaves rows dirty", async () => {
    server.failNext(
      new AppError("RR-NET-001"),
      new AppError("RR-NET-001"),
      new AppError("RR-NET-001"),
    );
    const result = await engine.sync();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RR-NET-001");
    expect(await t.db.day_plans.where("_dirty").equals(1).count()).toBeGreaterThan(0);
  });

  it("quarantines only the row the server refuses; the rest still sync", async () => {
    server.rejectWhen((table, row) => table === "tasks" && row.name === "Book the dentist");
    const result = await engine.sync();
    expect(result.ok && result.value.quarantined).toBe(1);
    expect(server.rows("tasks").some((r) => r.name === "Book the dentist")).toBe(false);
    expect(server.rows("tasks").length).toBe((await t.db.tasks.count()) - 1);
    const quarantine = (await t.db.kv.get(QUARANTINE_KEY))?.value as QuarantineEntry[];
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.code).toBe("RR-SYNC-003");
  });

  it("pulls another device's change and advances the cursor", async () => {
    await engine.sync();
    const [remote] = server.rows("tasks");
    server.serverWrite("tasks", {
      ...remote,
      name: "Renamed on the web",
      updated_at: "2026-09-09T00:00:00.000Z",
    });
    const result = await engine.sync();
    expect(result.ok && result.value.pulled).toBeGreaterThanOrEqual(1);
    expect((await t.db.tasks.get(String(remote?.id)))?.name).toBe("Renamed on the web");
    expect((await t.db.sync_state.get("tasks"))?.cursor).toBeGreaterThan(0);
  });

  it("never overwrites a dirty local row on pull; the server arbitrates on the next push", async () => {
    await engine.sync();
    const [remote] = server.rows("tasks");
    const id = String(remote?.id);
    await t.db.tasks.update(id, {
      name: "Local edit",
      updated_at: "2026-09-10T00:00:00.000Z",
      _dirty: 1,
    });
    server.serverWrite("tasks", {
      ...remote,
      name: "Older remote edit",
      updated_at: "2026-09-09T00:00:00.000Z",
    });
    await engine.sync();
    expect((await t.db.tasks.get(id))?.name).toBe("Local edit");
    expect(server.rows("tasks").find((r) => r.id === id)?.name).toBe("Local edit");
  });

  it("skips invalid remote rows (RR-DB-006) without blocking the pull", async () => {
    server.serverWrite("tasks", {
      id: "not-a-uuid",
      name: "",
      updated_at: "2026-09-09T00:00:00.000Z",
    });
    const result = await engine.sync();
    expect(result.ok && result.value.skippedInvalid).toBe(1);
  });

  it("treats log entries as insert-only", async () => {
    await engine.sync();
    const [entry] = server.rows("log_entries");
    server.serverWrite("log_entries", { ...entry, title: "tampered" });
    expect(server.rows("log_entries").find((r) => r.id === entry?.id)?.title).not.toBe("tampered");
  });

  it("is single-flight", async () => {
    const [a, b] = await Promise.all([engine.sync(), engine.sync()]);
    expect(a).toBe(b);
  });

  it("syncs ticks made offline once back online", async () => {
    await engine.sync();
    const task = await t.db.tasks.toCollection().first();
    await tickTask(t.ctx, { taskId: task?.id ?? "", dayKey: DAY });
    await engine.sync();
    expect(server.rows("task_occurrences")).toHaveLength(1);
    expect(server.rows("log_entries").some((r) => r.kind === "completed")).toBe(true);
  });
});

describe("mapping", () => {
  it("builds composite and singleton local keys", () => {
    expect(localKey("plan_sections", { plan_id: "p", section_id: "s" })).toEqual(["p", "s"]);
    expect(localKey("user_settings", {})).toBe("me");
    expect(localKey("day_records", { day_key: DAY })).toBe(DAY);
  });

  it("keeps day_records.plan_id local until its migration lands", () => {
    expect(toRemote("day_records", { day_key: DAY, plan_id: "x", survival_on: true })).toEqual({
      day_key: DAY,
      survival_on: true,
    });
  });

  it("validates and shapes pulled settings rows", () => {
    const local = fromRemote("user_settings", {
      user_id: "u",
      settings: { longAt: 30 },
      created_at: "x",
      updated_at: "x",
      deleted_at: null,
      server_seq: 3,
    });
    expect(local).toMatchObject({
      key: "me",
      _dirty: 0,
      settings: { longAt: 30, resetAt: "00:00" },
    });
    expect(local).not.toHaveProperty("user_id");
    expect(fromRemote("tasks", { id: "bad" })).toBeNull();
  });
});

describe("SyncEngine: compatibility with the live data", () => {
  let t: ReturnType<typeof testContext>;
  let server: MemoryGateway;
  let engine: SyncEngine;

  beforeEach(async () => {
    t = testContext();
    server = new MemoryGateway();
    engine = new SyncEngine({ db: t.db, gateway: server, retry: fastRetry, now: t.ctx.now });
    await ensureBaseline(t.ctx);
    await seedDemo(t.ctx, DAY);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(async () => {
    await t.close();
  });

  it("maps the retired app's settings keys on pull instead of resetting them", async () => {
    await engine.sync();
    server.serverWrite("user_settings", {
      settings: { extraSupportThresholdMinutes: 45, carryOverUnfinished: true, resetAt: "03:00" },
      created_at: "2026-09-25T00:00:00.000Z",
      updated_at: "2026-09-30T00:00:00.000Z",
      deleted_at: null,
    });
    await engine.sync();
    expect((await t.db.user_settings.get("me"))?.settings).toMatchObject({
      longAt: 45,
      roll: true,
      resetAt: "03:00",
    });
  });

  it("keeps a local-only column when another device's edit is pulled", async () => {
    await engine.sync();
    const [remote] = server.rows("sections");
    const id = String(remote?.id);
    await t.db.sections.update(id, { length_override_minutes: 45 });
    expect(server.rows("sections").every((r) => !("length_override_minutes" in r))).toBe(true);
    server.serverWrite("sections", {
      ...remote,
      name: "Renamed elsewhere",
      updated_at: "2026-09-09T00:00:00.000Z",
    });
    await engine.sync();
    expect(await t.db.sections.get(id)).toMatchObject({
      name: "Renamed elsewhere",
      length_override_minutes: 45,
    });
  });

  it("re-keys a local occurrence when the server holds the same task/day under another id", async () => {
    await engine.sync();
    const task = await t.db.tasks.toCollection().first();
    const taskId = task?.id ?? "";
    await tickTask(t.ctx, { taskId, dayKey: DAY });
    await t.db.task_occurrences.toCollection().modify({ _dirty: 0 });
    const legacyId = "7a0e6a1c-2b1d-4c55-9d8e-0c4c8f3b2a11";
    server.serverWrite("task_occurrences", {
      id: legacyId,
      task_id: taskId,
      day_key: DAY,
      status: "skipped",
      completed_at: null,
      checked_step_ids: [],
      minutes_credited: null,
      survival_level_at_completion: null,
      carried_from_day_key: null,
      created_at: "2026-09-08T05:00:00.000Z",
      updated_at: "2026-09-08T06:00:00.000Z",
      deleted_at: null,
    });
    const result = await engine.sync();
    expect(result.ok).toBe(true);
    const rows = await t.db.task_occurrences.where("task_id").equals(taskId).toArray();
    expect(rows.map((r) => [r.id, r.status])).toEqual([[legacyId, "skipped"]]);
  });

  it("keeps a pending local edit when re-keying, so the server can arbitrate on push", async () => {
    await engine.sync();
    const task = await t.db.tasks.toCollection().first();
    const taskId = task?.id ?? "";
    const legacyId = "7a0e6a1c-2b1d-4c55-9d8e-0c4c8f3b2a12";
    server.serverWrite("task_occurrences", {
      id: legacyId,
      task_id: taskId,
      day_key: DAY,
      status: "pending",
      completed_at: null,
      checked_step_ids: [],
      minutes_credited: null,
      survival_level_at_completion: null,
      carried_from_day_key: null,
      created_at: "2026-09-08T05:00:00.000Z",
      updated_at: "2026-09-08T05:00:00.000Z",
      deleted_at: null,
    });
    // Ticked offline before ever seeing the server row (deterministic id ≠ legacy id). The push
    // hits unique(task_id, day_key): deferred, re-keyed by the pull, pushed again, tick kept.
    expect(await t.db.task_occurrences.where("task_id").equals(taskId).count()).toBe(0);
    await tickTask(t.ctx, { taskId, dayKey: DAY });
    const result = await engine.sync();
    expect(result.ok && result.value).toMatchObject({ quarantined: 0, deferred: 1 });
    const rows = await t.db.task_occurrences.where("task_id").equals(taskId).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: legacyId, status: "done", _dirty: 0 });
    const remote = server.rows("task_occurrences").filter((r) => r.task_id === taskId);
    expect(remote.map((r) => [r.id, r.status])).toEqual([[legacyId, "done"]]);
  });

  it("pushes a primary-plan swap without tripping the one-primary rule", async () => {
    await engine.sync();
    const plans = await t.db.day_plans.toArray();
    const normal = plans.find((p) => p.kind === "primary");
    const travelling = plans.find((p) => p.name === "Travelling");
    // Promotion written FIRST (the order a naive push would send), then the demotion.
    await t.db.day_plans.update(travelling?.id ?? "", {
      kind: "primary",
      updated_at: "2026-09-08T10:00:00.000Z",
      _dirty: 1,
    });
    await t.db.day_plans.update(normal?.id ?? "", {
      kind: "custom",
      updated_at: "2026-09-08T10:00:00.000Z",
      _dirty: 1,
    });
    const result = await engine.sync();
    expect(result.ok && result.value.quarantined).toBe(0);
    expect(
      server
        .rows("day_plans")
        .filter((r) => r.kind === "primary")
        .map((r) => r.id),
    ).toEqual([travelling?.id]);
  });
});
