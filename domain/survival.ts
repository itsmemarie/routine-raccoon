import { compareRank } from "./rank";
import {
  isActive,
  isLive,
  type DayPlan,
  type PlanSection,
  type Section,
  type SurvivalLevel,
} from "./types";

/**
 * Survival Mode plan rules.
 * @see docs/handoff/README.md "Survival copies" and "Today's plan picker"
 */

export const SURVIVAL_LEVELS: readonly SurvivalLevel[] = [1, 2, 3];

/** The live survival Day Plan for a level (levels are NOT cumulative: each has its own plan). */
export function survivalPlanFor(plans: readonly DayPlan[], level: SurvivalLevel): DayPlan | null {
  return (
    plans.find((p) => p.kind === "survival" && p.survival_level === level && isActive(p)) ?? null
  );
}

export function primaryPlan(plans: readonly DayPlan[]): DayPlan | null {
  return plans.find((p) => p.kind === "primary" && isLive(p)) ?? null;
}

/** Sections of a plan in plan order (plan_sections.rank), excluding deleted/archived. */
export function sectionsOfPlan(
  planId: string,
  planSections: readonly PlanSection[],
  sections: readonly Section[],
): Section[] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  return planSections
    .filter((ps) => ps.plan_id === planId && isLive(ps))
    .sort(compareRank)
    .map((ps) => byId.get(ps.section_id))
    .filter((s): s is Section => s !== undefined && isActive(s));
}

export type CopyTarget =
  | { readonly kind: "same-name"; readonly sectionId: string }
  | { readonly kind: "first-section"; readonly sectionId: string }
  | { readonly kind: "create-section"; readonly name: string };

/**
 * Where a task copied into a survival plan should land: the plan's section with the same name
 * as the source section; else the plan's first section; else a new section named after the source.
 */
export function resolveCopyTarget(
  sourceSectionName: string,
  planId: string,
  planSections: readonly PlanSection[],
  sections: readonly Section[],
): CopyTarget {
  const ordered = sectionsOfPlan(planId, planSections, sections);
  const wanted = sourceSectionName.trim().toLowerCase();
  const sameName = ordered.find((s) => s.name.trim().toLowerCase() === wanted);
  if (sameName) return { kind: "same-name", sectionId: sameName.id };
  const first = ordered[0];
  if (first) return { kind: "first-section", sectionId: first.id };
  return { kind: "create-section", name: sourceSectionName };
}

/** The primary plan can't be deleted, archived or turned into a survival plan (RR-VAL-005). */
export function canDemotePlan(plan: Pick<DayPlan, "kind">): boolean {
  return plan.kind !== "primary";
}
