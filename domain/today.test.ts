import { dayRecord, link, occurrence, plan, section, settings, task } from "@/tests/factories";
import {
  buildPlanOptions,
  buildToday,
  isExtraSupport,
  summariseDay,
  survivalEmptyText,
  type TodayInput,
} from "./today";

const DAY = "2026-09-08";

/** A small world: Normal (Morning, Evening), Travelling, and a Bad day survival plan. */
function world() {
  const normal = plan({ name: "Normal", kind: "primary", rank: "a0" });
  const travelling = plan({ name: "Travelling", kind: "custom", rank: "a1" });
  const badDay = plan({ name: "Bad day", kind: "survival", survival_level: 2, rank: "a2" });

  const morning = section({ name: "Morning" });
  const evening = section({ name: "Evening" });
  const empty = section({ name: "Wind down" });
  const away = section({ name: "Before leaving" });
  const keep = section({ name: "Keep standing" });

  const pint = task({ section_id: morning.id, name: "Drink a pint", minutes: 2, rank: "a0" });
  const eat = task({ section_id: morning.id, name: "Eat something", minutes: 20, rank: "a1" });
  const dinner = task({
    section_id: evening.id,
    name: "Prepare dinner",
    minutes: 60,
    hard: true,
    steps: [
      { id: "s1", text: "Decide" },
      { id: "s2", text: "Cook" },
    ],
  });
  const passport = task({ section_id: away.id, name: "Passport", minutes: 3 });
  const water = task({ section_id: keep.id, name: "Water", minutes: 10 });
  const food = task({
    section_id: keep.id,
    name: "Food",
    minutes: 30,
    never_shrink: true,
    rank: "a1",
  });

  const input: TodayInput = {
    dayKey: DAY,
    plans: [normal, travelling, badDay],
    planSections: [
      link(normal.id, morning.id, "a0"),
      link(normal.id, evening.id, "a1"),
      link(normal.id, empty.id, "a2"),
      link(travelling.id, away.id, "a0"),
      link(badDay.id, keep.id, "a0"),
    ],
    sections: [morning, evening, empty, away, keep],
    tasks: [pint, eat, dinner, passport, water, food],
    occurrences: [],
    dayRecord: null,
    settings: settings(),
    filter: "all",
  };
  return { input, normal, travelling, badDay, morning, evening, pint, eat, dinner, water, food };
}

