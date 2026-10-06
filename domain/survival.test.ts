import { link, plan, section } from "@/tests/factories";
import {
  canDemotePlan,
  primaryPlan,
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

describe("resolveCopyTarget (handoff: Survival copies)", () => {
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
