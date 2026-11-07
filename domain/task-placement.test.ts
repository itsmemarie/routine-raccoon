import { link, occurrence, plan, section, settings, task } from "@/tests/factories";
import { buildTasksCsv, type ExportInput } from "./export";
import { taskDeletedCopy, taskRemovedFromPlanCopy } from "./log";
import {
  archivedPlans,
  copiesOfTask,
  exclusionsAfterMove,
  planCards,
  plansOfTask,
  sectionRows,
  taskPlacement,
  tasksOfSection,
  type Organisation,
} from "./organise";
import { buildToday } from "./today";

/**
 * A task can show in several Day Plans in two ways, and both are in real use: its section is
 * linked into several plans (one row), or the plans hold separate copies (same name, own rows).
 * @see docs/handoff/README.md "Deleting a task that's in several plans"
 */
const DAY = "2026-09-08";
const normal = plan({ name: "Normal", kind: "primary", rank: "a0" });
const travel = plan({ name: "Travel", kind: "custom", rank: "a1" });
const away = plan({ name: "Away", kind: "custom", rank: "a2" });
const badDay = plan({ name: "Bad day", kind: "survival", survival_level: 2, rank: "a3" });
const morning = section({ name: "Morning" });
const evening = section({ name: "Evening" });
const awayMorning = section({ name: "Morning copy" });
const badMorning = section({ name: "Morning copy" });
const plans = [normal, travel, away, badDay];
const sections = [morning, evening, awayMorning, badMorning];
const planSections = [
  link(normal.id, morning.id),
  link(travel.id, morning.id),
  link(normal.id, evening.id, "a1"),
  link(travel.id, evening.id, "a1"),
  link(away.id, evening.id, "a1"),
  link(away.id, awayMorning.id),
  link(badDay.id, badMorning.id),
];

function org(...tasks: ReturnType<typeof task>[]): Organisation {
  return { plans, planSections, sections, tasks };
}

function today(
  tasks: ReturnType<typeof task>[],
  planId?: string,
  occurrences: ReturnType<typeof occurrence>[] = [],
) {
  return buildToday({
    dayKey: DAY,
    ...org(...tasks),
    occurrences,
    dayRecord: planId
      ? {
          day_key: DAY,
          survival_on: false,
          survival_level: 2,
          closed_at: null,
          plan_id: planId,
          created_at: "2026-09-01T08:00:00.000Z",
          updated_at: "2026-09-01T08:00:00.000Z",
          deleted_at: null,
        }
      : null,
    settings: settings(),
    filter: "all",
  });
}

const names = (rows: readonly { name: string }[]) => rows.map((r) => r.name);

describe("a task removed from one plan", () => {
  const stretch = task({ section_id: morning.id, name: "Stretch", minutes: 10 });
  const removed = task({
    section_id: morning.id,
    name: "Yoga",
    minutes: 20,
    rank: "a1",
    excluded_plan_ids: [normal.id],
  });

  it("is gone from that plan's Today and stays on the others'", () => {
    const shownIn = (planId?: string) =>
      names(today([stretch, removed], planId).sections[0]?.tasks.map((t) => t.task) ?? []);
    expect(shownIn(normal.id)).toEqual(["Stretch"]);
    expect(shownIn(travel.id)).toEqual(["Stretch", "Yoga"]);
  });

  it("doesn't come back as a carry-over in that plan", () => {
    const carried = occurrence({
      task_id: removed.id,
      day_key: DAY,
      status: "pending",
      carried_from_day_key: "2026-09-07",
    });
    expect(today([removed], normal.id, [carried]).remainingCount).toBe(0);
    expect(today([removed], travel.id, [carried]).remainingCount).toBe(1);
  });

  it("leaves that plan's counts and totals, not the others'", () => {
    const world = org(stretch, removed);
    const row = (planId: string) => sectionRows(world, planId)[0];
    expect(row(normal.id)).toMatchObject({ taskCount: 1, minutesFromTasks: 10 });
    expect(row(travel.id)).toMatchObject({ taskCount: 2, minutesFromTasks: 30 });
    expect(planCards(world).find((c) => c.plan.id === normal.id)?.taskCount).toBe(1);
    expect(planCards(world).find((c) => c.plan.id === travel.id)?.taskCount).toBe(2);
  });

  it("leaves an archived plan's count too", () => {
    const shelved = { ...normal, kind: "custom" as const, archived_at: "2026-09-02T08:00:00.000Z" };
    const world = { ...org(stretch, removed), plans: [shelved, travel, away, badDay] };
    expect(archivedPlans(world)[0]).toMatchObject({ taskCount: 1 });
  });

  it("is listed by the section only when a plan is named", () => {
    const world = org(stretch, removed);
    expect(names(tasksOfSection(world, morning.id))).toEqual(["Stretch", "Yoga"]);
    expect(names(tasksOfSection(world, morning.id, normal.id))).toEqual(["Stretch"]);
  });

  it("no longer names that plan", () => {
    expect(names(plansOfTask(org(removed), removed))).toEqual(["Travel"]);
  });

  it("drops that plan from the tasks CSV", () => {
    const input: ExportInput = {
      ...org(removed),
      occurrences: [],
      dayRecords: [],
      log: [],
      settings: settings(),
      includeArchive: false,
      exportedAt: "2026-09-08T08:00:00.000Z",
      appVersion: "1",
    };
    const [, row] = buildTasksCsv(input).split("\r\n");
    expect(row?.startsWith("Travel,Morning,Yoga,")).toBe(true);
  });
});

