import { bootstrapDatabase } from "@/data/bootstrap";
import { compareRank } from "@/domain/rank";
import { testContext } from "@/tests/db";
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
import {
  archiveSection,
  createSection,
  deleteSection,
  duplicateSection,
  linkSectionToPlan,
  moveSectionToPlan,
  removeSectionFromPlan,
  reorderSection,
  restoreSection,
  updateSection,
  type SectionDraft,
} from "./sections";

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
    const links = await t.db.plan_sections.where("plan_id").equals(plan.id).toArray();
    const sections = await t.db.sections.bulkGet(links.map((l) => l.section_id));
    const found = sections.find((s) => s?.name === name && s.deleted_at === null);
    if (!found) throw new Error(`no ${name}`);
    return found;
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

    it("copy to Day Plan links the same section (edits show everywhere)", async () => {
      const travelling = await planByName("Travelling");
      const morning = await sectionIn("Normal", "Morning");
      const first = await linkSectionToPlan(t.ctx, {
        sectionId: morning.id,
        planId: travelling.id,
      });
      expect(first.ok && first.value.alreadyThere).toBe(false);
      expect(await sectionNames(travelling.id)).toContain("Morning");
      const again = await linkSectionToPlan(t.ctx, {
        sectionId: morning.id,
        planId: travelling.id,
      });
      expect(again.ok && again.value.alreadyThere).toBe(true);
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
      await linkSectionToPlan(t.ctx, { sectionId: morning.id, planId: travelling.id });
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
      await linkSectionToPlan(t.ctx, { sectionId: morning.id, planId: travelling.id });
      const before = await sectionIn("Travelling", "Before leaving");
      await deletePlan(t.ctx, { planId: travelling.id });
      expect((await t.db.day_plans.get(travelling.id))?.deleted_at).not.toBeNull();
      expect((await t.db.sections.get(morning.id))?.deleted_at).toBeNull();
      expect((await t.db.sections.get(before.id))?.deleted_at).not.toBeNull();
    });
  });
});
