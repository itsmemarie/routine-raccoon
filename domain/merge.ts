import { SURVIVAL_LEVELS } from "./survival";
import { isLive, type DayPlan } from "./types";

/**
 * "Two copies of your day" → Combine them (TECH_SPEC §2.6): union by id, then fix the plans
 * that may exist only once. There is one primary plan and one plan per survival level, so when
 * both copies have one, the saved (server) copy's plan is kept and the phone's plan hands its
 * sections over, then goes.
 *
 * @param localPlanIds Plan ids that were on the phone before the server copy was pulled in.
 */
export interface PlanFix {
  /** The phone's plan to retire. */
  readonly drop: string;
  /** The saved copy's plan that takes over its sections. */
  readonly keep: string;
}

export function planFixesAfterCombine(
  plans: readonly DayPlan[],
  localPlanIds: ReadonlySet<string>,
): PlanFix[] {
  const live = plans.filter((p) => isLive(p) && p.archived_at === null);
  const fixes: PlanFix[] = [];
  const resolve = (group: readonly DayPlan[]) => {
    const server = group.filter((p) => !localPlanIds.has(p.id));
    const local = group.filter((p) => localPlanIds.has(p.id));
    const keep = server[0];
    if (!keep) return;
    for (const plan of local) fixes.push({ drop: plan.id, keep: keep.id });
  };
  resolve(live.filter((p) => p.kind === "primary"));
  for (const level of SURVIVAL_LEVELS) {
    resolve(live.filter((p) => p.kind === "survival" && p.survival_level === level));
  }
  return fixes;
}
