import Dexie from "dexie";
import { bootstrapDatabase } from "@/data/bootstrap";
import { RoutineDb } from "@/data/db/schema";
import { SyncEngine } from "@/data/sync/engine";
import { fromRemote } from "@/data/sync/mapping";
import { MemoryGateway } from "@/data/sync/memory-gateway";
import { plansOfTask, sectionRows } from "@/domain/organise";
import { testContext } from "@/tests/db";
import { combinePlans } from "./account";
import { linkSection } from "./rows";
import { duplicateSection } from "./sections";
import { readOrganisation } from "./shared";
import {
  createTask,
  deleteTask,
  duplicateTask,
  moveTask,
  removeTaskFromPlan,
  updateTask,
} from "./tasks";
import type { TaskDraft } from "./validate";

/**
 * "Only from {plan}" or "From all plans" (handoff "Deleting a task that's in several plans").
 * The demo routine has both kinds of sharing once Morning is linked into Travelling: one row seen
 * from two plans, and same-named copies in the survival plans.
 */
describe("deleting a task that's in several plans", () => {
  let t: ReturnType<typeof testContext>;
  beforeEach(async () => {
    t = testContext();
    expect((await bootstrapDatabase({ seedDemo: true, ctx: t.ctx })).ok).toBe(true);
  });
  afterEach(async () => {
    await t.close();
  });

  async function planNamed(name: string) {
    const found = (await t.db.day_plans.toArray()).find((p) => p.name === name);
    if (!found) throw new Error(`no plan ${name}`);
    return found;
  }

  async function sectionNamed(name: string, planName: string) {
    const plan = await planNamed(planName);
    const row = sectionRows(await readOrganisation(t.ctx), plan.id).find(
      (r) => r.section.name === name,
    );
    if (!row) throw new Error(`no section ${name} in ${planName}`);
    return row.section;
  }

  /** The row of `name` in `planName`. */
  async function taskIn(name: string, planName: string) {
    const plan = await planNamed(planName);
    const org = await readOrganisation(t.ctx);
    for (const row of sectionRows(org, plan.id)) {
      const found = org.tasks.find(
        (x) => x.section_id === row.section.id && x.name === name && x.deleted_at === null,
      );
      if (found)
        return t.db.tasks.get(found.id).then((task) => task ?? Promise.reject(new Error()));
    }
    throw new Error(`no task ${name} in ${planName}`);
  }

  async function shareMorningWithTravelling() {
    const morning = await sectionNamed("Morning", "Normal");
    const normal = await planNamed("Normal");
    const travelling = await planNamed("Travelling");
    await linkSection(t.ctx, travelling.id, morning.id);
    return { morning, normal, travelling };
  }

  const lastLog = async () => {
    const entries = await t.db.log_entries.orderBy("at").toArray();
    return entries[entries.length - 1];
  };

  function draftOf(sectionId: string, overrides: Partial<TaskDraft> = {}): TaskDraft {
    return {
      name: "Pack a bag",
      emoji: "",
      minutes: 5,
      hard: false,
      sectionId,
      steps: [],
      mantra: "",
      notes: "",
      videoUrl: "",
      location: "",
      recurrence: null,
      neverShrink: false,
      smaller: { minutes: null, text: "" },
      ...overrides,
    };
  }

  async function addTask(sectionId: string, name: string) {
    const made = await createTask(t.ctx, { draft: draftOf(sectionId, { name }) });
    if (!made.ok) throw made.error;
    return made.value.taskId;
  }

  describe("Only from {plan}", () => {
    it("takes a shared-section task out of one plan and leaves it in the other", async () => {
      const { morning, normal, travelling } = await shareMorningWithTravelling();
      const pint = await taskIn("Drink a pint", "Normal");
      t.advance(60_000);

      const result = await removeTaskFromPlan(t.ctx, { taskId: pint.id, planId: normal.id });

      expect(result.ok).toBe(true);
      const after = await t.db.tasks.get(pint.id);
      expect(after).toMatchObject({
        deleted_at: null,
        section_id: morning.id,
        excluded_plan_ids: [normal.id],
        _dirty: 1,
      });
      // Sync's last-write-wins drops an update that doesn't move updated_at.
      expect(after?.updated_at).not.toBe(pint.updated_at);
      const org = await readOrganisation(t.ctx);
      const countIn = (planId: string) =>
        sectionRows(org, planId).find((r) => r.section.id === morning.id)?.taskCount;
      expect(countIn(travelling.id)).toBe((countIn(normal.id) ?? 0) + 1);
      expect(await lastLog()).toMatchObject({
        title: "Removed Drink a pint",
        meta: "From Normal",
        task_id: pint.id,
      });
    });

    it("keeps the section shared: nothing is copied or unlinked", async () => {
      const { morning, normal, travelling } = await shareMorningWithTravelling();
      const pint = await taskIn("Drink a pint", "Normal");
      const tasksBefore = await t.db.tasks.count();
      const sectionsBefore = await t.db.sections.count();

      await removeTaskFromPlan(t.ctx, { taskId: pint.id, planId: normal.id });

      expect(await t.db.tasks.count()).toBe(tasksBefore);
      expect(await t.db.sections.count()).toBe(sectionsBefore);
      for (const planId of [normal.id, travelling.id]) {
        const link = await t.db.plan_sections.get([planId, morning.id]);
        expect(link?.deleted_at).toBeNull();
      }
    });

    it("leaves today's tick alone", async () => {
      const { normal } = await shareMorningWithTravelling();
      const pint = await taskIn("Drink a pint", "Normal");
      await t.db.task_occurrences.add({
        id: "20000000-0000-4000-8000-000000000001",
        task_id: pint.id,
        day_key: "2026-09-08",
        status: "done",
        completed_at: "2026-09-08T07:00:00.000Z",
        checked_step_ids: [],
        minutes_credited: 2,
        survival_level_at_completion: null,
        carried_from_day_key: null,
        created_at: "2026-09-08T07:00:00.000Z",
        updated_at: "2026-09-08T07:00:00.000Z",
        deleted_at: null,
        _dirty: 0,
      });
      await removeTaskFromPlan(t.ctx, { taskId: pint.id, planId: normal.id });
      expect((await t.db.task_occurrences.toArray())[0]?.deleted_at).toBeNull();
    });

    it("deletes the row when this was the last plan showing it, and keeps its copies", async () => {
      const normal = await planNamed("Normal");
      const back = await taskIn("Straighten your back", "Normal");
      const copy = await taskIn("Straighten your back", "Bad day");

      await removeTaskFromPlan(t.ctx, { taskId: back.id, planId: normal.id });

      expect((await t.db.tasks.get(back.id))?.deleted_at).not.toBeNull();
      expect((await t.db.tasks.get(copy.id))?.deleted_at).toBeNull();
      expect(await lastLog()).toMatchObject({ title: "Removed Straighten your back" });
    });

    it("deletes the row once it has been removed from each plan in turn", async () => {
      const { normal, travelling } = await shareMorningWithTravelling();
      const pint = await taskIn("Drink a pint", "Normal");
      await removeTaskFromPlan(t.ctx, { taskId: pint.id, planId: normal.id });
      await removeTaskFromPlan(t.ctx, { taskId: pint.id, planId: travelling.id });
      expect((await t.db.tasks.get(pint.id))?.deleted_at).not.toBeNull();
    });

    it("refuses a plan the task isn't in (RR-DB-005) and changes nothing", async () => {
      const { normal } = await shareMorningWithTravelling();
      const zero = await planNamed("Zero energy");
      const pint = await taskIn("Drink a pint", "Normal");

      const notThere = await removeTaskFromPlan(t.ctx, { taskId: pint.id, planId: zero.id });
      expect(!notThere.ok && notThere.error.code).toBe("RR-DB-005");

      await removeTaskFromPlan(t.ctx, { taskId: pint.id, planId: normal.id });
      const twice = await removeTaskFromPlan(t.ctx, { taskId: pint.id, planId: normal.id });
      expect(!twice.ok && twice.error.code).toBe("RR-DB-005");
      expect((await t.db.tasks.get(pint.id))?.excluded_plan_ids).toEqual([normal.id]);
    });

    it("refuses a task or plan that doesn't exist", async () => {
      const normal = await planNamed("Normal");
      const pint = await taskIn("Drink a pint", "Normal");
      const missing = "20000000-0000-4000-8000-000000000009";
      for (const input of [
        { taskId: missing, planId: normal.id },
        { taskId: pint.id, planId: missing },
      ]) {
        const result = await removeTaskFromPlan(t.ctx, input);
        expect(!result.ok && result.error.code).toBe("RR-DB-005");
      }
    });
  });

  describe("From all plans", () => {
    it("deletes the row and its copies in every other plan, with one log entry", async () => {
      await shareMorningWithTravelling();
      const pint = await taskIn("Drink a pint", "Normal");
      const copies = await Promise.all(
        ["Bare minimum", "Bad day", "Zero energy"].map((plan) => taskIn("Drink a pint", plan)),
      );
      const before = await t.db.log_entries.count();

      expect((await deleteTask(t.ctx, { taskId: pint.id })).ok).toBe(true);

      for (const row of [pint, ...copies]) {
        expect(await t.db.tasks.get(row.id)).toMatchObject({ _dirty: 1 });
        expect((await t.db.tasks.get(row.id))?.deleted_at).not.toBeNull();
      }
      expect(await t.db.log_entries.count()).toBe(before + 1);
      expect(await lastLog()).toMatchObject({
        title: "Deleted Drink a pint",
        meta: "Morning · from 5 plans · history kept",
      });
    });

    it("works the same started from a copy", async () => {
      const pint = await taskIn("Drink a pint", "Normal");
      const copy = await taskIn("Drink a pint", "Bad day");
      await deleteTask(t.ctx, { taskId: copy.id });
      expect((await t.db.tasks.get(pint.id))?.deleted_at).not.toBeNull();
    });

    it("leaves a similar name alone", async () => {
      const eat = await taskIn("Eat something", "Normal");
      const other = await taskIn("Eat anything", "Zero energy");
      await deleteTask(t.ctx, { taskId: eat.id });
      expect((await t.db.tasks.get(other.id))?.deleted_at).toBeNull();
    });

    it("never takes the same-named task kept in another section of the same plan", async () => {
      const morning = await sectionNamed("Morning", "Normal");
      const evening = await sectionNamed("Evening", "Normal");
      const amId = await addTask(morning.id, "Tidy desk");
      const pmId = await addTask(evening.id, "Tidy desk");

      await deleteTask(t.ctx, { taskId: amId });

      expect((await t.db.tasks.get(amId))?.deleted_at).not.toBeNull();
      expect((await t.db.tasks.get(pmId))?.deleted_at).toBeNull();
    });

    it("keeps the plain log wording for a task in one plan", async () => {
      const morning = await sectionNamed("Morning", "Normal");
      await deleteTask(t.ctx, { taskId: await addTask(morning.id, "Pack a bag") });
      expect(await lastLog()).toMatchObject({ meta: "Morning · history kept" });
    });
  });

  describe("after removing a task from a plan", () => {
    async function removedFromNormal() {
      const shared = await shareMorningWithTravelling();
      const pint = await taskIn("Drink a pint", "Travelling");
      await removeTaskFromPlan(t.ctx, { taskId: pint.id, planId: shared.normal.id });
      return { ...shared, pint };
    }

    it("a duplicate stays out of that plan too", async () => {
      const { normal, pint } = await removedFromNormal();
      const made = await duplicateTask(t.ctx, { taskId: pint.id });
      const copy = await t.db.tasks.get(made.ok ? made.value.taskId : "");
      expect(copy?.excluded_plan_ids).toEqual([normal.id]);
    });

    it("a task's copy doesn't share the removal array with the original", async () => {
      const { pint } = await removedFromNormal();
      const made = await duplicateTask(t.ctx, { taskId: pint.id });
      await removeTaskFromPlan(t.ctx, {
        taskId: made.ok ? made.value.taskId : "",
        planId: (await planNamed("Travelling")).id,
      });
      expect((await t.db.tasks.get(pint.id))?.excluded_plan_ids).toHaveLength(1);
    });

    it("duplicating the section from that plan leaves the task out", async () => {
      const { morning, normal } = await removedFromNormal();
      const made = await duplicateSection(t.ctx, { sectionId: morning.id, planId: normal.id });
      const rows = await t.db.tasks
        .where("section_id")
        .equals(made.ok ? made.value.sectionId : "")
        .toArray();
      expect(rows.map((r) => r.name)).not.toContain("Drink a pint");
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.excluded_plan_ids.length === 0)).toBe(true);
    });

    it("moving to a section it's shared in keeps it out of that plan", async () => {
      const { normal, travelling, pint } = await removedFromNormal();
      const evening = await sectionNamed("Evening", "Normal");
      await linkSection(t.ctx, travelling.id, evening.id);
      await moveTask(t.ctx, { taskId: pint.id, sectionId: evening.id, via: "sheet" });
      expect(await t.db.tasks.get(pint.id)).toMatchObject({
        section_id: evening.id,
        excluded_plan_ids: [normal.id],
      });
    });

    it("moving into a section only that plan has brings it back rather than losing it", async () => {
      const { pint } = await removedFromNormal();
      const evening = await sectionNamed("Evening", "Normal");
      await moveTask(t.ctx, { taskId: pint.id, sectionId: evening.id, via: "sheet" });
      expect(await t.db.tasks.get(pint.id)).toMatchObject({
        section_id: evening.id,
        excluded_plan_ids: [],
      });
    });

    it("a reorder inside the section keeps the removal", async () => {
      const { morning, normal, pint } = await removedFromNormal();
      await moveTask(t.ctx, { taskId: pint.id, sectionId: morning.id, via: "drag" });
      expect((await t.db.tasks.get(pint.id))?.excluded_plan_ids).toEqual([normal.id]);
    });

    it("saving the form into another section follows the same rule", async () => {
      const { pint } = await removedFromNormal();
      const evening = await sectionNamed("Evening", "Normal");
      await updateTask(t.ctx, {
        taskId: pint.id,
        draft: draftOf(evening.id, { name: pint.name }),
      });
      expect(await t.db.tasks.get(pint.id)).toMatchObject({
        section_id: evening.id,
        excluded_plan_ids: [],
      });
    });

    it("combining plans carries the removal over to the plan that replaces it", async () => {
      const { normal, travelling, pint } = await removedFromNormal();
      await t.db.day_plans.update(travelling.id, { kind: "primary" });
      const result = await combinePlans(t.ctx, { localPlanIds: new Set([normal.id]) });
      expect(result.ok && result.value.retired).toBe(1);
      expect((await t.db.tasks.get(pint.id))?.excluded_plan_ids).toEqual([travelling.id]);
    });
  });

  describe("sync", () => {
    function engineFor(server: MemoryGateway, device = t) {
      return new SyncEngine({
        db: device.db,
        gateway: server,
        retry: { sleep: () => Promise.resolve(), attempts: 3 },
        now: device.ctx.now,
      });
    }

    it("uploads the removal with the task", async () => {
      const { normal } = await shareMorningWithTravelling();
      const pint = await taskIn("Drink a pint", "Normal");
      await removeTaskFromPlan(t.ctx, { taskId: pint.id, planId: normal.id });
      const server = new MemoryGateway();
      expect((await engineFor(server).sync()).ok).toBe(true);
      const remote = server.rows("tasks").find((r) => r.id === pint.id);
      expect(remote?.excluded_plan_ids).toEqual([normal.id]);
    });

    it("reaches another device, where the task is gone from that plan too", async () => {
      const { normal, travelling } = await shareMorningWithTravelling();
      const pint = await taskIn("Drink a pint", "Normal");
      const server = new MemoryGateway();
      await engineFor(server).sync();
      await removeTaskFromPlan(t.ctx, { taskId: pint.id, planId: normal.id });
      await engineFor(server).sync();

      const phone = testContext(undefined, { idPrefix: "20000000-0000-4000-8000-" });
      try {
        expect((await engineFor(server, phone).sync()).ok).toBe(true);
        const org = await readOrganisation(phone.ctx);
        const row = org.tasks.find((x) => x.id === pint.id);
        if (!row) throw new Error("the task didn't reach the other device");
        expect(plansOfTask(org, row).map((p) => p.id)).toEqual([travelling.id]);
      } finally {
        await phone.close();
      }
    });

    it("keeps the removal when another device's edit of the task is pulled", async () => {
      const { normal } = await shareMorningWithTravelling();
      const pint = await taskIn("Drink a pint", "Normal");
      const server = new MemoryGateway();
      const engine = engineFor(server);
      await engine.sync();
      await removeTaskFromPlan(t.ctx, { taskId: pint.id, planId: normal.id });
      await engine.sync();
      const remote = server.rows("tasks").find((r) => r.id === pint.id);
      server.serverWrite("tasks", {
        ...remote,
        name: "Drink water",
        updated_at: "2026-09-09T00:00:00.000Z",
      });

      await engine.sync();

      expect(await t.db.tasks.get(pint.id)).toMatchObject({
        name: "Drink water",
        excluded_plan_ids: [normal.id],
      });
    });

    it("reads rows from a server without the column as in every plan", async () => {
      const pint = await taskIn("Drink a pint", "Normal");
      const { _dirty, excluded_plan_ids, ...remote } = pint;
      expect(_dirty).toBe(1);
      expect(excluded_plan_ids).toEqual([]);
      expect(fromRemote("tasks", remote)).toMatchObject({ excluded_plan_ids: [] });
    });

    it("rejects a pulled row whose removals aren't plan ids", async () => {
      const pint = await taskIn("Drink a pint", "Normal");
      expect(fromRemote("tasks", { ...pint, excluded_plan_ids: ["not-a-uuid"] })).toBeNull();
    });
  });
});

describe("Dexie v3", () => {
  it("gives existing tasks an empty list without marking them changed", async () => {
    const name = `upgrade-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(2).stores({
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
    await old.open();
    await old.table("tasks").add({ id: "t1", section_id: "s1", name: "Old row", _dirty: 0 });
    old.close();

    const db = new RoutineDb(name);
    await db.open();
    expect(await db.tasks.get("t1")).toMatchObject({
      name: "Old row",
      excluded_plan_ids: [],
      _dirty: 0,
    });
    db.close();
    await Dexie.delete(name);
  });
});
