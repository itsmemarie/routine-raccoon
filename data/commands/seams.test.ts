import { bootstrapDatabase } from "@/data/bootstrap";
import { readKv } from "@/data/db/kv";
import { sectionRows, tasksOfSection } from "@/domain/organise";
import { buildProgress } from "@/domain/progress";
import { testContext } from "@/tests/db";
import { tickTask } from "./day";
import { linkSection } from "./rows";
import { copySectionToPlan, moveSectionToPlan, separateSectionInPlan } from "./sections";
import { currentDayKey, readOrganisation, readSettings } from "./shared";
import { startTimer } from "./timer";
import { copyTaskToPlan, deleteTask, removeTaskFromPlan } from "./tasks";

const ONE_DAY = 24 * 60 * 60 * 1000;

/** Features used together on the demo routine, where each one alone is already tested. */
describe("seams between task and section features", () => {
  let t: ReturnType<typeof testContext>;
  beforeEach(async () => {
    t = testContext();
    expect((await bootstrapDatabase({ seedDemo: true, ctx: t.ctx })).ok).toBe(true);
  });
  afterEach(async () => {
    await t.close();
  });

  const planNamed = async (name: string) => {
    const found = (await t.db.day_plans.toArray()).find((p) => p.name === name);
    if (!found) throw new Error(`no plan ${name}`);
    return found;
  };
  const sectionIn = async (planName: string, name: string) => {
    const plan = await planNamed(planName);
    const row = sectionRows(await readOrganisation(t.ctx), plan.id).find(
      (r) => r.section.name === name,
    );
    if (!row) throw new Error(`no ${name} in ${planName}`);
    return row.section;
  };
  const namesIn = async (planName: string) => {
    const org = await readOrganisation(t.ctx);
    const plan = await planNamed(planName);
    return sectionRows(org, plan.id).flatMap((r) =>
      tasksOfSection(org, r.section.id, plan.id).map((x) => x.name),
    );
  };
  const idsIn = async (planName: string) => {
    const org = await readOrganisation(t.ctx);
    const plan = await planNamed(planName);
    return sectionRows(org, plan.id).flatMap((r) =>
      tasksOfSection(org, r.section.id, plan.id).map((x) => x.id),
    );
  };
  const taskNamed = async (sectionId: string, name: string) => {
    const found = (await t.db.tasks.where("section_id").equals(sectionId).toArray()).find(
      (x) => x.name === name && x.deleted_at === null,
    );
    if (!found) throw new Error(`no task ${name}`);
    return found;
  };

  /** Normal's Evening shared with Travelling, which has Morning first, so Evening isn't first. */
  async function shareMorning() {
    const morning = await sectionIn("Normal", "Morning");
    await linkSection(t.ctx, (await planNamed("Travelling")).id, morning.id);
    return morning;
  }

  it("Copy to Day Plan into a shared first section shows the copy in one plan only", async () => {
    await shareMorning();
    const smash = await sectionIn("Normal", "Smash it");
    const task = (await t.db.tasks.where("section_id").equals(smash.id).toArray())[0];
    if (!task) throw new Error("no task");
    const travelling = await planNamed("Travelling");
    // Morning is Travelling's first section and is shared with Normal.
    expect((await copyTaskToPlan(t.ctx, { taskId: task.id, planId: travelling.id })).ok).toBe(true);
    const count = (names: string[]) => names.filter((n) => n === task.name).length;
    expect(count(await namesIn("Travelling"))).toBe(1);
    expect(count(await namesIn("Normal"))).toBe(1);
  });

  it("a task removed from a plan stays removed when its section moves to another plan", async () => {
    const morning = await shareMorning();
    const normal = await planNamed("Normal");
    const travelling = await planNamed("Travelling");
    const bad = await planNamed("Bad day");
    const task = await taskNamed(morning.id, "Eat something");
    await removeTaskFromPlan(t.ctx, { taskId: task.id, planId: travelling.id });
    expect(await namesIn("Travelling")).not.toContain("Eat something");
    await moveSectionToPlan(t.ctx, {
      sectionId: morning.id,
      fromPlanId: travelling.id,
      toPlanId: bad.id,
    });
    expect(await idsIn("Bad day")).not.toContain(task.id);
    expect(await idsIn("Normal")).toContain(task.id);
    expect(normal.id).not.toBe(bad.id);
  });

  it("Copy section into a plan leaves out what the source plan doesn't show", async () => {
    const morning = await shareMorning();
    const travelling = await planNamed("Travelling");
    const bad = await planNamed("Bad day");
    const task = await taskNamed(morning.id, "Eat something");
    await removeTaskFromPlan(t.ctx, { taskId: task.id, planId: travelling.id });
    await copySectionToPlan(t.ctx, {
      sectionId: morning.id,
      fromPlanId: travelling.id,
      planId: bad.id,
    });
    // The copy is new rows, so it can't be found by id: Bad day must still hold just
    // "Eat something" (its own), not a second one.
    const copies = (await namesIn("Bad day")).filter((n) => n === "Eat something").length;
    expect(copies).toBe(1);
  });

  it("deleting a task stops the timer running on it", async () => {
    const morning = await sectionIn("Normal", "Morning");
    const task = await taskNamed(morning.id, "Eat something");
    const dayKey = await currentDayKey(t.ctx);
    await startTimer(t.ctx, { taskId: task.id, dayKey });
    expect(await readKv(t.db, "timer")).not.toBeNull();
    await deleteTask(t.ctx, { taskId: task.id });
    expect(await readKv(t.db, "timer")).toBeNull();
  });

  it("deleting a different task leaves the timer alone", async () => {
    const morning = await sectionIn("Normal", "Morning");
    const timed = await taskNamed(morning.id, "Eat something");
    const other = await taskNamed(morning.id, "Drink a pint");
    await startTimer(t.ctx, { taskId: timed.id, dayKey: await currentDayKey(t.ctx) });
    await deleteTask(t.ctx, { taskId: other.id });
    expect((await readKv(t.db, "timer"))?.taskId).toBe(timed.id);
  });

  it("Separate moves a running timer to the copy the plan now shows", async () => {
    const morning = await shareMorning();
    const normal = await planNamed("Normal");
    const task = await taskNamed(morning.id, "Eat something");
    await startTimer(t.ctx, { taskId: task.id, dayKey: await currentDayKey(t.ctx) });
    await separateSectionInPlan(t.ctx, { sectionId: morning.id, planId: normal.id });
    const id = (await readKv(t.db, "timer"))?.taskId ?? "";
    expect(id).not.toBe(task.id);
    const shown = tasksOfSection(
      await readOrganisation(t.ctx),
      (await sectionIn("Normal", "Morning")).id,
    );
    expect(shown.map((x) => x.id)).toContain(id);
  });

  async function progress() {
    const today = await currentDayKey(t.ctx);
    return buildProgress({
      month: today,
      today,
      definitions: await readOrganisation(t.ctx),
      occurrences: await t.db.task_occurrences.toArray(),
      dayRecords: await t.db.day_records.toArray(),
      settings: await readSettings(t.ctx),
    });
  }

  it("Progress lists a separated habit and section once, with both plans' days added", async () => {
    const morning = await shareMorning();
    const normal = await planNamed("Normal");
    const task = await taskNamed(morning.id, "Eat something");
    const first = await currentDayKey(t.ctx);
    await tickTask(t.ctx, { taskId: task.id, dayKey: first });
    t.advance(ONE_DAY);
    const before = await progress();
    await separateSectionInPlan(t.ctx, { sectionId: morning.id, planId: normal.id });
    const after = await progress();
    expect(after.habits.filter((h) => h.task.name === "Eat something")).toHaveLength(1);
    expect(after.habits.length).toBe(before.habits.length);
    expect(after.timeBySection.filter((s) => s.section.name === "Morning")).toHaveLength(1);
    expect(after.timeBySection).toEqual(
      before.timeBySection.map((row) => ({ minutes: row.minutes, section: expect.anything() })),
    );
  });

  it("a deleted task's past ticks stay on Progress", async () => {
    const morning = await sectionIn("Normal", "Morning");
    const task = await taskNamed(morning.id, "Eat something");
    const day = await currentDayKey(t.ctx);
    await tickTask(t.ctx, { taskId: task.id, dayKey: day });
    t.advance(ONE_DAY);
    const before = (await progress()).cells.find((c) => c.dayKey === day);
    await deleteTask(t.ctx, { taskId: task.id });
    const after = await progress();
    expect(after.cells.find((c) => c.dayKey === day)).toEqual(before);
    expect(after.habits.map((h) => h.task.name)).toContain("Eat something");
  });
});
