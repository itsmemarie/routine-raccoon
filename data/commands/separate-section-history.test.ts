import { bootstrapDatabase } from "@/data/bootstrap";
import { SyncEngine } from "@/data/sync/engine";
import { MemoryGateway } from "@/data/sync/memory-gateway";
import { sectionRows } from "@/domain/organise";
import { buildProgress, type ProgressView } from "@/domain/progress";
import { compareRank } from "@/domain/rank";
import { recursOn } from "@/domain/recurrence";
import { addDays } from "@/domain/time";
import { anchorOf } from "@/domain/today";
import { testContext } from "@/tests/db";
import { pickPlan, pickSurvivalLevel, skipTaskToday, tickTask, toggleStep } from "./day";
import { makePrimary } from "./plans";
import { linkSection } from "./rows";
import { separateSectionInPlan } from "./sections";
import { currentDayKey, readOrganisation, readSettings } from "./shared";
import { removeTaskFromPlan } from "./tasks";

const ONE_DAY = 24 * 60 * 60 * 1000;

/**
 * Progress rebuilds every past day from the tasks its plan holds now, so "Separate from other Day
 * Plans" must hand the copies that plan's history. Each day ran exactly one plan, so each day's
 * ticks have exactly one right home.
 * @see docs/handoff/README.md "Sections"
 */
