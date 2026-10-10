import { bootstrapDatabase } from "@/data/bootstrap";
import { onLocalWrite } from "@/data/events";
import { occurrenceId } from "@/domain/ids";
import { testContext } from "@/tests/db";
import { ensureBaseline, SURVIVAL_PLAN_SEED } from "./baseline";
import {
  pickPlan,
  pickSurvivalLevel,
  skipSectionToday,
  skipTaskToday,
  tickTask,
  toggleStep,
  unskipSectionToday,
  unskipTaskToday,
  untickTask,
} from "./day";

const DAY = "2026-09-08";

describe("commands (integration, fake-indexeddb)", () => {
  let t: ReturnType<typeof testContext>;
  beforeEach(() => {
    t = testContext();
  });
  afterEach(async () => {
    await t.close();
  });

  async function seeded() {
    const result = await bootstrapDatabase({ seedDemo: true, ctx: t.ctx });
    expect(result.ok).toBe(true);
    const tasks = await t.db.tasks.toArray();
    const byName = (name: string) => {
      const found = tasks.find((task) => task.name === name);
      if (!found) throw new Error(`no task ${name}`);
      return found;
    };
    return { byName };
  }

  describe("ensureBaseline", () => {
    it("creates one primary plan, the three survival plans and settings, idempotently", async () => {
      const first = await ensureBaseline(t.ctx);
      expect(first).toEqual({ ok: true, value: { created: true } });
      const second = await ensureBaseline(t.ctx);
      expect(second).toEqual({ ok: true, value: { created: false } });

      const plans = await t.db.day_plans.toArray();
      expect(plans.filter((p) => p.kind === "primary")).toHaveLength(1);
      expect(
        plans.filter((p) => p.kind === "survival").map((p) => [p.survival_level, p.name]),
      ).toEqual(SURVIVAL_PLAN_SEED.map((s) => [s.level, s.name]));
      expect(plans.every((p) => p._dirty === 1)).toBe(true);
      expect((await t.db.user_settings.get("me"))?.settings.resetAt).toBe("00:00");
    });

    it("seeds the demo routine once", async () => {
      await seeded();
      const count = await t.db.tasks.count();
      expect(count).toBeGreaterThan(10);
      await bootstrapDatabase({ seedDemo: true, ctx: t.ctx });
      expect(await t.db.tasks.count()).toBe(count);
    });
  });

  describe("tickTask / untickTask", () => {
    it("writes a deterministic occurrence and a completed log entry in one transaction", async () => {
      const { byName } = await seeded();
      const dentist = byName("Book the dentist");
      const writes: string[] = [];
      const off = onLocalWrite((name) => writes.push(name));

      const result = await tickTask(t.ctx, { taskId: dentist.id, dayKey: DAY });
      off();

      expect(result).toEqual({ ok: true, value: { occurrenceId: occurrenceId(dentist.id, DAY) } });
      const occurrence = await t.db.task_occurrences.get(occurrenceId(dentist.id, DAY));
      expect(occurrence).toMatchObject({
        status: "done",
        minutes_credited: 15,
        _dirty: 1,
        day_key: DAY,
      });
      const log = await t.db.log_entries.where("kind").equals("completed").toArray();
      expect(log.map((l) => [l.title, l.meta])).toEqual([
        ["Completed Book the dentist", "Smash it · 15 min estimated · hard task"],
      ]);
      expect(writes).toEqual(["tickTask"]);
    });

    it("credits the smaller version and records the level in Survival Mode", async () => {
      const { byName } = await seeded();
      await pickSurvivalLevel(t.ctx, { dayKey: DAY, level: 2 });
      const eat = (await t.db.tasks.toArray()).find(
        (task) => task.name === "Eat something" && task.id !== byName("Eat something").id,
      );
      const target = eat ?? byName("Eat something");
      await tickTask(t.ctx, { taskId: target.id, dayKey: DAY });
      expect(await t.db.task_occurrences.get(occurrenceId(target.id, DAY))).toMatchObject({
        minutes_credited: 5,
        survival_level_at_completion: 2,
      });
    });

    it("undo returns the task to pending and logs uncompleted", async () => {
      const { byName } = await seeded();
      const pint = byName("Drink a pint");
      await tickTask(t.ctx, { taskId: pint.id, dayKey: DAY });
      t.advance(2_000);
      const undo = await untickTask(t.ctx, { taskId: pint.id, dayKey: DAY });
      expect(undo.ok).toBe(true);
      expect(await t.db.task_occurrences.get(occurrenceId(pint.id, DAY))).toMatchObject({
        status: "pending",
        completed_at: null,
        minutes_credited: null,
        updated_at: "2026-09-08T07:41:02.000Z",
      });
      expect((await t.db.log_entries.where("kind").equals("uncompleted").first())?.title).toBe(
        "Un-ticked Drink a pint",
      );
    });

    it("skip today hides the task and logs skipped", async () => {
      const { byName } = await seeded();
      const back = byName("Straighten your back");
      await skipTaskToday(t.ctx, { taskId: back.id, dayKey: DAY });
      expect((await t.db.task_occurrences.get(occurrenceId(back.id, DAY)))?.status).toBe("skipped");
      expect(await t.db.log_entries.where("kind").equals("skipped").count()).toBe(1);
    });

    it("bringing a skipped task back makes it pending, keeps its steps and logs it", async () => {
      const { byName } = await seeded();
      const back = byName("Straighten your back");
      await toggleStep(t.ctx, { taskId: back.id, dayKey: DAY, stepId: "s1", checked: true });
      await skipTaskToday(t.ctx, { taskId: back.id, dayKey: DAY });
      t.advance(1_000);
      expect((await unskipTaskToday(t.ctx, { taskId: back.id, dayKey: DAY })).ok).toBe(true);
      expect(await t.db.task_occurrences.get(occurrenceId(back.id, DAY))).toMatchObject({
        status: "pending",
        checked_step_ids: ["s1"],
        _dirty: 1,
      });
      const titles = async () =>
        (await t.db.log_entries.where("kind").equals("edited").toArray()).map((l) => l.title);
      expect(await titles()).toEqual(["Brought back Straighten your back"]);
      // Not skipped (any more): nothing to do, nothing logged.
      expect((await unskipTaskToday(t.ctx, { taskId: back.id, dayKey: DAY })).ok).toBe(true);
      expect(await titles()).toHaveLength(1);
    });

    it("skipping a section skips its open tasks, leaves ticked ones, and logs once", async () => {
      const { byName } = await seeded();
      const pint = byName("Drink a pint");
      const morning = pint.section_id;
      await tickTask(t.ctx, { taskId: pint.id, dayKey: DAY });

      const result = await skipSectionToday(t.ctx, { sectionId: morning, dayKey: DAY });
      expect(result.ok).toBe(true);
      const skipped = result.ok ? result.value.taskIds : [];
      expect(skipped.toSorted()).toEqual(
        [byName("Eat something").id, byName("Straighten your back").id].toSorted(),
      );
      expect((await t.db.task_occurrences.get(occurrenceId(pint.id, DAY)))?.status).toBe("done");
      const log = await t.db.log_entries.where("kind").equals("skipped").toArray();
      expect(log.map((l) => [l.title, l.meta, l.section_id])).toEqual([
        ["Skipped Morning", "2 tasks · today only", morning],
      ]);

      // Nothing open is left: a second skip changes nothing and logs nothing.
      const again = await skipSectionToday(t.ctx, { sectionId: morning, dayKey: DAY });
      expect(again).toEqual({ ok: true, value: { taskIds: [] } });
      expect(await t.db.log_entries.where("kind").equals("skipped").count()).toBe(1);
    });

    it("Undo of a section skip brings back exactly those tasks; Bring back brings all", async () => {
      const { byName } = await seeded();
      const eat = byName("Eat something");
      const morning = eat.section_id;
      await skipTaskToday(t.ctx, { taskId: eat.id, dayKey: DAY });
      const result = await skipSectionToday(t.ctx, { sectionId: morning, dayKey: DAY });
      const taskIds = result.ok ? result.value.taskIds : [];
      expect(taskIds).toHaveLength(2);

      const undo = await unskipSectionToday(t.ctx, { sectionId: morning, dayKey: DAY, taskIds });
      expect(undo).toEqual({ ok: true, value: { count: 2 } });
      // Skipped on its own before the section was: still skipped.
      expect((await t.db.task_occurrences.get(occurrenceId(eat.id, DAY)))?.status).toBe("skipped");

      const all = await unskipSectionToday(t.ctx, { sectionId: morning, dayKey: DAY });
      expect(all).toEqual({ ok: true, value: { count: 1 } });
      expect((await t.db.task_occurrences.get(occurrenceId(eat.id, DAY)))?.status).toBe("pending");
      const log = await t.db.log_entries.where("kind").equals("edited").toArray();
      expect(log.map((l) => [l.title, l.meta])).toEqual([
        ["Brought back Morning", "2 tasks · today"],
        ["Brought back Morning", "1 task · today"],
      ]);

      // Nothing skipped: no entry.
      await unskipSectionToday(t.ctx, { sectionId: morning, dayKey: DAY });
      expect(await t.db.log_entries.where("kind").equals("edited").count()).toBe(2);
    });

    it("section skips fail with RR-DB-005 for a missing section", async () => {
      await seeded();
      const missing = "00000000-0000-4000-8000-000000000000";
      const skip = await skipSectionToday(t.ctx, { sectionId: missing, dayKey: DAY });
      const back = await unskipSectionToday(t.ctx, { sectionId: missing, dayKey: DAY });
      for (const result of [skip, back]) {
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe("RR-DB-005");
      }
    });

    it("fails with RR-DB-005 for a missing task, writing nothing", async () => {
      await seeded();
      const before = await t.db.log_entries.count();
      const result = await tickTask(t.ctx, {
        taskId: "00000000-0000-4000-8000-000000000000",
        dayKey: DAY,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("RR-DB-005");
      expect(await t.db.log_entries.count()).toBe(before);
    });

    it("maps storage failures to RR-DB-002", async () => {
      const { byName } = await seeded();
      t.db.close();
      const result = await tickTask(t.ctx, { taskId: byName("Drink a pint").id, dayKey: DAY });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(["RR-DB-001", "RR-DB-002"]).toContain(result.error.code);
    });
  });

  describe("plan picks", () => {
    it("picking a survival level turns Survival on and logs it", async () => {
      await seeded();
      const result = await pickSurvivalLevel(t.ctx, { dayKey: DAY, level: 3 });
      expect(result.ok).toBe(true);
      expect(await t.db.day_records.get(DAY)).toMatchObject({
        survival_on: true,
        survival_level: 3,
        _dirty: 1,
      });
      expect((await t.db.log_entries.where("kind").equals("survival").first())?.title).toBe(
        "Survival Mode: Zero energy",
      );
    });

    it("picking a regular plan turns Survival off; primary is stored as null", async () => {
      await seeded();
      const plans = await t.db.day_plans.toArray();
      const travelling = plans.find((p) => p.name === "Travelling");
      const normal = plans.find((p) => p.kind === "primary");
      await pickSurvivalLevel(t.ctx, { dayKey: DAY, level: 2 });
      await pickPlan(t.ctx, { dayKey: DAY, planId: travelling?.id ?? "" });
      expect(await t.db.day_records.get(DAY)).toMatchObject({
        survival_on: false,
        plan_id: travelling?.id,
      });
      await pickPlan(t.ctx, { dayKey: DAY, planId: normal?.id ?? "" });
      expect((await t.db.day_records.get(DAY))?.plan_id).toBeNull();
    });

    it("rejects survival plans and unknown ids in pickPlan, and missing levels", async () => {
      await ensureBaseline(t.ctx);
      const survival = (await t.db.day_plans.toArray()).find((p) => p.kind === "survival");
      const viaPickPlan = await pickPlan(t.ctx, { dayKey: DAY, planId: survival?.id ?? "" });
      expect(viaPickPlan.ok ? null : viaPickPlan.error.code).toBe("RR-DB-005");

      await t.db.day_plans
        .where("kind")
        .equals("survival")
        .modify({ deleted_at: "2026-09-01T00:00:00Z" });
      const level = await pickSurvivalLevel(t.ctx, { dayKey: DAY, level: 1 });
      expect(level.ok ? null : level.error.code).toBe("RR-DB-005");
    });
  });
});
