import { bootstrapDatabase } from "@/data/bootstrap";
import { compareRank } from "@/domain/rank";
import { testContext } from "@/tests/db";
import { tickTask, toggleStep } from "./day";
import {
  archivePlan,
  createPlan,
  deletePlan,
  duplicatePlan,
  makePrimary,
  renamePlan,
  reorderPlan,
  restorePlan,
  setPlanDescription,
  setSurvivalMembership,
} from "./plans";
import { linkSection } from "./rows";
import {
  archiveSection,
  copySectionToPlan,
  createSection,
  deleteSection,
  duplicateSection,
  moveSectionToPlan,
  removeSectionFromPlan,
  reorderSection,
  restoreSection,
  separateSectionInPlan,
  updateSection,
  type SectionDraft,
} from "./sections";
import { currentDayKey } from "./shared";
import { createTask, removeTaskFromPlan } from "./tasks";

describe("section and Day Plan commands", () => {
  let t: ReturnType<typeof testContext>;
  beforeEach(async () => {
    t = testContext();
    expect((await bootstrapDatabase({ seedDemo: true, ctx: t.ctx })).ok).toBe(true);
  });
  afterEach(async () => {
    await t.close();
  });

  async function planByName(name: string) {
    const plan = (await t.db.day_plans.toArray()).find((p) => p.name === name && !p.deleted_at);
    if (!plan) throw new Error(`no plan ${name}`);
    return plan;
  }

  async function sectionNames(planId: string) {
    const links = (await t.db.plan_sections.where("plan_id").equals(planId).toArray())
      .filter((l) => l.deleted_at === null)
      .sort(compareRank);
    const sections = await t.db.sections.bulkGet(links.map((l) => l.section_id));
    return sections.filter((s) => s && s.deleted_at === null).map((s) => s?.name);
  }

  async function sectionIn(planName: string, name: string) {
    const plan = await planByName(planName);
    const links = (await t.db.plan_sections.where("plan_id").equals(plan.id).toArray()).filter(
      (l) => l.deleted_at === null,
    );
    const sections = await t.db.sections.bulkGet(links.map((l) => l.section_id));
    const found = sections.find((s) => s?.name === name && s.deleted_at === null);
    if (!found) throw new Error(`no ${name}`);
    return found;
  }

  async function taskNames(sectionId: string) {
    return (await t.db.tasks.where("section_id").equals(sectionId).toArray())
      .filter((task) => task.deleted_at === null)
      .sort(compareRank)
      .map((task) => task.name);
  }

  async function addTask(
    sectionId: string,
    name: string,
    steps: readonly { text: string }[] = [],
  ): Promise<string> {
    const result = await createTask(t.ctx, {
      draft: {
        name,
        emoji: "",
        minutes: 5,
        hard: false,
        sectionId,
        steps: [...steps],
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

  function sectionDraft(planIds: string[], overrides: Partial<SectionDraft> = {}): SectionDraft {
    return {
      name: "Lunch",
      description: "",
      color: "#E5134A",
      startTime: "12:30",
      recurrence: null,
      lengthOverride: null,
      notifyOnStart: true,
      notifyBeforeClose: true,
      closingLeadMinutes: 15,
      planIds,
      ...overrides,
    };
  }

  describe("sections", () => {
    it("creates a section linked into every picked plan and logs it once", async () => {
      const normal = await planByName("Normal");
      const travelling = await planByName("Travelling");
      const result = await createSection(t.ctx, {
        draft: sectionDraft([normal.id, travelling.id]),
      });
      expect(result.ok).toBe(true);
      expect((await sectionNames(normal.id)).at(-1)).toBe("Lunch");
      expect((await sectionNames(travelling.id)).at(-1)).toBe("Lunch");
      const entry = (await t.db.log_entries.where("kind").equals("added").toArray()).at(-1);
      expect(entry).toMatchObject({
        title: "Added section Lunch",
        meta: "Normal, Travelling · 12:30 · every day",
      });
    });

    it.each([
      [{ name: "" }, "RR-VAL-001"],
      [{ startTime: "25:00" }, "RR-VAL-004"],
      [{ lengthOverride: 0 }, "RR-VAL-002"],
    ])("validates %o → %s", async (overrides, code) => {
      const normal = await planByName("Normal");
      const result = await createSection(t.ctx, { draft: sectionDraft([normal.id], overrides) });
      expect(result.ok ? null : result.error.code).toBe(code);
    });

    it("needs at least one Day Plan (RR-VAL-007)", async () => {
      const result = await createSection(t.ctx, { draft: sectionDraft([]) });
      expect(result.ok ? null : result.error.code).toBe("RR-VAL-007");
    });

    it("update edits fields and plan links (adds and removes)", async () => {
      const normal = await planByName("Normal");
      const travelling = await planByName("Travelling");
      const evening = await sectionIn("Normal", "Evening");
      await updateSection(t.ctx, {
        sectionId: evening.id,
        draft: sectionDraft([travelling.id], { name: "Evenings", lengthOverride: 45 }),
      });
      expect(await sectionNames(normal.id)).not.toContain("Evenings");
      expect(await sectionNames(travelling.id)).toContain("Evenings");
      expect((await t.db.sections.get(evening.id))?.length_override_minutes).toBe(45);
    });

    it("duplicates right after the original, with its tasks", async () => {
      const normal = await planByName("Normal");
      const morning = await sectionIn("Normal", "Morning");
      const result = await duplicateSection(t.ctx, { sectionId: morning.id, planId: normal.id });
      expect(result.ok).toBe(true);
      expect((await sectionNames(normal.id)).slice(0, 2)).toEqual(["Morning", "Morning copy"]);
      const copyId = result.ok ? result.value.sectionId : "";
      expect(await t.db.tasks.where("section_id").equals(copyId).count()).toBe(3);
    });

    it("copy to Day Plan makes an independent copy with its tasks", async () => {
      const normal = await planByName("Normal");
      const travelling = await planByName("Travelling");
      const morning = await sectionIn("Normal", "Morning");
      const result = await copySectionToPlan(t.ctx, {
        sectionId: morning.id,
        fromPlanId: normal.id,
        planId: travelling.id,
      });
      expect(result.ok && result.value.alreadyThere).toBe(false);
      const copy = await sectionIn("Travelling", "Morning");
      expect(copy.id).not.toBe(morning.id);
      expect(await taskNames(copy.id)).toEqual(await taskNames(morning.id));
      expect(await t.db.plan_sections.get([travelling.id, morning.id])).toBeUndefined();
    });

    it("copy to Day Plan leaves out tasks removed from the plan it copies from", async () => {
      const normal = await planByName("Normal");
      const travelling = await planByName("Travelling");
      const morning = await sectionIn("Normal", "Morning");
      await linkSection(t.ctx, travelling.id, morning.id);
      const removed = await addTask(morning.id, "Pack a bag");
      await removeTaskFromPlan(t.ctx, { taskId: removed, planId: normal.id });
      const created = await createPlan(t.ctx, { name: "Weekend" });
      const weekendId = created.ok ? created.value.planId : "";

      await copySectionToPlan(t.ctx, {
        sectionId: morning.id,
        fromPlanId: normal.id,
        planId: weekendId,
      });

      const copy = await sectionIn("Weekend", "Morning");
      expect(await taskNames(copy.id)).not.toContain("Pack a bag");
      expect(await taskNames(morning.id)).toContain("Pack a bag");
    });

    it("a task added in one Day Plan stays there after a section copy", async () => {
      const normal = await planByName("Normal");
      const travelling = await planByName("Travelling");
      const morning = await sectionIn("Normal", "Morning");
      await copySectionToPlan(t.ctx, {
        sectionId: morning.id,
        fromPlanId: normal.id,
        planId: travelling.id,
      });
      const copy = await sectionIn("Travelling", "Morning");

      await addTask(copy.id, "Pack a bag");
      await addTask(morning.id, "Water the plants");

      expect(await taskNames(copy.id)).toContain("Pack a bag");
      expect(await taskNames(morning.id)).not.toContain("Pack a bag");
      expect(await taskNames(morning.id)).toContain("Water the plants");
      expect(await taskNames(copy.id)).not.toContain("Water the plants");
    });

    it("copy to Day Plan adds nothing when the section is already shared with that plan", async () => {
      const normal = await planByName("Normal");
      const travelling = await planByName("Travelling");
      const morning = await sectionIn("Normal", "Morning");
      await linkSection(t.ctx, travelling.id, morning.id);
      const before = await sectionNames(travelling.id);
      const result = await copySectionToPlan(t.ctx, {
        sectionId: morning.id,
        fromPlanId: normal.id,
        planId: travelling.id,
      });
      expect(result.ok && result.value.alreadyThere).toBe(true);
      expect(await sectionNames(travelling.id)).toEqual(before);
    });

    describe("separate from other Day Plans", () => {
      async function shareMorning() {
        const normal = await planByName("Normal");
        const travelling = await planByName("Travelling");
        const morning = await sectionIn("Normal", "Morning");
        await linkSection(t.ctx, travelling.id, morning.id);
        return { normal, travelling, morning };
      }

      it("swaps in a copy at the same position and the other plan keeps the original", async () => {
        const { normal, morning } = await shareMorning();
        const order = await sectionNames(normal.id);

        const result = await separateSectionInPlan(t.ctx, {
          sectionId: morning.id,
          planId: normal.id,
        });

        expect(result.ok).toBe(true);
        expect(await sectionNames(normal.id)).toEqual(order);
        const copy = await sectionIn("Normal", "Morning");
        expect(copy.id).not.toBe(morning.id);
        expect((await sectionIn("Travelling", "Morning")).id).toBe(morning.id);
        expect(await taskNames(copy.id)).toEqual(await taskNames(morning.id));
        const log = (await t.db.log_entries.toArray()).filter((e) => e.section_id === copy.id);
        expect(log.map((entry) => entry.title)).toEqual(["Separated section Morning"]);
      });

      it("copies the section as this plan shows it", async () => {
        const { normal, travelling, morning } = await shareMorning();
        const removed = await addTask(morning.id, "Pack a bag");
        await removeTaskFromPlan(t.ctx, { taskId: removed, planId: travelling.id });

        await separateSectionInPlan(t.ctx, { sectionId: morning.id, planId: travelling.id });

        const copy = await sectionIn("Travelling", "Morning");
        expect(await taskNames(copy.id)).not.toContain("Pack a bag");
        expect((await sectionIn("Normal", "Morning")).id).toBe(morning.id);
        expect(await sectionNames(normal.id)).toContain("Morning");
      });

      it("stops new tasks reaching the other plan", async () => {
        const { normal, morning } = await shareMorning();
        await separateSectionInPlan(t.ctx, { sectionId: morning.id, planId: normal.id });
        const copy = await sectionIn("Normal", "Morning");
        await addTask(copy.id, "Pack a bag");
        expect(await taskNames(copy.id)).toContain("Pack a bag");
        expect(await taskNames(morning.id)).not.toContain("Pack a bag");
      });

      it("moves today's ticks to the copies when the plan is on Today, so nothing counts twice", async () => {
        const { normal, morning } = await shareMorning();
        const dayKey = await currentDayKey(t.ctx);
        const taskId = await addTask(morning.id, "Pack a bag", [
          { text: "Find it" },
          { text: "Fill it" },
        ]);
        const stepId = (await t.db.tasks.get(taskId))?.steps[1]?.id ?? "";
        await toggleStep(t.ctx, { taskId, dayKey, stepId, checked: true });
        await tickTask(t.ctx, { taskId, dayKey });

        await separateSectionInPlan(t.ctx, { sectionId: morning.id, planId: normal.id });

        const copySection = await sectionIn("Normal", "Morning");
        const tasks = await t.db.tasks.where("section_id").equals(copySection.id).toArray();
        const copy = tasks.find((task) => task.name === "Pack a bag");
        const moved = await t.db.task_occurrences
          .where("[task_id+day_key]")
          .equals([copy?.id ?? "", dayKey])
          .first();
        expect(moved?.status).toBe("done");
        expect(moved?.minutes_credited).toBe(5);
        expect(moved?.checked_step_ids).toEqual([copy?.steps[1]?.id]);
        const original = await t.db.task_occurrences
          .where("[task_id+day_key]")
          .equals([taskId, dayKey])
          .first();
        expect(original?.deleted_at).not.toBeNull();
      });

      it("leaves today's ticks with the original when another plan is on Today", async () => {
        const { travelling, morning } = await shareMorning();
        const dayKey = await currentDayKey(t.ctx);
        const taskId = await addTask(morning.id, "Pack a bag");
        await tickTask(t.ctx, { taskId, dayKey });

        await separateSectionInPlan(t.ctx, { sectionId: morning.id, planId: travelling.id });

        const original = await t.db.task_occurrences
          .where("[task_id+day_key]")
          .equals([taskId, dayKey])
          .first();
        expect(original?.deleted_at).toBeNull();
        const copySection = await sectionIn("Travelling", "Morning");
        const copies = await t.db.tasks.where("section_id").equals(copySection.id).toArray();
        const ticked = await t.db.task_occurrences
          .where("task_id")
          .anyOf(copies.map((task) => task.id))
          .count();
        expect(ticked).toBe(0);
      });

      it("does nothing for a section that is only in one plan", async () => {
        const normal = await planByName("Normal");
        const wind = await sectionIn("Normal", "Wind down");
        const result = await separateSectionInPlan(t.ctx, {
          sectionId: wind.id,
          planId: normal.id,
        });
        expect(result.ok).toBe(true);
        expect((await sectionIn("Normal", "Wind down")).id).toBe(wind.id);
      });

      it("fails with RR-DB-005 when the section isn't in that plan", async () => {
        const travelling = await planByName("Travelling");
        const morning = await sectionIn("Normal", "Morning");
        const result = await separateSectionInPlan(t.ctx, {
          sectionId: morning.id,
          planId: travelling.id,
        });
        expect(result.ok ? null : result.error.code).toBe("RR-DB-005");
      });
    });

    it("move to Day Plan leaves the old plan", async () => {
      const normal = await planByName("Normal");
      const travelling = await planByName("Travelling");
      const wind = await sectionIn("Normal", "Wind down");
      await moveSectionToPlan(t.ctx, {
        sectionId: wind.id,
        fromPlanId: normal.id,
        toPlanId: travelling.id,
      });
      expect(await sectionNames(normal.id)).not.toContain("Wind down");
      expect(await sectionNames(travelling.id)).toContain("Wind down");
    });

    it("remove from one plan works for linked sections, not for the last plan", async () => {
      const normal = await planByName("Normal");
      const travelling = await planByName("Travelling");
      const morning = await sectionIn("Normal", "Morning");
      const last = await removeSectionFromPlan(t.ctx, { sectionId: morning.id, planId: normal.id });
      expect(last.ok ? null : last.error.code).toBe("RR-VAL-007");
      await linkSection(t.ctx, travelling.id, morning.id);
      const ok = await removeSectionFromPlan(t.ctx, { sectionId: morning.id, planId: normal.id });
      expect(ok.ok).toBe(true);
      expect(await sectionNames(normal.id)).not.toContain("Morning");
    });

    it("reorders within a plan", async () => {
      const normal = await planByName("Normal");
      const wind = await sectionIn("Normal", "Wind down");
      await reorderSection(t.ctx, { planId: normal.id, sectionId: wind.id, afterSectionId: null });
      expect((await sectionNames(normal.id))[0]).toBe("Wind down");
      const missing = await reorderSection(t.ctx, {
        planId: normal.id,
        sectionId: "00000000-0000-4000-8000-000000000999",
        afterSectionId: null,
      });
      expect(missing.ok).toBe(false);
    });

    it("archive / restore; a section left in no plan comes back into the primary", async () => {
      const normal = await planByName("Normal");
      const morning = await sectionIn("Normal", "Morning");
      await archiveSection(t.ctx, { sectionId: morning.id });
      expect((await t.db.sections.get(morning.id))?.archived_at).not.toBeNull();
      await t.db.plan_sections.update([normal.id, morning.id], { deleted_at: "x" });
      await restoreSection(t.ctx, { sectionId: morning.id });
      expect((await t.db.sections.get(morning.id))?.archived_at).toBeNull();
      expect(await sectionNames(normal.id)).toContain("Morning");
    });

    it("delete removes the section, its tasks and its links", async () => {
      const normal = await planByName("Normal");
      const morning = await sectionIn("Normal", "Morning");
      await deleteSection(t.ctx, { sectionId: morning.id });
      expect((await t.db.sections.get(morning.id))?.deleted_at).not.toBeNull();
      const tasks = await t.db.tasks.where("section_id").equals(morning.id).toArray();
      expect(tasks.every((x) => x.deleted_at !== null && x._dirty === 1)).toBe(true);
      expect(await sectionNames(normal.id)).not.toContain("Morning");
    });
  });

  describe("Day Plans", () => {
    it("creates, renames and describes a plan", async () => {
      const created = await createPlan(t.ctx, { name: "  Holiday  " });
      const id = created.ok ? created.value.planId : "";
      expect((await t.db.day_plans.get(id))?.name).toBe("Holiday");
      await renamePlan(t.ctx, { planId: id, name: "Beach" });
      await setPlanDescription(t.ctx, { planId: id, description: "Sun." });
      expect(await t.db.day_plans.get(id)).toMatchObject({ name: "Beach", description: "Sun." });
      expect((await createPlan(t.ctx, { name: "" })).ok).toBe(false);
    });

    it("make primary swaps the primary; survival plans can't be primary", async () => {
      const travelling = await planByName("Travelling");
      await makePrimary(t.ctx, { planId: travelling.id });
      const plans = await t.db.day_plans.toArray();
      expect(plans.filter((p) => p.kind === "primary").map((p) => p.name)).toEqual(["Travelling"]);
      expect(plans.find((p) => p.name === "Normal")?.kind).toBe("custom");
      const bad = await planByName("Bad day");
      const refused = await makePrimary(t.ctx, { planId: bad.id });
      expect(refused.ok ? null : refused.error.code).toBe("RR-VAL-008");
    });

    it("survival membership takes a free level and refuses when all three are taken", async () => {
      const travelling = await planByName("Travelling");
      const full = await setSurvivalMembership(t.ctx, { planId: travelling.id, on: true });
      expect(full.ok ? null : full.error.code).toBe("RR-VAL-009");
      const zero = await planByName("Zero energy");
      await setSurvivalMembership(t.ctx, { planId: zero.id, on: false });
      expect((await t.db.day_plans.get(zero.id))?.kind).toBe("custom");
      const joined = await setSurvivalMembership(t.ctx, { planId: travelling.id, on: true });
      expect(joined.ok && joined.value.level).toBe(3);
      const normal = await planByName("Normal");
      const primary = await setSurvivalMembership(t.ctx, { planId: normal.id, on: true });
      expect(primary.ok ? null : primary.error.code).toBe("RR-VAL-005");
    });

    it("duplicates a plan with copies of its sections and tasks, as a regular plan", async () => {
      const bad = await planByName("Bad day");
      const result = await duplicatePlan(t.ctx, { planId: bad.id });
      const id = result.ok ? result.value.planId : "";
      const copy = await t.db.day_plans.get(id);
      expect(copy).toMatchObject({ name: "Bad day copy", kind: "custom", survival_level: null });
      expect(await sectionNames(id)).toEqual(await sectionNames(bad.id));
      const original = await sectionIn("Bad day", "Morning");
      const copied = await sectionIn("Bad day copy", "Morning");
      expect(copied.id).not.toBe(original.id);
      expect(await t.db.tasks.where("section_id").equals(copied.id).count()).toBe(3);
    });

    it("reorders plans", async () => {
      const zero = await planByName("Zero energy");
      await reorderPlan(t.ctx, { planId: zero.id, afterPlanId: null });
      const ordered = (await t.db.day_plans.toArray()).sort(compareRank);
      expect(ordered[0]?.name).toBe("Zero energy");
    });

    it("the primary plan can't be archived or deleted (RR-VAL-005)", async () => {
      const normal = await planByName("Normal");
      for (const result of [
        await archivePlan(t.ctx, { planId: normal.id }),
        await deletePlan(t.ctx, { planId: normal.id }),
      ]) {
        expect(result.ok ? null : result.error.code).toBe("RR-VAL-005");
      }
    });

    it("archive and restore; a survival plan whose level was taken returns as regular", async () => {
      const bad = await planByName("Bad day");
      await archivePlan(t.ctx, { planId: bad.id });
      expect((await t.db.day_plans.get(bad.id))?.archived_at).not.toBeNull();
      const travelling = await planByName("Travelling");
      await setSurvivalMembership(t.ctx, { planId: travelling.id, on: true });
      expect((await t.db.day_plans.get(travelling.id))?.survival_level).toBe(2);
      await restorePlan(t.ctx, { planId: bad.id });
      expect(await t.db.day_plans.get(bad.id)).toMatchObject({
        archived_at: null,
        kind: "custom",
        survival_level: null,
      });
    });

    it("delete keeps sections shared with other plans, deletes the rest", async () => {
      const travelling = await planByName("Travelling");
      const morning = await sectionIn("Normal", "Morning");
      await linkSection(t.ctx, travelling.id, morning.id);
      const before = await sectionIn("Travelling", "Before leaving");
      await deletePlan(t.ctx, { planId: travelling.id });
      expect((await t.db.day_plans.get(travelling.id))?.deleted_at).not.toBeNull();
      expect((await t.db.sections.get(morning.id))?.deleted_at).toBeNull();
      expect((await t.db.sections.get(before.id))?.deleted_at).not.toBeNull();
    });
  });
});
