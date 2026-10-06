import { dayRecord, link, occurrence, plan, section, settings, task } from "@/tests/factories";
import { carryOverTaskIds, effectiveDayKey, isLaterDay, nextDayRecordPatch } from "./day";
import type { DayInput } from "./today";

const YESTERDAY = "2026-09-07";
const TODAY = "2026-09-08";

describe("effectiveDayKey", () => {
  it("is the calendar day until it is closed, then the next day", () => {
    expect(effectiveDayKey(TODAY, false)).toBe(TODAY);
    expect(effectiveDayKey(TODAY, true)).toBe("2026-09-09");
    expect(effectiveDayKey("2026-12-31", true)).toBe("2027-01-01");
  });
});

describe("nextDayRecordPatch", () => {
  it("keeps Survival Mode overnight only when the setting is on", () => {
    const yesterday = { survival_on: true, survival_level: 3 as const };
    expect(nextDayRecordPatch(yesterday, { keepSurvivalOvernight: false })).toBeNull();
    expect(nextDayRecordPatch(yesterday, { keepSurvivalOvernight: true })).toEqual({
      survival_on: true,
      survival_level: 3,
      plan_id: null,
    });
    expect(
      nextDayRecordPatch(
        { survival_on: false, survival_level: 2 },
        { keepSurvivalOvernight: true },
      ),
    ).toBeNull();
    expect(nextDayRecordPatch(null, { keepSurvivalOvernight: true })).toBeNull();
  });
});

describe("isLaterDay", () => {
  it("only moves forward", () => {
    expect(isLaterDay(YESTERDAY, TODAY)).toBe(true);
    expect(isLaterDay(TODAY, TODAY)).toBe(false);
    expect(isLaterDay(TODAY, YESTERDAY)).toBe(false);
  });
});

describe("carryOverTaskIds", () => {
  function world() {
    const normal = plan({ kind: "primary" });
    const morning = section({ name: "Morning" });
    const daily = task({ section_id: morning.id, name: "Daily", rank: "a0" });
    // Monday only; YESTERDAY is a Monday, TODAY a Tuesday.
    const monday = task({
      section_id: morning.id,
      name: "Monday thing",
      rank: "a1",
      created_at: "2026-08-31T08:00:00.000Z",
      recurrence: { kind: "custom", days: [0], n: 1, per: "week", ends: "never" },
    });
    const done = task({
      section_id: morning.id,
      name: "Done Monday",
      rank: "a2",
      created_at: "2026-08-31T08:00:00.000Z",
      recurrence: { kind: "custom", days: [0], n: 1, per: "week", ends: "never" },
    });
    const skipped = task({
      section_id: morning.id,
      name: "Skipped Monday",
      rank: "a3",
      created_at: "2026-08-31T08:00:00.000Z",
      recurrence: { kind: "custom", days: [0], n: 1, per: "week", ends: "never" },
    });
    const base = {
      plans: [normal],
      planSections: [link(normal.id, morning.id)],
      sections: [morning],
      tasks: [daily, monday, done, skipped],
      dayRecord: null,
      settings: settings(),
    };
    const previous: DayInput = {
      ...base,
      dayKey: YESTERDAY,
      occurrences: [
        occurrence({ task_id: done.id, day_key: YESTERDAY }),
        occurrence({
          task_id: skipped.id,
          day_key: YESTERDAY,
          status: "skipped",
          completed_at: null,
        }),
      ],
    };
    const next: DayInput = { ...base, dayKey: TODAY, occurrences: [] };
    return { previous, next, monday, daily };
  }

  it("carries open tasks that aren't already on the next day; not done or skipped ones", () => {
    const { previous, next, monday } = world();
    expect(carryOverTaskIds(previous, next)).toEqual([monday.id]);
  });

  it("uses the plan that was active the previous day", () => {
    const { previous, next } = world();
    const record = dayRecord({ day_key: YESTERDAY, survival_on: true, survival_level: 2 });
    expect(carryOverTaskIds({ ...previous, dayRecord: record }, next)).toEqual([]);
  });
});
