import { compareRank } from "./rank";
import type { Task } from "./types";

/**
 * Task order per Day Plan. A section can sit in several plans, and each plan keeps its own order
 * of that section's tasks: `plan_ranks[planId]` when the plan has one, else the shared `rank`.
 * A plan gets its own keys the first time its order differs from the shared one (data/commands
 * `placeTask`), so most tasks only ever carry `rank`.
 */

type Ordered = Pick<Task, "id" | "rank"> & { readonly plan_ranks?: Task["plan_ranks"] };

/** A task's order key as `planId` shows it (no plan: the shared order). */
export function taskRankIn(task: Ordered, planId: string | null | undefined): string {
  return (planId ? task.plan_ranks?.[planId] : undefined) ?? task.rank;
}

/** Sort comparator for tasks of one section as `planId` shows them. */
export function compareTaskIn(planId: string | null | undefined) {
  return (a: Ordered, b: Ordered): number =>
    compareRank(
      { id: a.id, rank: taskRankIn(a, planId) },
      { id: b.id, rank: taskRankIn(b, planId) },
    );
}
