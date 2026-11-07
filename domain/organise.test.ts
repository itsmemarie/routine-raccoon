import { link, plan, section, task } from "@/tests/factories";
import {
  activePlans,
  allSectionChoices,
  archivedPlans,
  archivedSections,
  homePlanOf,
  otherPlansWithTask,
  planCards,
  plansOfSection,
  sectionRows,
  type Organisation,
} from "./organise";

function world() {
  const normal = plan({ name: "Normal", rank: "a0" });
  const travel = plan({ name: "Travelling", kind: "custom", rank: "a1" });
  const bad = plan({ name: "Bad day", kind: "survival", survival_level: 2, rank: "a2" });
  const old = plan({
    name: "Old",
    kind: "custom",
    rank: "a3",
    archived_at: "2026-08-02T00:00:00Z",
  });
  const gone = plan({ name: "Gone", kind: "custom", rank: "a4", deleted_at: "x" });
  const morning = section({ name: "Morning" });
  const evening = section({ name: "Evening" });
  const shelf = section({ name: "Shelf", archived_at: "2026-08-01T00:00:00Z" });
  const keep = section({ name: "Keep" });
  const tasks = [
    task({ section_id: morning.id, name: "Pint", minutes: 2, rank: "a0" }),
    task({ section_id: morning.id, name: "Eat", minutes: 20, rank: "a1" }),
    task({ section_id: morning.id, name: "Archived", archived_at: "x", rank: "a2" }),
    task({ section_id: evening.id, name: "Dinner", minutes: 60 }),
    task({ section_id: keep.id, name: "pint " }),
    task({ section_id: shelf.id, name: "Dust" }),
  ];
  const org: Organisation = {
    plans: [old, bad, normal, travel, gone],
    planSections: [
      link(normal.id, evening.id, "a1"),
      link(normal.id, morning.id, "a0"),
      link(travel.id, morning.id, "a0"),
      link(bad.id, keep.id, "a0"),
      link(old.id, shelf.id, "a0"),
      { ...link(travel.id, evening.id, "a1"), deleted_at: "x" },
    ],
    sections: [morning, evening, shelf, keep],
    tasks,
  };
  return { org, normal, travel, bad, old, morning, evening, shelf, keep, tasks };
}

describe("organise selectors", () => {
  it("active plans in order, excluding archived and deleted", () => {
    expect(activePlans(world().org).map((p) => p.name)).toEqual([
      "Normal",
      "Travelling",
      "Bad day",
    ]);
  });

  it("section rows: order, counts, minutes and the other plans it's in", () => {
    const { org, normal } = world();
    expect(
      sectionRows(org, normal.id).map((r) => [
        r.section.name,
        r.taskCount,
        r.minutesFromTasks,
        r.alsoIn.map((p) => p.name),
      ]),
    ).toEqual([
      ["Morning", 2, 22, ["Travelling"]],
      ["Evening", 1, 60, []],
    ]);
  });

  it("plan cards count live sections and tasks", () => {
    expect(planCards(world().org).map((c) => [c.plan.name, c.sectionCount, c.taskCount])).toEqual([
      ["Normal", 2, 3],
      ["Travelling", 1, 2],
      ["Bad day", 1, 1],
    ]);
  });

  it("archive lists plans and sections with their context", () => {
    const { org } = world();
    expect(archivedPlans(org).map((a) => [a.plan.name, a.sectionCount, a.taskCount])).toEqual([
      ["Old", 1, 1],
    ]);
    expect(archivedSections(org).map((a) => [a.section.name, a.planNames])).toEqual([
      ["Shelf", ["Old"]],
    ]);
  });

  it("section choices, plans of a section and its home plan", () => {
    const { org, morning, shelf } = world();
    expect(allSectionChoices(org).map((c) => `${c.section.name} · ${c.plan.name}`)).toEqual([
      "Morning · Normal",
      "Evening · Normal",
      "Morning · Travelling",
      "Keep · Bad day",
    ]);
    expect(plansOfSection(org, morning.id).map((p) => p.name)).toEqual(["Normal", "Travelling"]);
    expect(homePlanOf(org, morning.id)?.name).toBe("Normal");
    expect(homePlanOf(org, shelf.id)).toBeNull();
  });

  it("finds other plans holding a same-named copy", () => {
    const { org, tasks } = world();
    const pint = tasks[0];
    if (!pint) throw new Error("fixture");
    expect(otherPlansWithTask(org, pint).map((p) => p.name)).toEqual(["Bad day"]);
    const dinner = tasks[3];
    if (!dinner) throw new Error("fixture");
    expect(otherPlansWithTask(org, dinner)).toEqual([]);
  });

  it("counts every kind of plan, but never one the task itself sits in", () => {
    const { org, tasks, evening, keep } = world();
    const dinner = tasks[3];
    if (!dinner) throw new Error("fixture");
    const inBadDay = task({ section_id: keep.id, name: "Dinner" });
    expect(
      otherPlansWithTask({ ...org, tasks: [...tasks, inBadDay] }, inBadDay).map((p) => p.name),
    ).toEqual(["Normal"]);

    // A copy in another section of Normal isn't "also in Normal". (Morning is in Travelling too.)
    const repeat = task({ section_id: evening.id, name: "Pint" });
    expect(
      otherPlansWithTask({ ...org, tasks: [...tasks, repeat] }, repeat).map((p) => p.name),
    ).toEqual(["Travelling", "Bad day"]);
  });
});
