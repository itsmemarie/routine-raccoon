import { bootstrapDatabase } from "@/data/bootstrap";
import { readKv, writeKv } from "@/data/db/kv";
import { occurrenceId } from "@/domain/ids";
import { testContext } from "@/tests/db";
import {
  closeDay,
  dismissDayPrompt,
  pickSurvivalLevel,
  rolloverDay,
  setSurvivalMode,
  tickTask,
  toggleStep,
} from "./day";
import { updateSettings } from "./settings";
import { currentDayKey } from "./shared";
import { markTimerAlerted, startTimer, stopTimer } from "./timer";

// The test clock starts at 2026-09-08T07:41Z = 09:41 in Berlin (vitest pins TZ).
const DAY = "2026-09-08";
const NEXT = "2026-09-09";

describe("day lifecycle commands", () => {
  let t: ReturnType<typeof testContext>;
  beforeEach(async () => {
    t = testContext();
    expect((await bootstrapDatabase({ seedDemo: true, ctx: t.ctx })).ok).toBe(true);
  });
  afterEach(async () => {
    await t.close();
  });

  async function taskByName(name: string) {
    const found = (await t.db.tasks.toArray()).find((x) => x.name === name);
    if (!found) throw new Error(name);
    return found;
  }

  it("toggleStep ticks steps for the day only, without completing the task", async () => {
    const dinner = await taskByName("Prepare dinner");
    for (const step of dinner.steps) {
      await toggleStep(t.ctx, { taskId: dinner.id, dayKey: DAY, stepId: step.id, checked: true });
    }
    const occurrence = await t.db.task_occurrences.get(occurrenceId(dinner.id, DAY));
    expect(occurrence?.checked_step_ids).toHaveLength(dinner.steps.length);
    expect(occurrence?.status).toBe("pending");
    const first = dinner.steps[0]?.id ?? "";
    await toggleStep(t.ctx, { taskId: dinner.id, dayKey: DAY, stepId: first, checked: false });
    expect(
      (await t.db.task_occurrences.get(occurrenceId(dinner.id, DAY)))?.checked_step_ids,
    ).not.toContain(first);
  });

  it("reuses an occurrence written by the retired app under a random id", async () => {
    const pint = await taskByName("Drink a pint");
    const legacyId = "7a0e6a1c-2b1d-4c55-9d8e-0c4c8f3b2a11";
    await t.db.task_occurrences.add({
      id: legacyId,
      task_id: pint.id,
      day_key: DAY,
      status: "pending",
      completed_at: null,
      checked_step_ids: [],
      minutes_credited: null,
      survival_level_at_completion: null,
      carried_from_day_key: null,
      created_at: "2026-09-08T05:00:00.000Z",
      updated_at: "2026-09-08T05:00:00.000Z",
      deleted_at: null,
      _dirty: 0,
    });
    const result = await tickTask(t.ctx, { taskId: pint.id, dayKey: DAY });
    expect(result.ok && result.value.occurrenceId).toBe(legacyId);
    expect(await t.db.task_occurrences.where("task_id").equals(pint.id).count()).toBe(1);
  });

  it("revives a tombstoned occurrence when ticked again", async () => {
    const pint = await taskByName("Drink a pint");
    await tickTask(t.ctx, { taskId: pint.id, dayKey: DAY });
    await t.db.task_occurrences.update(occurrenceId(pint.id, DAY), { deleted_at: "x" });
    await tickTask(t.ctx, { taskId: pint.id, dayKey: DAY });
    expect((await t.db.task_occurrences.get(occurrenceId(pint.id, DAY)))?.deleted_at).toBeNull();
  });

  it("setSurvivalMode on uses the default level; off returns to the regular plan", async () => {
    await updateSettings(t.ctx, { defaultLevel: 3 });
    await setSurvivalMode(t.ctx, { dayKey: DAY, on: true });
    expect(await t.db.day_records.get(DAY)).toMatchObject({ survival_on: true, survival_level: 3 });
    await setSurvivalMode(t.ctx, { dayKey: DAY, on: false });
    expect((await t.db.day_records.get(DAY))?.survival_on).toBe(false);
    const titles = (await t.db.log_entries.where("kind").equals("survival").toArray()).map(
      (l) => l.title,
    );
    expect(titles).toEqual(["Survival Mode: Zero energy", "Switched to Normal"]);
    const noop = await setSurvivalMode(t.ctx, { dayKey: DAY, on: false });
    expect(noop.ok).toBe(true);
  });

  it("closeDay logs 'n of m ticked' and moves the app to the next day", async () => {
    const pint = await taskByName("Drink a pint");
    await tickTask(t.ctx, { taskId: pint.id, dayKey: DAY });
    expect(await currentDayKey(t.ctx)).toBe(DAY);
    const result = await closeDay(t.ctx, { dayKey: DAY });
    expect(result.ok && result.value).toEqual({ ticked: 1, total: 8 });
    expect((await t.db.day_records.get(DAY))?.closed_at).not.toBeNull();
    expect(await currentDayKey(t.ctx)).toBe(NEXT);
    const entry = await t.db.log_entries.where("kind").equals("closed").first();
    expect(entry).toMatchObject({ title: "Closed the day", meta: "1 of 8 ticked" });
  });

  describe("rolloverDay", () => {
    it("records the first day and does nothing else", async () => {
      const result = await rolloverDay(t.ctx, { toDayKey: DAY });
      expect(result.ok && result.value).toEqual({ from: null, carried: 0 });
      expect(await readKv(t.db, "last_day_key")).toBe(DAY);
      const again = await rolloverDay(t.ctx, { toDayKey: DAY });
      expect(again.ok && again.value.carried).toBe(0);
    });

    it("drops Survival Mode overnight by default, keeps it when asked", async () => {
      await rolloverDay(t.ctx, { toDayKey: DAY });
      await pickSurvivalLevel(t.ctx, { dayKey: DAY, level: 2 });
      await rolloverDay(t.ctx, { toDayKey: NEXT });
      expect(await t.db.day_records.get(NEXT)).toBeUndefined();

      await writeKv(t.db, "last_day_key", DAY);
      await updateSettings(t.ctx, { keepSurvivalOvernight: true });
      await rolloverDay(t.ctx, { toDayKey: NEXT });
      expect(await t.db.day_records.get(NEXT)).toMatchObject({
        survival_on: true,
        survival_level: 2,
        plan_id: null,
      });
    });

    it("carries yesterday's open tasks when roll is on, once, and only from the day before", async () => {
      await rolloverDay(t.ctx, { toDayKey: DAY });
      await updateSettings(t.ctx, { roll: true });
      // Tuesday 8 Sep → Wednesday 9 Sep. "Smash it" runs on weekdays, so its tasks are on both
      // days already; "Send the imperfect message" too. Nothing that recurs daily is carried.
      const identify = await taskByName("Identify the avoided task");
      await t.db.tasks.update(identify.id, {
        recurrence: { kind: "custom", days: [1], n: 1, per: "week", ends: "never" },
        created_at: "2026-09-01T08:00:00.000Z",
      });
      const result = await rolloverDay(t.ctx, { toDayKey: NEXT });
      expect(result.ok && result.value.carried).toBe(1);
      expect(await t.db.task_occurrences.get(occurrenceId(identify.id, NEXT))).toMatchObject({
        status: "pending",
        carried_from_day_key: DAY,
      });

      await writeKv(t.db, "last_day_key", DAY);
      const twice = await rolloverDay(t.ctx, { toDayKey: NEXT });
      expect(twice.ok && twice.value.carried).toBe(0);

      await writeKv(t.db, "last_day_key", "2026-09-01");
      const gap = await rolloverDay(t.ctx, { toDayKey: NEXT });
      expect(gap.ok && gap.value.carried).toBe(0);
    });

    it("ignores a clock that went backwards", async () => {
      await rolloverDay(t.ctx, { toDayKey: NEXT });
      const back = await rolloverDay(t.ctx, { toDayKey: DAY });
      expect(back.ok && back.value).toEqual({ from: NEXT, carried: 0 });
    });
  });

  it("dismissDayPrompt is device-only", async () => {
    await dismissDayPrompt(t.ctx, { dayKey: DAY });
    expect(await readKv(t.db, "day_prompt_dismissed")).toBe(DAY);
  });
});