describe("separating a section keeps the plan's history", () => {
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

  async function sectionIn(planName: string, name: string) {
    const plan = await planNamed(planName);
    const row = sectionRows(await readOrganisation(t.ctx), plan.id).find(
      (r) => r.section.name === name,
    );
    if (!row) throw new Error(`no section ${name} in ${planName}`);
    return row.section;
  }

  async function tasksOf(sectionId: string) {
    const rows = await t.db.tasks.where("section_id").equals(sectionId).toArray();
    return rows.filter((r) => r.deleted_at === null).sort(compareRank);
  }

  async function firstTaskOf(sectionId: string) {
    const [first] = await tasksOf(sectionId);
    if (!first) throw new Error("empty section");
    return first;
  }

  async function occurrencesOf(taskId: string) {
    const rows = await t.db.task_occurrences.where("task_id").equals(taskId).toArray();
    return rows.filter((o) => o.deleted_at === null);
  }

  /** Shares `sectionName` of Normal with `planName`, starting on the seed day. */
  async function share(sectionName: string, planName: string) {
    const section = await sectionIn("Normal", sectionName);
    const other = await planNamed(planName);
    await linkSection(t.ctx, other.id, section.id);
    return { section, other, normal: await planNamed("Normal") };
  }

  const nextDay = async () => {
    t.advance(ONE_DAY);
    return currentDayKey(t.ctx);
  };

  async function progress(): Promise<ProgressView> {
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

  /** What the Progress screen shows, without the ids that a copy is meant to change. */
  async function screen() {
    const view = await progress();
    return {
      cells: view.cells,
      tickedThisMonth: view.tickedThisMonth,
      showedUp: view.showedUp,
      fullDays: view.fullDays,
      survivalDays: view.survivalDays,
      habits: view.habits
        .map((h) => [h.task.name, h.done, h.scheduled])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      time: view.timeBySection.map((s) => [s.section.name, s.minutes]),
      avoided: view.avoided
        .map((a) => [a.task.name, a.run])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    };
  }

  async function tickAll(sectionId: string, dayKey: string) {
    for (const task of await tasksOf(sectionId)) {
      expect((await tickTask(t.ctx, { taskId: task.id, dayKey })).ok).toBe(true);
    }
  }

  it("leaves every past day of that plan exactly as it was", async () => {
    const { section, normal } = await share("Morning", "Travelling");
    const first = await currentDayKey(t.ctx);
    await tickAll(section.id, first);
    const second = await nextDay();
    const pint = await firstTaskOf(section.id);
    await tickTask(t.ctx, { taskId: pint.id, dayKey: second });
    await nextDay();
    const before = await screen();
    expect(before.tickedThisMonth).toBe(4);

    const result = await separateSectionInPlan(t.ctx, {
      sectionId: section.id,
      planId: normal.id,
    });

    expect(result.ok).toBe(true);
    expect(await screen()).toEqual(before);
  });

  it("keeps a fully ticked day cleared", async () => {
    const { section, normal } = await share("Morning", "Travelling");
    const first = await currentDayKey(t.ctx);
    const plan = sectionRows(await readOrganisation(t.ctx), normal.id);
    for (const row of plan) await tickAll(row.section.id, first);
    await nextDay();
    const cleared = async () => (await progress()).cells.find((c) => c.dayKey === first);
    const before = await cleared();
    expect(before).toMatchObject({ state: "full", ticked: 8, total: 8 });

    await separateSectionInPlan(t.ctx, { sectionId: section.id, planId: normal.id });

    expect(await cleared()).toEqual(before);
    expect((await progress()).showedUp).toBe(1);
  });

  it("gives each plan the days it ran, whichever plan is separated", async () => {
    const { section, other } = await share("Morning", "Travelling");
    const normalDay = await currentDayKey(t.ctx);
    await tickAll(section.id, normalDay);
    const travelDay = await nextDay();
    await pickPlan(t.ctx, { dayKey: travelDay, planId: other.id });
    await tickAll(section.id, travelDay);
    await nextDay();
    const before = await screen();
    const originals = await tasksOf(section.id);

    await separateSectionInPlan(t.ctx, { sectionId: section.id, planId: other.id });

    expect((await screen()).cells).toEqual(before.cells);
    const copies = await tasksOf((await sectionIn("Travelling", "Morning")).id);
    for (const [index, original] of originals.entries()) {
      const stayed = await occurrencesOf(original.id);
      const moved = await occurrencesOf(copies[index]?.id ?? "");
      expect(stayed.map((o) => o.day_key)).toEqual([normalDay]);
      expect(moved.map((o) => o.day_key)).toEqual([travelDay]);
    }
  });

  it("leaves history alone when none of the days ran that plan", async () => {
    const { section, other } = await share("Morning", "Travelling");
    const day = await currentDayKey(t.ctx);
    await tickAll(section.id, day);
    await nextDay();
    const before = await t.db.task_occurrences.toArray();
    const shownBefore = await screen();

    await separateSectionInPlan(t.ctx, { sectionId: section.id, planId: other.id });

    expect(await t.db.task_occurrences.toArray()).toEqual(before);
    expect((await screen()).cells).toEqual(shownBefore.cells);
  });

  it("follows Survival Mode days to the survival plan", async () => {
    const { section, other } = await share("Morning", "Bad day");
    const normalDay = await currentDayKey(t.ctx);
    const pint = await firstTaskOf(section.id);
    await tickTask(t.ctx, { taskId: pint.id, dayKey: normalDay });
    const badDay = await nextDay();
    await pickSurvivalLevel(t.ctx, { dayKey: badDay, level: 2 });
    await tickTask(t.ctx, { taskId: pint.id, dayKey: badDay });
    await nextDay();
    const before = await screen();
    const sectionsOfBadDay = async () =>
      sectionRows(await readOrganisation(t.ctx), other.id).map((row) => row.section);
    // Bad day has a Morning of its own already, so the copy can't be found by name.
    const existing = (await sectionsOfBadDay()).map((s) => s.id);

    await separateSectionInPlan(t.ctx, { sectionId: section.id, planId: other.id });

    expect((await screen()).cells).toEqual(before.cells);
    expect((await occurrencesOf(pint.id)).map((o) => o.day_key)).toEqual([normalDay]);
    const survivalCopy = (await sectionsOfBadDay()).find((s) => !existing.includes(s.id));
    const moved = await occurrencesOf((await firstTaskOf(survivalCopy?.id ?? "")).id);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ day_key: badDay, survival_level_at_completion: 2 });
  });

  it("carries everything a past day recorded, step ticks included", async () => {
    const { section, normal } = await share("Smash it", "Travelling");
    const day = await currentDayKey(t.ctx);
    const task = await firstTaskOf(section.id);
    const [step] = task.steps;
    await toggleStep(t.ctx, {
      taskId: task.id,
      dayKey: day,
      stepId: step?.id ?? "",
      checked: true,
    });
    await tickTask(t.ctx, { taskId: task.id, dayKey: day });
    const [source] = await occurrencesOf(task.id);
    await nextDay();

    await separateSectionInPlan(t.ctx, { sectionId: section.id, planId: normal.id });

    const copy = await firstTaskOf((await sectionIn("Normal", "Smash it")).id);
    const [moved] = await occurrencesOf(copy.id);
    expect(moved).toMatchObject({
      day_key: day,
      status: "done",
      completed_at: source?.completed_at,
      minutes_credited: source?.minutes_credited,
      checked_step_ids: [copy.steps[0]?.id],
    });
    expect(copy.steps[0]?.id).not.toBe(step?.id);
  });

  it('keeps "Avoiding this" counting the same run of skipped days', async () => {
    const { section, normal } = await share("Morning", "Travelling");
    const task = await firstTaskOf(section.id);
    for (let day = 0; day < 5; day++) {
      await skipTaskToday(t.ctx, { taskId: task.id, dayKey: await currentDayKey(t.ctx) });
      await nextDay();
    }
    const before = await screen();
    expect(before.avoided).toContainEqual([task.name, 5]);

    await separateSectionInPlan(t.ctx, { sectionId: section.id, planId: normal.id });

    expect((await screen()).avoided).toEqual(before.avoided);
  });

  it("goes by the plan that was primary on the day, not the one primary now", async () => {
    const { section, normal, other } = await share("Morning", "Travelling");
    const ranNormal = await currentDayKey(t.ctx);
    await tickAll(section.id, ranNormal);
    await nextDay();
    await makePrimary(t.ctx, { planId: other.id });
    await nextDay();
    const before = await screen();
    const originals = await tasksOf(section.id);

    await separateSectionInPlan(t.ctx, { sectionId: section.id, planId: normal.id });

    expect((await screen()).cells).toEqual(before.cells);
    const copies = await tasksOf((await sectionIn("Normal", "Morning")).id);
    for (const [index, original] of originals.entries()) {
      expect(await occurrencesOf(original.id)).toEqual([]);
      const moved = await occurrencesOf(copies[index]?.id ?? "");
      expect(moved.map((o) => o.day_key)).toEqual([ranNormal]);
    }
  });

  it("leaves each day with one record per task, and revives nothing deleted", async () => {
    const { section, normal } = await share("Morning", "Travelling");
    const day = await currentDayKey(t.ctx);
    await tickAll(section.id, day);
    const pint = await firstTaskOf(section.id);
    const [cancelled] = await occurrencesOf(pint.id);
    await t.db.task_occurrences.update(cancelled?.id ?? "", { deleted_at: "2026-09-08T09:00:00Z" });
    await nextDay();

    await separateSectionInPlan(t.ctx, { sectionId: section.id, planId: normal.id });

    const live = (await t.db.task_occurrences.toArray()).filter((o) => o.deleted_at === null);
    expect(new Set(live.map((o) => `${o.task_id}|${o.day_key}`)).size).toBe(live.length);
    expect(await occurrencesOf(pint.id)).toEqual([]);
    const copy = await firstTaskOf((await sectionIn("Normal", "Morning")).id);
    expect(await occurrencesOf(copy.id)).toEqual([]);
  });

  it("leaves a task removed from the plan out, with its history where it was", async () => {
    const { section, normal } = await share("Morning", "Travelling");
    const day = await currentDayKey(t.ctx);
    await tickAll(section.id, day);
    const removed = await firstTaskOf(section.id);
    await removeTaskFromPlan(t.ctx, { taskId: removed.id, planId: normal.id });
    await nextDay();

    await separateSectionInPlan(t.ctx, { sectionId: section.id, planId: normal.id });

    expect((await occurrencesOf(removed.id)).map((o) => o.day_key)).toEqual([day]);
    const names = (await tasksOf((await sectionIn("Normal", "Morning")).id)).map((x) => x.name);
    expect(names).not.toContain(removed.name);
  });

  it("keeps recurring tasks on the same days, past and future", async () => {
    const { section, normal } = await share("Evening", "Travelling");
    const originals = await tasksOf(section.id);
    expect(originals.some((x) => x.recurrence?.n === 2)).toBe(true);
    // Far enough on that a clock restarted today would land in the other fortnight.
    t.advance(9 * ONE_DAY);

    await separateSectionInPlan(t.ctx, { sectionId: section.id, planId: normal.id });

    const copy = await sectionIn("Normal", "Evening");
    expect(copy.created_at).toBe(section.created_at);
    const copies = await tasksOf(copy.id);
    const start = await currentDayKey(t.ctx);
    for (const [index, original] of originals.entries()) {
      const twin = copies[index];
      if (!twin) throw new Error(`no copy of ${original.name}`);
      expect(twin.created_at).toBe(original.created_at);
      for (let offset = -9; offset < 30; offset++) {
        const day = addDays(start, offset);
        expect(recursOn(twin.recurrence, day, anchorOf(twin))).toBe(
          recursOn(original.recurrence, day, anchorOf(original)),
        );
      }
    }
  });

  it("syncs the move: nothing breaks one-record-per-day on the server", async () => {
    const { section, normal } = await share("Morning", "Travelling");
    const day = await currentDayKey(t.ctx);
    await tickAll(section.id, day);
    const server = new MemoryGateway();
    const engine = new SyncEngine({
      db: t.db,
      gateway: server,
      retry: { sleep: () => Promise.resolve(), attempts: 3 },
      now: t.ctx.now,
    });
    expect((await engine.sync()).ok).toBe(true);
    await nextDay();

    await separateSectionInPlan(t.ctx, { sectionId: section.id, planId: normal.id });

    expect((await engine.sync()).ok).toBe(true);
    const copies = await tasksOf((await sectionIn("Normal", "Morning")).id);
    const originals = await tasksOf(section.id);
    const live = server.rows("task_occurrences").filter((o) => o.deleted_at === null);
    expect(live.map((o) => String(o.task_id)).sort()).toEqual(copies.map((c) => c.id).sort());
    const gone = server.rows("task_occurrences").filter((o) => o.deleted_at !== null);
    expect(gone.map((o) => String(o.task_id)).sort()).toEqual(originals.map((o) => o.id).sort());
  });
});
