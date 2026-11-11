import { link, plan, section, task, testId } from "@/tests/factories";
import {
  coupledCount,
  sectionCouplingView,
  sectionStagedSummary,
  taskCouplingView,
  taskStagedSummary,
  type TaskPlace,
} from "./coupling";
import type { Organisation } from "./organise";

/**
 * Normal: Morning (shared with Travel), Evening. Travel: Morning, Gym. Camping: Camp (no
 * Morning). Empty: no sections. "Pint" is in the shared Morning but removed from Travel; it is
 * coupled with a copy in Evening.
 */
function fixture() {
  const normal = plan({ name: "Normal", rank: "a0" });
  const travel = plan({ name: "Travel", kind: "custom", rank: "a1" });
  const camping = plan({ name: "Camping", kind: "custom", rank: "a2" });
  const empty = plan({ name: "Empty", kind: "custom", rank: "a3" });
  const morning = section({ name: "Morning" });
  const evening = section({ name: "Evening" });
  const gym = section({ name: "Gym" });
  const camp = section({ name: "Camp" });
  const linkId = testId();
  const pint = task({ section_id: morning.id, link_id: linkId, excluded_plan_ids: [travel.id] });
  const copy = task({ section_id: evening.id, link_id: linkId });
  const loose = task({ section_id: gym.id, name: "Squats" });
  const org: Organisation = {
    plans: [normal, travel, camping, empty],
    planSections: [
      link(normal.id, morning.id, "a0"),
      link(normal.id, evening.id, "a1"),
      link(travel.id, morning.id, "a0"),
      link(travel.id, gym.id, "a1"),
      link(camping.id, camp.id, "a0"),
    ],
    sections: [morning, evening, gym, camp],
    tasks: [pint, copy, loose],
  };
  return { org, normal, travel, camping, empty, morning, evening, gym, pint, copy, loose };
}

describe("taskCouplingView", () => {
  it("lists every place with how the task lives there", () => {
    const f = fixture();
    const view = taskCouplingView(f.org, f.pint, f.normal.id);
    expect(view.plan?.id).toBe(f.normal.id);
    expect(view.sectionName).toBe("Morning");
    expect(view.copyCount).toBe(1);
    expect(view.sections).toEqual([
      {
        id: f.evening.id,
        scope: "section",
        name: "Evening",
        state: { kind: "coupled", copyId: f.copy.id, sectionName: "Evening" },
      },
    ]);
    const byName = Object.fromEntries(view.plans.map((p) => [p.name, p.state]));
    expect(byName.Travel).toEqual({ kind: "off", landing: "Morning", bringBack: true });
    expect(byName.Camping).toEqual({ kind: "off", landing: "Camp", bringBack: false });
    expect(byName.Empty).toEqual({ kind: "off", landing: "New section Morning", bringBack: false });
  });

  it("shows a plan through a coupled section, and a copy in another plan as coupled", () => {
    const f = fixture();
    const shown = { ...f.pint, excluded_plan_ids: [] };
    const inGym = { ...f.copy, section_id: f.gym.id };
    const org = { ...f.org, tasks: [shown, inGym, f.loose] };
    const view = taskCouplingView(org, shown, f.normal.id);
    expect(view.plans.find((p) => p.name === "Travel")?.state).toEqual({
      kind: "through",
      sectionName: "Morning",
    });
    const fromCopy = taskCouplingView(org, inGym, null);
    expect(fromCopy.plan?.id).toBe(f.travel.id);
    expect(fromCopy.plans.find((p) => p.name === "Normal")?.state).toEqual({
      kind: "coupled",
      copyId: shown.id,
      sectionName: "Morning",
    });
  });

  it("falls back to the task's first plan, and has no sections when it is in none", () => {
    const f = fixture();
    expect(taskCouplingView(f.org, f.pint, f.camping.id).plan?.id).toBe(f.normal.id);
    const orphan = task({ section_id: testId() });
    const view = taskCouplingView({ ...f.org, tasks: [orphan] }, orphan, null);
    expect(view.plan).toBeNull();
    expect(view.sections).toEqual([]);
    expect(view.sectionName).toBe("");
  });

  it("coupledCount counts live copies in live sections only", () => {
    const f = fixture();
    expect(coupledCount(f.org, f.pint)).toBe(1);
    expect(coupledCount(f.org, f.loose)).toBe(0);
    const archived = { ...f.copy, archived_at: "2026-09-02T00:00:00.000Z" };
    expect(coupledCount({ ...f.org, tasks: [f.pint, archived] }, f.pint)).toBe(0);
  });
});

describe("sectionCouplingView", () => {
  it("marks the plans the section is coupled into", () => {
    const f = fixture();
    const view = sectionCouplingView(f.org, f.morning, f.travel.id);
    expect(view.plan?.id).toBe(f.travel.id);
    expect(view.plans.map((p) => [p.plan.name, p.coupled])).toEqual([
      ["Normal", true],
      ["Camping", false],
      ["Empty", false],
    ]);
    expect(sectionCouplingView(f.org, f.morning, null).plan?.id).toBe(f.normal.id);
    expect(sectionCouplingView(f.org, section(), null).plan).toBeNull();
  });
});

describe("staged summaries", () => {
  const place = (
    name: string,
    scope: TaskPlace["scope"],
    state: TaskPlace["state"],
  ): TaskPlace => ({
    id: testId(),
    name,
    scope,
    state,
  });

  it("says what a task change will do", () => {
    const copyIn = place("Camping", "plan", { kind: "off", landing: "Camp", bringBack: false });
    const section = place("Evening", "section", {
      kind: "off",
      landing: "Evening",
      bringBack: false,
    });
    const back = place("Travel", "plan", { kind: "off", landing: "Morning", bringBack: true });
    const coupled = place("Gym", "section", { kind: "coupled", copyId: "x", sectionName: "Gym" });
    const all = taskStagedSummary("Pint", [copyIn, section, back], [coupled]);
    expect(all.label).toBe("Couple to 3 · Decouple from 1");
    expect(all.undoable).toBe(true);
    expect(all.lines).toEqual([
      "Camping (Camp) and Evening get a coupled copy. Edits reach every copy; ticks stay separate.",
      "Pint comes back to Travel.",
      "Gym keeps its own Pint; later edits won't reach it.",
    ]);
    const one = taskStagedSummary("Pint", [section], []);
    expect(one.lines).toEqual([
      "Evening gets a coupled copy. Edits reach every copy; ticks stay separate.",
    ]);
    expect(taskStagedSummary("Pint", [], [coupled, coupled]).lines).toEqual([
      "Gym and Gym keep their own Pint; later edits won't reach them.",
    ]);
    expect(taskStagedSummary("Pint", [], []).label).toBe("");
  });

  it("says what a section change will do, and that a decouple can't be undone", () => {
    const f = fixture();
    const couple = sectionStagedSummary("Morning", [f.camping], []);
    expect(couple.label).toBe("Couple to 1");
    expect(couple.undoable).toBe(true);
    expect(couple.lines[0]).toContain("Morning and its tasks show in Camping too");
    const decouple = sectionStagedSummary("Morning", [], [f.travel, f.normal]);
    expect(decouple.label).toBe("Decouple from 2");
    expect(decouple.undoable).toBe(false);
    expect(decouple.lines[0]).toBe(
      "Morning stops being shared with Travel and Normal: each keeps its own copy and the ticks of the days it ran. This can't be undone.",
    );
  });
});
