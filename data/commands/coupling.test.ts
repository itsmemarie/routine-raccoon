import { bootstrapDatabase } from "@/data/bootstrap";
import { coupledCount, taskCouplingView } from "@/domain/coupling";
import { plansOfSection, sectionRows, taskPlacement } from "@/domain/organise";
import { testContext } from "@/tests/db";
import { applySectionCoupling, applyTaskCoupling, revertCoupling } from "./coupling";
import { tickTask } from "./day";
import { duplicateSection, separateSectionInPlan } from "./sections";
import { readOrganisation } from "./shared";
import { createTask, deleteTask, duplicateTask, patchTask } from "./tasks";
import type { TaskDraft } from "./validate";

/** Coupling sheet (handoff "Coupling"): coupled copies share edits, never ticks. */
describe("coupling", () => {
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

  async function sectionIn(name: string, planName: string) {
    const plan = await planNamed(planName);
    const row = sectionRows(await readOrganisation(t.ctx), plan.id).find(
      (r) => r.section.name === name,
    );
    if (!row) throw new Error(`no section ${name} in ${planName}`);
    return row.section;
  }

  async function taskIn(name: string, sectionName: string, planName: string) {
    const section = await sectionIn(sectionName, planName);
    const found = (await t.db.tasks.toArray()).find(
      (x) => x.section_id === section.id && x.name === name && x.deleted_at === null,
    );
    if (!found) throw new Error(`no task ${name}`);
    return found;
  }

  const live = async (id: string) => {
    const row = await t.db.tasks.get(id);
    if (!row) throw new Error("gone");
    return row;
  };

  async function coupleBackIntoTravelling() {
    const back = await taskIn("Straighten your back", "Morning", "Normal");
    const travelling = await planNamed("Travelling");
    t.advance(60_000);
    const result = await applyTaskCoupling(t.ctx, {
      taskId: back.id,
      couple: { sectionIds: [], planIds: [travelling.id] },
    });
    if (!result.ok) throw result.error;
    const [copyId] = result.value.undo.createdTaskIds;
    if (!copyId) throw new Error("no copy");
    return { back, travelling, copyId, undo: result.value.undo };
  }

  it("couples a task into another Day Plan with a linked copy that has its own step ids", async () => {
    const { back, travelling, copyId } = await coupleBackIntoTravelling();
    const source = await live(back.id);
    const copy = await live(copyId);
    expect(source.link_id).not.toBeNull();
    expect(copy.link_id).toBe(source.link_id);
    expect(source._dirty).toBe(1);
    const org = await readOrganisation(t.ctx);
    expect(coupledCount(org, source)).toBe(1);
    const view = taskCouplingView(org, source, null);
    expect(view.plans.find((p) => p.id === travelling.id)?.state).toMatchObject({
      kind: "coupled",
      copyId,
    });
    const log = await t.db.log_entries.orderBy("at").toArray();
    expect(log.at(-1)).toMatchObject({ title: "Coupled Straighten your back" });
  });

  it("an edit to one copy reaches the other; a tick stays on its own copy", async () => {
    const { back, copyId } = await coupleBackIntoTravelling();
    t.advance(60_000);
    expect(
      (
        await patchTask(t.ctx, {
          taskId: copyId,
          patch: { name: "Stretch your back", steps: [{ text: "Roll shoulders" }] },
        })
      ).ok,
    ).toBe(true);
    const source = await live(back.id);
    const copy = await live(copyId);
    expect(source.name).toBe("Stretch your back");
    expect(source.steps.map((s) => s.text)).toEqual(["Roll shoulders"]);
    expect(source.steps[0]?.id).not.toBe(copy.steps[0]?.id);
    expect(source.updated_at).toBe(copy.updated_at);

    expect((await tickTask(t.ctx, { taskId: copyId, dayKey: "2026-09-08" })).ok).toBe(true);
    const ticks = await t.db.task_occurrences.toArray();
    expect(ticks.filter((o) => o.task_id === copyId && o.status === "done")).toHaveLength(1);
    expect(ticks.filter((o) => o.task_id === back.id && o.status === "done")).toHaveLength(0);
  });

  it("decoupling leaves both tasks in place and drops a link of one", async () => {
    const { back, copyId } = await coupleBackIntoTravelling();
    const result = await applyTaskCoupling(t.ctx, { taskId: back.id, decouple: [copyId] });
    expect(result.ok && result.value.decoupled).toBe(1);
    expect((await live(back.id)).link_id).toBeNull();
    expect((await live(copyId)).link_id).toBeNull();
    expect((await live(copyId)).deleted_at).toBeNull();
    await patchTask(t.ctx, { taskId: back.id, patch: { name: "Only here" } });
    expect((await live(copyId)).name).toBe("Straighten your back");
  });

  it('"Edit only here" decouples the task itself from a link of three', async () => {
    const back = await taskIn("Straighten your back", "Morning", "Normal");
    const travelling = await planNamed("Travelling");
    const evening = await sectionIn("Evening", "Normal");
    const made = await applyTaskCoupling(t.ctx, {
      taskId: back.id,
      couple: { sectionIds: [evening.id], planIds: [travelling.id] },
    });
    if (!made.ok) throw made.error;
    const [a, b] = made.value.undo.createdTaskIds;
    await applyTaskCoupling(t.ctx, { taskId: back.id, decouple: [back.id] });
    expect((await live(back.id)).link_id).toBeNull();
    expect((await live(a ?? "")).link_id).not.toBeNull();
    expect((await live(a ?? "")).link_id).toBe((await live(b ?? "")).link_id);
  });

  it("Undo removes the copy and the link", async () => {
    const { back, copyId, undo } = await coupleBackIntoTravelling();
    expect((await revertCoupling(t.ctx, { undo })).ok).toBe(true);
    expect((await live(copyId)).deleted_at).not.toBeNull();
    expect((await live(back.id)).link_id).toBeNull();
  });

  it("From all plans deletes the coupled copies, by link not by name", async () => {
    const { back, copyId } = await coupleBackIntoTravelling();
    // A same-named, uncoupled task elsewhere is not part of the link.
    const survivalBack = (await t.db.tasks.toArray()).filter(
      (x) => x.name === "Straighten your back" && x.id !== back.id && x.id !== copyId,
    );
    expect(survivalBack.length).toBeGreaterThan(0);
    const placement = taskPlacement(await readOrganisation(t.ctx), await live(back.id), null);
    expect(placement.copies.map((c) => c.id)).toEqual([copyId]);
    expect((await deleteTask(t.ctx, { taskId: back.id })).ok).toBe(true);
    expect((await live(copyId)).deleted_at).not.toBeNull();
    for (const other of survivalBack) expect((await live(other.id)).deleted_at).toBeNull();
  });

  it("duplicates and section copies start uncoupled", async () => {
    const { back } = await coupleBackIntoTravelling();
    const dup = await duplicateTask(t.ctx, { taskId: back.id });
    expect(dup.ok && (await live(dup.value.taskId)).link_id).toBeNull();
    const normal = await planNamed("Normal");
    const morning = await sectionIn("Morning", "Normal");
    const copy = await duplicateSection(t.ctx, { sectionId: morning.id, planId: normal.id });
    if (!copy.ok) throw copy.error;
    const copied = (await t.db.tasks.toArray()).filter(
      (x) => x.section_id === copy.value.sectionId,
    );
    expect(copied.length).toBeGreaterThan(0);
    expect(copied.every((x) => x.link_id === null)).toBe(true);
  });

  it('"Keep them coupled" on New task links the copies', async () => {
    const morning = await sectionIn("Morning", "Normal");
    const travelling = await planNamed("Travelling");
    const draft: TaskDraft = {
      name: "Vitamins",
      emoji: "",
      minutes: 1,
      hard: false,
      sectionId: morning.id,
      steps: [],
      mantra: "",
      notes: "",
      videoUrl: "",
      location: "",
      recurrence: null,
      neverShrink: false,
      smaller: { minutes: null, text: "" },
    };
    const made = await createTask(t.ctx, {
      draft,
      copyTo: { sectionIds: [], planIds: [travelling.id], coupled: true },
    });
    if (!made.ok) throw made.error;
    const vitamins = (await t.db.tasks.toArray()).filter((x) => x.name === "Vitamins");
    expect(vitamins).toHaveLength(2);
    expect(vitamins[0]?.link_id).not.toBeNull();
    expect(vitamins[0]?.link_id).toBe(vitamins[1]?.link_id);
  });

  describe("sections", () => {
    it("couples a section into another plan, shows its removed tasks, and Undo takes it back", async () => {
      const morning = await sectionIn("Morning", "Normal");
      const normal = await planNamed("Normal");
      const travelling = await planNamed("Travelling");
      const result = await applySectionCoupling(t.ctx, {
        sectionId: morning.id,
        planId: normal.id,
        couple: [travelling.id],
      });
      if (!result.ok) throw result.error;
      let org = await readOrganisation(t.ctx);
      expect(plansOfSection(org, morning.id).map((p) => p.id)).toContain(travelling.id);
      expect(result.value.undo).not.toBeNull();
      if (result.value.undo) await revertCoupling(t.ctx, { undo: result.value.undo });
      org = await readOrganisation(t.ctx);
      expect(plansOfSection(org, morning.id).map((p) => p.id)).not.toContain(travelling.id);
    });

    it("decouple is Separate: an own copy, no Undo, and never the last plan", async () => {
      const morning = await sectionIn("Morning", "Normal");
      const normal = await planNamed("Normal");
      const travelling = await planNamed("Travelling");
      await applySectionCoupling(t.ctx, {
        sectionId: morning.id,
        planId: normal.id,
        couple: [travelling.id],
      });
      const result = await applySectionCoupling(t.ctx, {
        sectionId: morning.id,
        planId: normal.id,
        decouple: [travelling.id],
      });
      expect(result.ok && result.value.undo).toBeNull();
      // Decoupled from every other plan: this plan takes the copy, as Separate does.
      const org = await readOrganisation(t.ctx);
      expect(plansOfSection(org, morning.id).map((p) => p.id)).toEqual([travelling.id]);
      const own = sectionRows(org, normal.id).find((r) => r.section.name === "Morning");
      expect(own?.section.id).not.toBe(morning.id);
      expect(own?.alsoIn).toEqual([]);
    });

    it("decoupling one of several plans leaves the others coupled", async () => {
      const morning = await sectionIn("Morning", "Normal");
      const normal = await planNamed("Normal");
      const travelling = await planNamed("Travelling");
      const third = (await t.db.day_plans.toArray()).find(
        (p) => p.id !== normal.id && p.id !== travelling.id && p.deleted_at === null,
      );
      if (!third) throw new Error("no third plan");
      await applySectionCoupling(t.ctx, {
        sectionId: morning.id,
        planId: normal.id,
        couple: [travelling.id, third.id],
      });
      await applySectionCoupling(t.ctx, {
        sectionId: morning.id,
        planId: normal.id,
        decouple: [third.id],
      });
      const org = await readOrganisation(t.ctx);
      expect(
        plansOfSection(org, morning.id)
          .map((p) => p.id)
          .sort(),
      ).toEqual([normal.id, travelling.id].sort());
      // Separate itself is unchanged.
      expect(
        (await separateSectionInPlan(t.ctx, { sectionId: morning.id, planId: normal.id })).ok,
      ).toBe(true);
    });
  });
});
