import { bootstrapDatabase } from "@/data/bootstrap";
import { tasksOfSection } from "@/domain/organise";
import { testContext } from "@/tests/db";
import { linkSection } from "./rows";
import { createPlan } from "./plans";
import { moveSectionToPlan, separateSectionInPlan } from "./sections";
import { readOrganisation } from "./shared";
import { createTask, duplicateTask, moveTask } from "./tasks";

describe("each Day Plan keeps its own task order in a shared section", () => {
  let t: ReturnType<typeof testContext>;
  beforeEach(async () => {
    t = testContext();
    expect((await bootstrapDatabase({ seedDemo: true, ctx: t.ctx })).ok).toBe(true);
  });
  afterEach(async () => {
    await t.close();
  });

  async function planId(name: string) {
    const plan = (await t.db.day_plans.toArray()).find((p) => p.name === name && !p.deleted_at);
    if (!plan) throw new Error(`no plan ${name}`);
    return plan.id;
  }

  async function sectionOf(plan: string, name: string) {
    const links = (await t.db.plan_sections.where("plan_id").equals(plan).toArray()).filter(
      (l) => l.deleted_at === null,
    );
    const sections = await t.db.sections.bulkGet(links.map((l) => l.section_id));
    const found = sections.find((s) => s?.name === name && s.deleted_at === null);
    if (!found) throw new Error(`no ${name}`);
    return found.id;
  }

  async function names(sectionId: string, plan: string) {
    const org = await readOrganisation(t.ctx);
    return tasksOfSection(org, sectionId, plan).map((task) => task.name);
  }

  async function idOf(sectionId: string, name: string) {
    const task = (await t.db.tasks.where("section_id").equals(sectionId).toArray()).find(
      (row) => row.name === name && row.deleted_at === null,
    );
    if (!task) throw new Error(`no task ${name}`);
    return task.id;
  }

  async function addTask(sectionId: string, name: string) {
    const result = await createTask(t.ctx, {
      draft: {
        name,
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
      },
    });
    if (!result.ok) throw result.error;
    return result.value.taskId;
  }

  /** Morning shared by Normal and Travelling, with three tasks A, B, C. */
  async function shared() {
    const normal = await planId("Normal");
    const travelling = await planId("Travelling");
    const morning = await sectionOf(normal, "Morning");
    await linkSection(t.ctx, travelling, morning);
    for (const task of await t.db.tasks.where("section_id").equals(morning).toArray()) {
      await t.db.tasks.update(task.id, { deleted_at: new Date().toISOString() });
    }
    for (const name of ["A", "B", "C"]) await addTask(morning, name);
    return { normal, travelling, morning };
  }

  it("a reorder in one plan leaves the other plan's order alone", async () => {
    const { normal, travelling, morning } = await shared();
    const c = await idOf(morning, "C");

    const moved = await moveTask(t.ctx, {
      taskId: c,
      sectionId: morning,
      afterTaskId: null,
      planId: normal,
      via: "drag",
    });
    expect(moved.ok && moved.value.moved).toBe(true);
    expect(await names(morning, normal)).toEqual(["C", "A", "B"]);
    expect(await names(morning, travelling)).toEqual(["A", "B", "C"]);

    await moveTask(t.ctx, {
      taskId: await idOf(morning, "A"),
      sectionId: morning,
      afterTaskId: c,
      planId: travelling,
      via: "drag",
    });
    expect(await names(morning, travelling)).toEqual(["B", "C", "A"]);
    expect(await names(morning, normal)).toEqual(["C", "A", "B"]);
  });

  it("dropping a task where it already is changes nothing", async () => {
    const { normal, morning } = await shared();
    const moved = await moveTask(t.ctx, {
      taskId: await idOf(morning, "B"),
      sectionId: morning,
      afterTaskId: await idOf(morning, "A"),
      planId: normal,
      via: "drag",
    });
    expect(moved.ok && moved.value.moved).toBe(false);
  });

  it("new tasks and duplicates land in every plan's order", async () => {
    const { normal, travelling, morning } = await shared();
    await moveTask(t.ctx, {
      taskId: await idOf(morning, "C"),
      sectionId: morning,
      afterTaskId: null,
      planId: normal,
      via: "drag",
    });
    await addTask(morning, "D");
    expect(await names(morning, normal)).toEqual(["C", "A", "B", "D"]);
    expect(await names(morning, travelling)).toEqual(["A", "B", "C", "D"]);

    await duplicateTask(t.ctx, { taskId: await idOf(morning, "C") });
    expect(await names(morning, normal)).toEqual(["C", "C copy", "A", "B", "D"]);
    expect(await names(morning, travelling)).toEqual(["A", "B", "C", "C copy", "D"]);
  });

  it("a section in one plan only still reorders through the shared rank", async () => {
    const normal = await planId("Normal");
    const morning = await sectionOf(normal, "Morning");
    const before = await names(morning, normal);
    const last = before[before.length - 1] ?? "";
    await moveTask(t.ctx, {
      taskId: await idOf(morning, last),
      sectionId: morning,
      afterTaskId: null,
      planId: normal,
      via: "drag",
    });
    expect((await names(morning, normal))[0]).toBe(last);
    const rows = await t.db.tasks.where("section_id").equals(morning).toArray();
    expect(rows.every((row) => Object.keys(row.plan_ranks).length === 0)).toBe(true);
  });

  it("Separate keeps the order the separating plan had", async () => {
    const { normal, travelling, morning } = await shared();
    await moveTask(t.ctx, {
      taskId: await idOf(morning, "C"),
      sectionId: morning,
      afterTaskId: null,
      planId: travelling,
      via: "drag",
    });
    expect(
      (await separateSectionInPlan(t.ctx, { sectionId: morning, planId: travelling })).ok,
    ).toBe(true);
    const copy = await sectionOf(travelling, "Morning");
    expect(copy).not.toBe(morning);
    expect(await names(copy, travelling)).toEqual(["C", "A", "B"]);
    expect(await names(morning, normal)).toEqual(["A", "B", "C"]);
  });

  it("moving the section to another plan takes the order with it", async () => {
    const { normal, travelling, morning } = await shared();
    await moveTask(t.ctx, {
      taskId: await idOf(morning, "C"),
      sectionId: morning,
      afterTaskId: null,
      planId: travelling,
      via: "drag",
    });
    const result = await moveSectionToPlan(t.ctx, {
      sectionId: morning,
      fromPlanId: travelling,
      toPlanId: await planId("Normal"),
    });
    expect(result.ok).toBe(true);
    // Normal already had it, so the section just leaves Travelling; Normal keeps its own order.
    expect(await names(morning, normal)).toEqual(["A", "B", "C"]);

    const created = await createPlan(t.ctx, { name: "Weekend" });
    const weekend = created.ok ? created.value.planId : "";
    await linkSection(t.ctx, travelling, morning);
    await moveTask(t.ctx, {
      taskId: await idOf(morning, "B"),
      sectionId: morning,
      afterTaskId: null,
      planId: travelling,
      via: "drag",
    });
    await moveSectionToPlan(t.ctx, {
      sectionId: morning,
      fromPlanId: travelling,
      toPlanId: weekend,
    });
    expect(await names(morning, weekend)).toEqual(["B", "A", "C"]);
    expect(await names(morning, normal)).toEqual(["A", "B", "C"]);
  });
});
