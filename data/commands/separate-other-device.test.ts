import { bootstrapDatabase } from "@/data/bootstrap";
import { SyncEngine } from "@/data/sync/engine";
import { MemoryGateway } from "@/data/sync/memory-gateway";
import { sectionRows } from "@/domain/organise";
import { pickedPlanFromLog } from "@/domain/plan-picks";
import { buildProgress } from "@/domain/progress";
import { testContext } from "@/tests/db";
import { plan } from "@/tests/factories";
import { pickPlan, tickTask } from "./day";
import { linkSection } from "./rows";
import { separateSectionInPlan } from "./sections";
import { currentDayKey, readOrganisation, readSettings } from "./shared";

const ONE_DAY = 24 * 60 * 60 * 1000;
const retry = { sleep: () => Promise.resolve(), attempts: 3 };

describe("pickedPlanFromLog", () => {
  const travel = plan({ name: "Travel", kind: "custom" });
  const normal = plan({ name: "Normal", kind: "primary" });
  const entry = (
    title: string,
    at: string,
    day_key = "2026-09-08",
    kind = "survival" as const,
  ) => ({
    day_key,
    kind,
    title,
    at,
  });

  it("reads the day's last pick", () => {
    const log = [
      entry("Switched to Normal", "2026-09-08T08:00:00Z"),
      entry("Switched to Travel", "2026-09-08T09:00:00Z"),
    ];
    expect(pickedPlanFromLog(log, [normal, travel], "2026-09-08", normal)?.id).toBe(travel.id);
  });

  it("leaves a day alone when the last pick was the primary plan", () => {
    const log = [
      entry("Switched to Travel", "2026-09-08T08:00:00Z"),
      entry("Switched to Normal", "2026-09-08T09:00:00Z"),
    ];
    expect(pickedPlanFromLog(log, [normal, travel], "2026-09-08", normal)).toBeNull();
  });

  it("leaves a day alone when the name is gone or ambiguous", () => {
    const log = [entry("Switched to Travel", "2026-09-08T08:00:00Z")];
    expect(pickedPlanFromLog(log, [normal], "2026-09-08", normal)).toBeNull();
    const twin = plan({ name: "Travel", kind: "custom" });
    expect(pickedPlanFromLog(log, [normal, travel, twin], "2026-09-08", normal)).toBeNull();
  });

  it("ignores other days and other kinds of entry", () => {
    const log = [
      entry("Switched to Travel", "2026-09-07T08:00:00Z", "2026-09-07"),
      entry("Switched to Travel", "2026-09-08T08:00:00Z", "2026-09-08", "edited" as never),
    ];
    expect(pickedPlanFromLog(log, [normal, travel], "2026-09-08", normal)).toBeNull();
  });
});

describe("Separate on a device that didn't make the plan picks", () => {
  it("moves the history of picked days, so both devices read the same Progress", async () => {
    const a = testContext();
    expect((await bootstrapDatabase({ seedDemo: true, ctx: a.ctx })).ok).toBe(true);
    const plans = await a.db.day_plans.toArray();
    const normal = plans.find((p) => p.name === "Normal");
    const travelling = plans.find((p) => p.name === "Travelling");
    if (!normal || !travelling) throw new Error("demo plans missing");
    const morning = sectionRows(await readOrganisation(a.ctx), normal.id).find(
      (r) => r.section.name === "Morning",
    )?.section;
    if (!morning) throw new Error("no Morning");
    await linkSection(a.ctx, travelling.id, morning.id);

    // Day 1 runs Normal, day 2 runs Travelling; both fully ticked on device A.
    const tickAll = async (dayKey: string) => {
      for (const task of await a.db.tasks.where("section_id").equals(morning.id).toArray()) {
        if (task.deleted_at === null) await tickTask(a.ctx, { taskId: task.id, dayKey });
      }
    };
    await tickAll(await currentDayKey(a.ctx));
    a.advance(ONE_DAY);
    const travelDay = await currentDayKey(a.ctx);
    await pickPlan(a.ctx, { dayKey: travelDay, planId: travelling.id });
    await tickAll(travelDay);
    a.advance(ONE_DAY);

    const progressOf = async (ctx: typeof a.ctx) => {
      const today = await currentDayKey(ctx);
      const view = buildProgress({
        month: today,
        today,
        definitions: await readOrganisation(ctx),
        occurrences: await ctx.db.task_occurrences.toArray(),
        dayRecords: await ctx.db.day_records.toArray(),
        settings: await readSettings(ctx),
      });
      return view.cells;
    };
    const before = await progressOf(a.ctx);

    const server = new MemoryGateway();
    const engineA = new SyncEngine({ db: a.db, gateway: server, retry, now: a.ctx.now });
    expect((await engineA.sync()).ok).toBe(true);

    // Device B pulls everything except the device-only plan pick.
    const b = testContext(a.ctx.now(), { idPrefix: "20000000-0000-4000-8000-" });
    const engineB = new SyncEngine({ db: b.db, gateway: server, retry, now: b.ctx.now });
    expect((await engineB.sync()).ok).toBe(true);
    expect((await b.db.day_records.get(travelDay))?.plan_id ?? null).toBeNull();

    const result = await separateSectionInPlan(b.ctx, {
      sectionId: morning.id,
      planId: travelling.id,
    });
    expect(result.ok).toBe(true);
    expect((await b.db.day_records.get(travelDay))?.plan_id).toBe(travelling.id);

    // Back on A: nothing about any day changed.
    expect((await engineB.sync()).ok).toBe(true);
    expect((await engineA.sync()).ok).toBe(true);
    expect(await progressOf(a.ctx)).toEqual(before);
    expect(await progressOf(b.ctx)).toEqual(before);

    await a.close();
    await b.close();
  });
});