describe("buildToday: normal day", () => {
  it("shows the primary plan's sections in plan order with totals and headline", () => {
    const { input } = world();
    const view = buildToday(input);
    expect(view.activePlan?.name).toBe("Normal");
    expect(view.sections.map((s) => s.section.name)).toEqual(["Morning", "Evening", "Wind down"]);
    expect(view.sections.map((s) => s.remainingMinutes)).toEqual([22, 60, 0]);
    expect(view.remainingCount).toBe(3);
    expect(view.headline).toEqual(["3 tasks left,", "about 1h 22m."]);
    expect(view.planCard).toEqual({
      overline: "Today's plan",
      title: "Normal",
      meta: "3 tasks · 1h 22m",
    });
  });

  it("marks empty sections with the drag copy", () => {
    const view = buildToday(world().input);
    expect(view.sections[2]?.emptyText).toBe("Empty — drag a task in");
    expect(view.sections[0]?.emptyText).toBeNull();
  });

  it("builds card meta (max two bits) and the Hard badge", () => {
    const view = buildToday(world().input);
    const dinner = view.sections[1]?.tasks[0];
    expect(dinner?.showHardBadge).toBe(true);
    expect(dinner?.showSurvivalBadge).toBe(false);
    expect(dinner?.meta).toBe("2 steps");
  });

  it("excludes ticked tasks from totals but keeps them visible for the tick animation", () => {
    const { input, pint } = world();
    const view = buildToday({
      ...input,
      occurrences: [occurrence({ task_id: pint.id, day_key: DAY })],
    });
    expect(view.sections[0]?.tasks.find((t) => t.task.id === pint.id)?.done).toBe(true);
    expect(view.remainingCount).toBe(2);
    expect(view.headline).toEqual(["2 tasks left,", "about 1h 20m."]);
  });

  it("hides skipped tasks entirely", () => {
    const { input, eat } = world();
    const view = buildToday({
      ...input,
      occurrences: [occurrence({ task_id: eat.id, day_key: DAY, status: "skipped" })],
    });
    expect(view.sections[0]?.tasks.map((t) => t.task.name)).toEqual(["Drink a pint"]);
  });

  it("ignores deleted occurrences", () => {
    const { input, pint } = world();
    const view = buildToday({
      ...input,
      occurrences: [
        occurrence({ task_id: pint.id, day_key: DAY, deleted_at: "2026-09-08T09:00:00Z" }),
      ],
    });
    expect(view.remainingCount).toBe(3);
  });

  it("says All clear when nothing is left", () => {
    const { input, pint, eat, dinner } = world();
    const view = buildToday({
      ...input,
      occurrences: [pint, eat, dinner].map((t) => occurrence({ task_id: t.id, day_key: DAY })),
    });
    expect(view.headline).toEqual(["All clear,", "nothing left today."]);
    expect(view.planCard.meta).toBe("0 tasks · 0m");
  });

  it("uses singular copy for one task", () => {
    const { input, pint, eat } = world();
    const view = buildToday({
      ...input,
      occurrences: [pint, eat].map((t) => occurrence({ task_id: t.id, day_key: DAY })),
    });
    expect(view.headline[0]).toBe("1 task left,");
  });

  it("drops archived and deleted tasks, and sections that don't recur today", () => {
    const { input, eat, evening } = world();
    const view = buildToday({
      ...input,
      tasks: input.tasks.map((t) =>
        t.id === eat.id ? { ...t, archived_at: "2026-09-01T00:00:00Z" } : t,
      ),
      sections: input.sections.map((s) =>
        s.id === evening.id
          ? { ...s, recurrence: { kind: "custom", days: [5, 6], n: 1, per: "week", ends: "never" } }
          : s,
      ),
    });
    expect(view.sections.map((s) => s.section.name)).toEqual(["Morning", "Wind down"]);
    expect(view.sections[0]?.tasks.map((t) => t.task.name)).toEqual(["Drink a pint"]);
  });

  it("uses the plan picked for the day (Travelling)", () => {
    const { input, travelling } = world();
    const view = buildToday({
      ...input,
      dayRecord: dayRecord({ day_key: DAY, plan_id: travelling.id }),
    });
    expect(view.activePlan?.name).toBe("Travelling");
    expect(view.sections.map((s) => s.section.name)).toEqual(["Before leaving"]);
  });

  it("falls back to primary when the picked plan is gone", () => {
    const { input } = world();
    const view = buildToday({
      ...input,
      dayRecord: dayRecord({ day_key: DAY, plan_id: "00000000-0000-4000-8000-999999999999" }),
    });
    expect(view.activePlan?.name).toBe("Normal");
  });
});

describe("buildToday: filters and Extra Support", () => {
  it.each([
    ["hard", ["Prepare dinner"]],
    ["under5", ["Drink a pint"]],
    ["under15", ["Drink a pint"]],
    ["extra", ["Eat something", "Prepare dinner"]],
    ["all", ["Drink a pint", "Eat something", "Prepare dinner"]],
  ] as const)("filter %s", (filter, names) => {
    const view = buildToday({ ...world().input, filter });
    expect(view.sections.flatMap((s) => s.tasks.map((t) => t.task.name))).toEqual(names);
  });

  it("totals follow the filter; the plan card and Extra Support count don't", () => {
    const view = buildToday({ ...world().input, filter: "hard" });
    expect(view.headline).toEqual(["1 task left,", "about 1h."]);
    expect(view.planCard.meta).toBe("3 tasks · 1h 22m");
    expect(view.extraSupportCount).toBe(2);
  });

  it("Extra Support = hard or ≥ longAt", () => {
    expect(isExtraSupport({ hard: true }, 1, 20)).toBe(true);
    expect(isExtraSupport({ hard: false }, 20, 20)).toBe(true);
    expect(isExtraSupport({ hard: false }, 19, 20)).toBe(false);
  });
});

