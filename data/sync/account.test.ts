import { ensureBaseline } from "@/data/commands/baseline";
import { createTask } from "@/data/commands/tasks";
import { readKv } from "@/data/db/kv";
import { seedDemo } from "@/data/db/seed-demo";
import { testContext } from "@/tests/db";
import { applyStrategy, planFirstSync, resumeInitialPull, type AccountSyncDeps } from "./account";
import { SyncEngine } from "./engine";
import { MemoryGateway } from "./memory-gateway";

const DAY = "2026-09-08";
const ACCOUNT = { id: "user-a", email: "leo@example.com", provider: "email" as const };
const fastRetry = { sleep: () => Promise.resolve(), attempts: 2 };

/** A phone, and a server already holding another phone's saved copy (the demo routine). */
async function setup(options: { phoneHasDay: boolean; serverHasDay: boolean }) {
  const server = new MemoryGateway();
  if (options.serverHasDay) {
    const other = testContext(new Date("2026-09-07T08:00:00.000Z"), {
      idPrefix: "20000000-0000-4000-8000-",
    });
    await ensureBaseline(other.ctx);
    await seedDemo(other.ctx, "2026-09-07");
    const engine = new SyncEngine({ db: other.db, gateway: server, retry: fastRetry });
    expect((await engine.sync()).ok).toBe(true);
    await other.close();
  }
  const phone = testContext();
  await ensureBaseline(phone.ctx);
  if (options.phoneHasDay) await seedDemo(phone.ctx, DAY);
  const deps: AccountSyncDeps = {
    ctx: phone.ctx,
    gateway: server,
    engine: new SyncEngine({ db: phone.db, gateway: server, retry: fastRetry }),
    retry: fastRetry,
  };
  return { phone, server, deps };
}

const liveServer = (server: MemoryGateway, table: Parameters<MemoryGateway["rows"]>[0]) =>
  server.rows(table).filter((r) => r.deleted_at === null || r.deleted_at === undefined);