describe("copiesOfTask", () => {
  it("finds same-named rows in the user's other plans", () => {
    const original = task({ section_id: morning.id, name: "Breakfast" });
    const inAway = task({ section_id: awayMorning.id, name: " breakfast " });
    const survival = task({ section_id: badMorning.id, name: "BREAKFAST", survival_level: 2 });
    expect(copiesOfTask(org(original, inAway, survival), original)).toEqual([inAway, survival]);
  });

  it("works from a copy back to the original", () => {
    const original = task({ section_id: morning.id, name: "Breakfast" });
    const survival = task({ section_id: badMorning.id, name: "Breakfast", survival_level: 2 });
    expect(copiesOfTask(org(original, survival), survival)).toEqual([original]);
  });

  it("never takes a same-named task kept twice on purpose in the same plan", () => {
    const am = task({ section_id: morning.id, name: "Tidy desk" });
    const pm = task({ section_id: evening.id, name: "Tidy desk" });
    expect(copiesOfTask(org(am, pm), am)).toEqual([]);
    expect(copiesOfTask(org(am, pm), pm)).toEqual([]);
  });

  it("never takes a same-section twin", () => {
    const first = task({ section_id: evening.id, name: "Drink water" });
    const second = task({ section_id: evening.id, name: "Drink water" });
    expect(copiesOfTask(org(first, second), first)).toEqual([]);
  });

  it("keeps the real copy and leaves the same-named task that shares a plan", () => {
    const original = task({ section_id: morning.id, name: "Drink water" });
    const inEvening = task({ section_id: evening.id, name: "Drink water" });
    const survival = task({ section_id: badMorning.id, name: "Drink water" });
    expect(copiesOfTask(org(original, inEvening, survival), original)).toEqual([survival]);
  });

  it("leaves rows it can't tell apart: two same-named tasks in one other plan", () => {
    const smashIt = section({ name: "Smash it" });
    const world: Organisation = {
      ...org(),
      sections: [...sections, smashIt],
      planSections: [...planSections, link(normal.id, smashIt.id, "a2")],
    };
    const inAway = task({ section_id: awayMorning.id, name: "Drink water" });
    const original = task({ section_id: morning.id, name: "Drink water" });
    const second = task({ section_id: smashIt.id, name: "Drink water" });
    expect(copiesOfTask({ ...world, tasks: [inAway, original, second] }, inAway)).toEqual([]);
  });

  it("skips deleted and archived rows, and rows in archived sections", () => {
    const shelved = section({ name: "Shelved", archived_at: "2026-09-02T08:00:00.000Z" });
    const world: Organisation = {
      ...org(),
      sections: [...sections, shelved],
      planSections: [...planSections, link(badDay.id, shelved.id, "a1")],
    };
    const original = task({ section_id: morning.id, name: "Breakfast" });
    const rows = [
      original,
      task({ section_id: awayMorning.id, name: "Breakfast", deleted_at: "x" }),
      task({ section_id: awayMorning.id, name: "Breakfast", archived_at: "x" }),
      task({ section_id: shelved.id, name: "Breakfast" }),
    ];
    expect(copiesOfTask({ ...world, tasks: rows }, original)).toEqual([]);
  });

  it("has nothing to say about a task that's in no plan", () => {
    const orphan = task({
      section_id: morning.id,
      name: "Breakfast",
      excluded_plan_ids: [normal.id, travel.id],
    });
    const survival = task({ section_id: badMorning.id, name: "Breakfast" });
    expect(copiesOfTask(org(orphan, survival), orphan)).toEqual([]);
  });

  it("doesn't count a row removed from every plan it could be in", () => {
    const original = task({ section_id: morning.id, name: "Breakfast" });
    const gone = task({
      section_id: awayMorning.id,
      name: "Breakfast",
      excluded_plan_ids: [away.id],
    });
    expect(copiesOfTask(org(original, gone), original)).toEqual([]);
  });
});