describe("buildToday: Survival Mode", () => {
  it("shows the level's own plan (not cumulative), shrunk, with survival card copy", () => {
    const { input } = world();
    const view = buildToday({
      ...input,
      dayRecord: dayRecord({ day_key: DAY, survival_on: true, survival_level: 2 }),
    });
    expect(view.activePlan?.name).toBe("Bad day");
    expect(view.sections.map((s) => s.section.name)).toEqual(["Keep standing"]);
    const [water, food] = view.sections[0]?.tasks ?? [];
    expect(water).toMatchObject({
      minutes: 5,
      shrunk: true,
      showSurvivalBadge: true,
      meta: "was 10m",
    });
    expect(food).toMatchObject({ minutes: 30, shrunk: false, showSurvivalBadge: false });
    expect(view.headline).toEqual(["2 tasks left,", "about 35m."]);
    expect(view.planCard).toEqual({
      overline: "Survival Mode Day",
      title: "Bad day",
      meta: "2 tasks · 35m · from Normal",
    });
  });

  it("hides the Hard badge in Survival Mode", () => {
    const { input, water } = world();
    const view = buildToday({
      ...input,
      tasks: input.tasks.map((t) => (t.id === water.id ? { ...t, hard: true } : t)),
      dayRecord: dayRecord({ day_key: DAY, survival_on: true, survival_level: 2 }),
    });
    expect(view.sections[0]?.tasks[0]?.showHardBadge).toBe(false);
  });

  it("handles a level with no plan yet, using the renamed feature name", () => {
    const { input } = world();
    const view = buildToday({
      ...input,
      settings: settings({ survivalName: "Nope Day" }),
      dayRecord: dayRecord({ day_key: DAY, survival_on: true, survival_level: 3 }),
    });
    expect(view.activePlan).toBeNull();
    expect(view.sections).toEqual([]);
    expect(view.planCard.overline).toBe("Nope Day Day");
    expect(view.planCard.title).toBe("No plan for this level yet");
  });

  it("shows the survival empty-section copy", () => {
    const { input, badDay } = world();
    const extra = section({ name: "Rest" });
    const view = buildToday({
      ...input,
      sections: [...input.sections, extra],
      planSections: [...input.planSections, link(badDay.id, extra.id, "a1")],
      dayRecord: dayRecord({ day_key: DAY, survival_on: true, survival_level: 2 }),
    });
    expect(view.sections[1]?.emptyText).toBe("Nothing here on a bad day");
  });

  it.each([
    ["Bad day", "Nothing here on a bad day"],
    ["Zero energy", "Nothing here on a zero energy day"],
    ["Bare minimum", "Nothing here on a bare minimum day"],
    ["Holiday", "Nothing here on a holiday day"],
    ["Sick DAY", "Nothing here on a sick day"],
  ])("survival empty copy for %s never doubles 'day'", (name, copy) => {
    expect(survivalEmptyText(name)).toBe(copy);
  });

  it("works with no plans at all", () => {
    const { input } = world();
    const view = buildToday({ ...input, plans: [] });
    expect(view.activePlan).toBeNull();
    expect(view.planCard.title).toBe("No Day Plan yet");
    expect(view.basePlan).toBeNull();
  });

  it("survival card meta omits 'from' when there is no base plan", () => {
    const { input, badDay } = world();
    const view = buildToday({
      ...input,
      plans: [badDay],
      dayRecord: dayRecord({ day_key: DAY, survival_on: true, survival_level: 2 }),
    });
    expect(view.planCard.meta).toBe("2 tasks · 35m");
  });
});

describe("buildPlanOptions", () => {
  it("lists regular plans with full durations and survival plans with shrunk durations", () => {
    const options = buildPlanOptions(world().input);
    expect(options.dayPlans.map((o) => [o.plan.name, o.count, o.minutes])).toEqual([
      ["Normal", 3, 82],
      ["Travelling", 1, 3],
    ]);
    expect(options.survival.map((o) => [o.plan.name, o.level, o.count, o.minutes])).toEqual([
      ["Bad day", 2, 2, 35],
    ]);
  });
});