describe("first sign-in on a phone", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));

  it("plans: same owner / nothing saved yet / empty phone / both → ask", async () => {
    const empty = await setup({ phoneHasDay: true, serverHasDay: false });
    expect(await planFirstSync(empty.deps, ACCOUNT.id)).toEqual({
      ok: true,
      value: { kind: "auto", strategy: "phone" },
    });
    await empty.phone.close();

    const fresh = await setup({ phoneHasDay: false, serverHasDay: true });
    expect(await planFirstSync(fresh.deps, ACCOUNT.id)).toEqual({
      ok: true,
      value: { kind: "auto", strategy: "cloud" },
    });
    await fresh.phone.close();

    const both = await setup({ phoneHasDay: true, serverHasDay: true });
    const plan = await planFirstSync(both.deps, ACCOUNT.id);
    expect(plan.ok && plan.value.kind).toBe("ask");
    await applyStrategy(both.deps, ACCOUNT, "merge", "signed-in");
    expect(await planFirstSync(both.deps, ACCOUNT.id)).toEqual({
      ok: true,
      value: { kind: "same-owner" },
    });
    await both.phone.close();
  });

  it("Use the saved copy: the phone becomes the server's day, no duplicate plans", async () => {
    const { phone, server, deps } = await setup({ phoneHasDay: false, serverHasDay: true });
    const result = await applyStrategy(deps, ACCOUNT, "cloud", "signed-in");
    expect(result.ok).toBe(true);
    const plans = (await phone.db.day_plans.toArray()).filter((p) => p.deleted_at === null);
    expect(plans.filter((p) => p.kind === "primary")).toHaveLength(1);
    expect(plans.filter((p) => p.kind === "survival")).toHaveLength(3);
    expect(await phone.db.tasks.count()).toBe(liveServer(server, "tasks").length);
    expect(liveServer(server, "day_plans").filter((p) => p.kind === "primary")).toHaveLength(1);
    expect(await readKv(phone.db, "sync_owner")).toBe(ACCOUNT.id);
    expect(await readKv(phone.db, "pending_initial_pull")).toBeNull();
    const log = await phone.db.log_entries.where("kind").equals("edited").toArray();
    expect(log.map((l) => l.meta)).toContain("leo@example.com · saved copy restored");
    await phone.close();
  });

  it("an interrupted download is finished later, without creating clashing plans", async () => {
    const { phone, server, deps } = await setup({ phoneHasDay: false, serverHasDay: true });
    vi.spyOn(server, "pull").mockRejectedValueOnce(new Error("Failed to fetch"));
    const first = await applyStrategy(
      {
        ...deps,
        engine: new SyncEngine({
          db: phone.db,
          gateway: server,
          retry: { ...fastRetry, attempts: 1 },
        }),
      },
      ACCOUNT,
      "cloud",
      "signed-in",
    );
    expect(first.ok).toBe(false);
    expect(await readKv(phone.db, "pending_initial_pull")).toBe(true);
    // App restart: the baseline must not invent a second primary plan meanwhile.
    expect((await ensureBaseline(phone.ctx)).ok).toBe(true);
    expect(await phone.db.day_plans.count()).toBe(0);
    expect((await resumeInitialPull(deps)).ok).toBe(true);
    const primaries = (await phone.db.day_plans.toArray()).filter((p) => p.kind === "primary");
    expect(primaries).toHaveLength(1);
    await phone.close();
  });

  it("Keep this phone's: the saved copy is retired, the phone's day uploaded", async () => {
    const { phone, server, deps } = await setup({ phoneHasDay: true, serverHasDay: true });
    const before = await phone.db.tasks.count();
    const result = await applyStrategy(deps, ACCOUNT, "phone", "signed-in");
    expect(result.ok && result.value.quarantined).toBe(0);
    expect(liveServer(server, "tasks")).toHaveLength(before);
    expect(liveServer(server, "day_plans").filter((p) => p.kind === "primary")).toHaveLength(1);
    expect(await phone.db.tasks.count()).toBe(before);
    await phone.close();
  });

  it("Combine: union of both days, one primary and one plan per level, sections handed over", async () => {
    const { phone, server, deps } = await setup({ phoneHasDay: true, serverHasDay: true });
    const morning = (await phone.db.sections.toArray()).find((s) => s.name === "Morning");
    await createTask(phone.ctx, {
      draft: {
        name: "Only on this phone",
        emoji: "📱",
        minutes: 5,
        hard: false,
        sectionId: morning?.id ?? "",
        steps: [],
        mantra: "",
        notes: "",
        videoUrl: "",
        location: "",
        recurrence: null,
        neverShrink: false,
        smaller: { minutes: null, text: "" },
      },
      copyToLevels: [],
    });
    const phoneTasks = await phone.db.tasks.count();
    const serverTasks = liveServer(server, "tasks").length;
    const result = await applyStrategy(deps, ACCOUNT, "merge", "signed-in");
    expect(result.ok && result.value.quarantined).toBe(0);

    const plans = (await phone.db.day_plans.toArray()).filter((p) => p.deleted_at === null);
    expect(plans.filter((p) => p.kind === "primary")).toHaveLength(1);
    for (const level of [1, 2, 3]) {
      expect(plans.filter((p) => p.kind === "survival" && p.survival_level === level)).toHaveLength(
        1,
      );
    }
    expect(await phone.db.tasks.count()).toBe(phoneTasks + serverTasks);
    expect(liveServer(server, "tasks")).toHaveLength(phoneTasks + serverTasks);
    expect(liveServer(server, "day_plans").filter((p) => p.kind === "primary")).toHaveLength(1);
    // The phone's Morning section now hangs off the surviving primary plan.
    const primary = plans.find((p) => p.kind === "primary");
    const link = await phone.db.plan_sections.get([primary?.id ?? "", morning?.id ?? ""]);
    expect(link?.deleted_at).toBeNull();
    await phone.close();
  });
});