describe("settings and timer commands", () => {
  let t: ReturnType<typeof testContext>;
  beforeEach(async () => {
    t = testContext();
    expect((await bootstrapDatabase({ seedDemo: true, ctx: t.ctx })).ok).toBe(true);
  });
  afterEach(async () => {
    await t.close();
  });

  it("updates settings, logs reset time and name changes, marks the row dirty", async () => {
    const result = await updateSettings(t.ctx, { resetAt: "02:00", survivalName: " Nope Day " });
    expect(result.ok && result.value).toMatchObject({ resetAt: "02:00", survivalName: "Nope Day" });
    expect((await t.db.user_settings.get("me"))?._dirty).toBe(1);
    const titles = (await t.db.log_entries.where("kind").equals("edited").toArray()).map(
      (l) => l.title,
    );
    expect(titles).toContain("Day reset time set to 2:00 AM");
    expect(titles).toContain("Renamed Survival Mode");
  });

  it.each([
    [{ resetAt: "24:00" }, "RR-VAL-004"],
    [{ survivalName: "  " }, "RR-VAL-001"],
    [{ longAt: 0 }, "RR-VAL-002"],
  ])("rejects %o with %s", async (patch, code) => {
    const result = await updateSettings(t.ctx, patch);
    expect(result.ok ? null : result.error.code).toBe(code);
  });

  it("keeps legacy settings values when updating one key", async () => {
    await t.db.user_settings.update("me", {
      settings: { extraSupportThresholdMinutes: 45 } as never,
    });
    await updateSettings(t.ctx, { roll: true });
    expect((await t.db.user_settings.get("me"))?.settings).toMatchObject({
      longAt: 45,
      roll: true,
    });
  });

  it("starts a timer at the shown minutes, replaces it, marks it alerted, stops it", async () => {
    const tasks = await t.db.tasks.toArray();
    const eat = tasks.find((x) => x.name === "Eat something");
    const pint = tasks.find((x) => x.name === "Drink a pint");
    const first = await startTimer(t.ctx, { taskId: eat?.id ?? "", dayKey: DAY });
    expect(first.ok && first.value.timer).toMatchObject({
      minutes: 20,
      endsAt: "2026-09-08T08:01:00.000Z",
      alerted: false,
    });
    const second = await startTimer(t.ctx, { taskId: pint?.id ?? "", dayKey: DAY });
    expect(second.ok && second.value.replaced?.taskName).toBe("Eat something");
    await markTimerAlerted(t.ctx);
    expect((await readKv(t.db, "timer"))?.alerted).toBe(true);
    await stopTimer(t.ctx);
    expect(await readKv(t.db, "timer")).toBeNull();
    await markTimerAlerted(t.ctx);
    expect(await readKv(t.db, "timer")).toBeNull();
  });

  it("times the smaller version in Survival Mode", async () => {
    await pickSurvivalLevel(t.ctx, { dayKey: DAY, level: 2 });
    const eat = (await t.db.tasks.toArray()).find((x) => x.name === "Eat something");
    const result = await startTimer(t.ctx, { taskId: eat?.id ?? "", dayKey: DAY });
    expect(result.ok && result.value.timer.minutes).toBe(5);
  });

  it("reads a corrupt kv value as absent", async () => {
    await t.db.kv.put({ key: "timer", value: { nonsense: true } });
    expect(await readKv(t.db, "timer")).toBeNull();
  });
});