describe("buildToday: carried tasks, steps and ordering", () => {
  it("shows a carried task even when it doesn't recur today, with 'From yesterday' meta", () => {
    const { input, morning } = world();
    const weekly = task({
      section_id: morning.id,
      name: "Weekly shop",
      minutes: 30,
      rank: "a2",
      // Created on a Monday; DAY (8 Sep 2026) is a Tuesday, so it doesn't recur today.
      created_at: "2026-09-07T08:00:00.000Z",
      recurrence: { kind: "every week", days: [], n: 1, per: "week", ends: "never" },
    });
    const without = buildToday({ ...input, tasks: [...input.tasks, weekly] });
    expect(without.sections[0]?.tasks.map((t) => t.task.name)).not.toContain("Weekly shop");

    const view = buildToday({
      ...input,
      tasks: [...input.tasks, weekly],
      occurrences: [
        occurrence({
          task_id: weekly.id,
          day_key: DAY,
          status: "pending",
          completed_at: null,
          carried_from_day_key: "2026-09-07",
        }),
      ],
    });
    const carried = view.sections[0]?.tasks.find((t) => t.task.id === weekly.id);
    expect(carried?.carried).toBe(true);
    expect(carried?.meta).toBe("From yesterday · Every week");
    expect(view.remainingCount).toBe(4);
  });

  it("lists the steps not yet ticked today", () => {
    const { input, dinner } = world();
    const view = buildToday({
      ...input,
      occurrences: [
        occurrence({
          task_id: dinner.id,
          day_key: DAY,
          status: "pending",
          completed_at: null,
          checked_step_ids: ["s1"],
        }),
      ],
    });
    const item = view.sections[1]?.tasks[0];
    expect(item?.openSteps.map((s) => s.text)).toEqual(["Cook"]);
  });

  it("orders tasks with equal ranks by id, the same way on every device", () => {
    const { input, morning } = world();
    const b = task({
      id: "00000000-0000-4000-8000-0000000000bb",
      section_id: morning.id,
      rank: "a5",
      name: "B",
    });
    const a = task({
      id: "00000000-0000-4000-8000-0000000000aa",
      section_id: morning.id,
      rank: "a5",
      name: "A",
    });
    const view = buildToday({ ...input, tasks: [...input.tasks, b, a] });
    expect(view.sections[0]?.tasks.map((t) => t.task.name).slice(-2)).toEqual(["A", "B"]);
  });

  it("ignores occurrences of other days", () => {
    const { input, pint } = world();
    const view = buildToday({
      ...input,
      occurrences: [occurrence({ task_id: pint.id, day_key: "2026-09-07" })],
    });
    expect(view.remainingCount).toBe(3);
  });

  it("tolerates a row with an unreadable created_at", () => {
    const { input, morning } = world();
    const odd = task({ section_id: morning.id, name: "Odd", created_at: "not a date", rank: "a9" });
    const view = buildToday({ ...input, tasks: [...input.tasks, odd] });
    expect(view.sections[0]?.tasks.map((t) => t.task.name)).toContain("Odd");
  });
});

describe("summariseDay", () => {
  it("counts ticked of total, credited minutes and hard tasks in the active plan", () => {
    const { input, pint, dinner, eat } = world();
    const occurrences = [
      occurrence({ task_id: pint.id, day_key: DAY, minutes_credited: 2 }),
      occurrence({ task_id: dinner.id, day_key: DAY, minutes_credited: 60 }),
      occurrence({ task_id: eat.id, day_key: DAY, status: "skipped", completed_at: null }),
    ];
    expect(summariseDay({ ...input, occurrences })).toEqual({
      ticked: 2,
      total: 2,
      minutes: 62,
      hard: 1,
      survivalOn: false,
    });
  });

  it("falls back to the shown minutes when nothing was credited", () => {
    const { input, pint } = world();
    const summary = summariseDay({
      ...input,
      occurrences: [occurrence({ task_id: pint.id, day_key: DAY, minutes_credited: null })],
    });
    expect(summary).toMatchObject({ ticked: 1, total: 3, minutes: 2 });
  });
});