describe("taskPlacement", () => {
  const original = task({ section_id: morning.id, name: "Breakfast" });
  const inAway = task({ section_id: awayMorning.id, name: "Breakfast" });
  const world = org(original, inAway);

  it("lists every plan showing it, copies included, in plan order", () => {
    const placement = taskPlacement(world, original, normal.id);
    expect(names(placement.plans)).toEqual(["Normal", "Travel", "Away"]);
    expect(placement.copies).toEqual([inAway]);
  });

  it("acts on today's plan when the task is in it", () => {
    expect(taskPlacement(world, original, travel.id).current?.name).toBe("Travel");
  });

  it("falls back to the task's own first plan when today's plan doesn't hold it", () => {
    expect(taskPlacement(world, original, badDay.id).current?.name).toBe("Normal");
    expect(taskPlacement(world, original, null).current?.name).toBe("Normal");
    // Today's plan holds only a copy, so this row can't be removed from it.
    expect(taskPlacement(world, original, away.id).current?.name).toBe("Normal");
  });

  it("prefers a plan in use over an archived one", () => {
    const shelved = { ...normal, archived_at: "2026-09-02T08:00:00.000Z" };
    const archivedFirst = { ...world, plans: [shelved, travel, away, badDay] };
    expect(taskPlacement(archivedFirst, original, null).current?.name).toBe("Travel");
  });

  it("uses an archived plan when that's all there is", () => {
    const solo = section({ name: "Solo" });
    const shelved = plan({
      kind: "custom",
      name: "Old",
      archived_at: "2026-09-02T08:00:00.000Z",
    });
    const row = task({ section_id: solo.id, name: "Only here" });
    const placement = taskPlacement(
      {
        plans: [shelved],
        planSections: [link(shelved.id, solo.id)],
        sections: [solo],
        tasks: [row],
      },
      row,
      null,
    );
    expect(placement.current?.name).toBe("Old");
  });

  it("has no current plan for a task that's in none", () => {
    const orphan = task({ section_id: section().id, name: "Orphan" });
    expect(taskPlacement(org(orphan), orphan, normal.id)).toEqual({
      current: null,
      plans: [],
      copies: [],
    });
  });
});

describe("exclusionsAfterMove", () => {
  it("keeps a removal when the task still shows somewhere else", () => {
    expect(exclusionsAfterMove(["a"], ["a", "b"])).toEqual(["a"]);
  });

  it("clears removals that would leave the task in no plan", () => {
    expect(exclusionsAfterMove(["a"], ["a"])).toEqual([]);
    expect(exclusionsAfterMove(["a"], [])).toEqual([]);
  });
});

describe("log copy", () => {
  it("says what happened and where", () => {
    expect(taskRemovedFromPlanCopy({ name: "Eat" }, "Normal")).toEqual({
      kind: "edited",
      title: "Removed Eat",
      meta: "From Normal",
    });
    expect(taskDeletedCopy({ name: "Eat" }, "Morning", 3).meta).toBe(
      "Morning · from 3 plans · history kept",
    );
    expect(taskDeletedCopy({ name: "Eat" }, "Morning").meta).toBe("Morning · history kept");
  });
});
