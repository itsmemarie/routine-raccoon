import { dayRecord, link, occurrence, plan, section, settings, task } from "@/tests/factories";
import { addDays } from "./time";
import {
  buildProgress,
  dayFactsReader,
  monthStart,
  shiftMonth,
  skipRun,
  skipRunLabel,
  type ProgressInput,
} from "./progress";
import type { Occurrence } from "./types";

// Today = Tuesday 8 Sep 2026. Two daily tasks, created at the start of August.
const TODAY = "2026-09-08";
const CREATED = "2026-08-01T08:00:00.000Z";

function world(occurrences: Occurrence[], extra: Partial<ProgressInput> = {}): ProgressInput {
  const normal = plan({ kind: "primary", created_at: CREATED });
  const bad = plan({ name: "Bad day", kind: "survival", survival_level: 2, rank: "a1" });
  const morning = section({ id: "00000000-0000-4000-8000-0000000000a1", created_at: CREATED });
  const rest = section({
    id: "00000000-0000-4000-8000-0000000000a2",
    name: "Rest",
    created_at: CREATED,
  });
  const pint = task({
    id: "00000000-0000-4000-8000-0000000000b1",
    section_id: morning.id,
    name: "Pint",
    minutes: 2,
    created_at: CREATED,
  });
  const walk = task({
    id: "00000000-0000-4000-8000-0000000000b2",
    section_id: morning.id,
    name: "Walk",
    minutes: 20,
    rank: "a1",
    created_at: CREATED,
  });
  const sleep = task({
    id: "00000000-0000-4000-8000-0000000000b3",
    section_id: rest.id,
    name: "Sleep",
    minutes: 10,
    created_at: CREATED,
  });
  return {
    month: TODAY,
    today: TODAY,
    definitions: {
      plans: [normal, bad],
      planSections: [link(normal.id, morning.id), link(bad.id, rest.id)],
      sections: [morning, rest],
      tasks: [pint, walk, sleep],
    },
    occurrences,
    dayRecords: [],
    settings: settings(),
    ...extra,
  };
}

const PINT = "00000000-0000-4000-8000-0000000000b1";
const WALK = "00000000-0000-4000-8000-0000000000b2";
const SLEEP = "00000000-0000-4000-8000-0000000000b3";

function done(taskId: string, day: string, minutes: number | null = null) {
  return occurrence({ task_id: taskId, day_key: day, minutes_credited: minutes });
}
function skipped(taskId: string, day: string) {
  return occurrence({ task_id: taskId, day_key: day, status: "skipped", completed_at: null });
}

describe("buildProgress", () => {
  it("lays out the month from Monday with future days marked", () => {
    const view = buildProgress(world([]));
    expect(view.monthLabel).toBe("Sep 2026");
    expect(view.leadingBlanks).toBe(1); // 1 Sep 2026 is a Tuesday
    expect(view.cells).toHaveLength(30);
    expect(view.cells[7]?.state).toBe("today");
    expect(view.cells[8]?.state).toBe("future");
  });

  it("classifies days: full, survival, partial, empty; and counts showed up / full days", () => {
    const view = buildProgress(
      world(
        [
          done(PINT, "2026-09-01", 2),
          done(WALK, "2026-09-01", 20),
          done(PINT, "2026-09-02"),
          done(SLEEP, "2026-09-03", 5),
          done(PINT, TODAY),
          done(WALK, TODAY),
        ],
        {
          dayRecords: [dayRecord({ day_key: "2026-09-03", survival_on: true, survival_level: 2 })],
        },
      ),
    );
    const state = (day: number) => view.cells[day - 1]?.state;
    expect(state(1)).toBe("full");
    expect(state(2)).toBe("partial");
    expect(state(3)).toBe("survival");
    expect(state(4)).toBe("empty");
    expect(state(8)).toBe("full");
    expect(view).toMatchObject({ showedUp: 3, fullDays: 2, survivalDays: 1, tickedThisMonth: 6 });
  });

  it("counts a Survival Mode day as a full day when the setting says so", () => {
    const view = buildProgress(
      world([done(SLEEP, "2026-09-03")], {
        dayRecords: [dayRecord({ day_key: "2026-09-03", survival_on: true, survival_level: 2 })],
        settings: settings({ survivalCountsAsFullDay: true }),
      }),
    );
    expect(view).toMatchObject({ showedUp: 1, fullDays: 1, survivalDays: 1 });
  });

  it("days per habit: done of scheduled, most done first; skipped days don't count", () => {
    const view = buildProgress(
      world([
        done(WALK, "2026-09-01"),
        done(WALK, "2026-09-02"),
        done(PINT, "2026-09-02"),
        skipped(PINT, "2026-09-03"),
      ]),
    );
    expect(view.habits.map((h) => [h.task.name, h.done, h.scheduled])).toEqual([
      ["Walk", 2, 8],
      ["Pint", 1, 7],
    ]);
  });

  it("time per section sums credited minutes this month only", () => {
    const view = buildProgress(
      world([done(WALK, "2026-09-01", 20), done(PINT, "2026-09-02"), done(WALK, "2026-08-31", 20)]),
    );
    expect(view.timeBySection.map((s) => [s.section.name, s.minutes])).toEqual([["Morning", 22]]);
  });

  it("lists tasks avoided 4+ active days running", () => {
    // Active days (something ticked) 2–7 Sep; Walk never done, Pint done on the 5th.
    const days = [
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
    ];
    const occurrences = days.map((d) => (d === "2026-09-05" ? done(PINT, d) : skipped(PINT, d)));
    const view = buildProgress(world(occurrences));
    expect(view.avoided.map((a) => [a.task.name, a.run])).toEqual([["Walk", 6]]);
  });
});

describe("skipRun", () => {
  it("treats days without any activity as neutral and stops at the last done day", () => {
    const occurrences = [
      done(WALK, "2026-09-01"),
      skipped(WALK, "2026-09-03"),
      // 4–5 Sep: app not used at all.
      done(PINT, "2026-09-06"),
      done(PINT, "2026-09-07"),
      skipped(WALK, TODAY),
    ];
    const factsOf = dayFactsReader(world(occurrences));
    expect(skipRun(WALK, TODAY, factsOf)).toBe(4);
    expect(skipRun(PINT, TODAY, factsOf)).toBe(0);
  });

  it("doesn't count today while it is still open", () => {
    const factsOf = dayFactsReader(world([done(PINT, addDays(TODAY, -1))]));
    expect(skipRun(WALK, TODAY, factsOf)).toBe(1);
  });

  it("labels", () => {
    expect(skipRunLabel(0)).toBeNull();
    expect(skipRunLabel(1)).toBe("1 day");
    expect(skipRunLabel(5)).toBe("5 days running");
  });
});

describe("month helpers", () => {
  it("start and shift across years", () => {
    expect(monthStart("2026-09-18")).toBe("2026-09-01");
    expect(shiftMonth("2026-12-05", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-31", -1)).toBe("2025-12-01");
  });
});
