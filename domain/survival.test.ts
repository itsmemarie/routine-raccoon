import { link, plan, section } from "@/tests/factories";
import {
  canDemotePlan,
  primaryPlan,
  primaryPlanOn,
  resolveCopyTarget,
  sectionsOfPlan,
  survivalPlanFor,
} from "./survival";

describe("survival plans", () => {
  const normal = plan({ kind: "primary" });
  const bad = plan({ kind: "survival", survival_level: 2, name: "Bad day" });
  const archived = plan({
    kind: "survival",
    survival_level: 3,
    archived_at: "2026-09-01T00:00:00Z",
  });

  it("finds the live plan for a level", () => {
    expect(survivalPlanFor([normal, bad, archived], 2)).toBe(bad);
    expect(survivalPlanFor([normal, bad, archived], 3)).toBeNull();
    expect(survivalPlanFor([normal], 1)).toBeNull();
  });

  it("finds the primary plan", () => {
    expect(primaryPlan([bad, normal])).toBe(normal);
    expect(primaryPlan([bad])).toBeNull();
  });

  it("finds the plan that was primary on a past day", () => {
    const first = plan({ kind: "custom", name: "First" });
    const second = plan({ kind: "custom", name: "Second" });
    const plans = [first, second, normal];
    const history = [
      { planId: first.id, until: "2026-09-05" },
      { planId: second.id, until: "2026-09-10" },
    ];
    expect(primaryPlanOn(plans, "2026-09-04", history)).toBe(first);
    expect(primaryPlanOn(plans, "2026-09-05", history)).toBe(second);
    expect(primaryPlanOn(plans, "2026-09-09", history)).toBe(second);
    expect(primaryPlanOn(plans, "2026-09-10", history)).toBe(normal);
    expect(primaryPlanOn(plans, "2026-09-04", [])).toBe(normal);
  });

  it("falls back to today's primary when the earlier plan was deleted", () => {
    const gone = plan({ kind: "custom", deleted_at: "2026-09-06T00:00:00Z" });
    const history = [{ planId: gone.id, until: "2026-09-05" }];
    expect(primaryPlanOn([gone, normal], "2026-09-04", history)).toBe(normal);
  });

  it("protects the primary plan", () => {
    expect(canDemotePlan(normal)).toBe(false);
    expect(canDemotePlan(bad)).toBe(true);
  });
});

describe("sectionsOfPlan", () => {
  it("orders by plan_sections.rank and skips deleted links and archived sections", () => {
    const p = plan();
    const a = section({ name: "A" });
    const b = section({ name: "B" });
    const c = section({ name: "C", archived_at: "2026-09-01T00:00:00Z" });
    const d = section({ name: "D" });
    const links = [
      link(p.id, b.id, "a1"),
      link(p.id, a.id, "a0"),
      link(p.id, c.id, "a2"),
      { ...link(p.id, d.id, "a3"), deleted_at: "2026-09-01T00:00:00Z" },
      link("other-plan", d.id, "a0"),
    ];
    expect(sectionsOfPlan(p.id, links, [a, b, c, d]).map((s) => s.name)).toEqual(["A", "B"]);
  });
});

describe("resolveCopyTarget (handoff: Task copies)", () => {
  const target = plan({ kind: "survival", survival_level: 1 });

  it("uses the section with the same name (case-insensitive)", () => {
    const first = section({ name: "Keep standing" });
    const evening = section({ name: "evening" });
    const links = [link(target.id, first.id, "a0"), link(target.id, evening.id, "a1")];
    expect(resolveCopyTarget("Evening", target.id, links, [first, evening])).toEqual({
      kind: "same-name",
      sectionId: evening.id,
    });
  });

  it("falls back to the plan's first section", () => {
    const first = section({ name: "Keep standing" });
    expect(resolveCopyTarget("Evening", target.id, [link(target.id, first.id)], [first])).toEqual({
      kind: "first-section",
      sectionId: first.id,
    });
  });

  it("asks to create a section named after the source when the plan has none", () => {
    expect(resolveCopyTarget("Evening", target.id, [], [])).toEqual({
      kind: "create-section",
      name: "Evening",
    });
  });
});
