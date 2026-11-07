import { compareRank } from "./rank";
import {
  isActive,
  isLive,
  isTaskInPlan,
  type DayPlan,
  type PlanSection,
  type Section,
  type Task,
} from "./types";

/**
 * Selectors for the organising screens: Settings → Day Plans, Sections manager, Archive, the
 * task/section forms and the copy/move sheet. Pure; fed by one live read of the definitions.
 */

export interface Organisation {
  readonly plans: readonly DayPlan[];
  readonly planSections: readonly PlanSection[];
  readonly sections: readonly Section[];
  readonly tasks: readonly Task[];
}

/** Live, non-archived plans in the user's order. */
export function activePlans(org: Organisation): DayPlan[] {
  return org.plans.filter(isActive).sort(compareRank);
}

/** Live links of a plan in plan order. */
export function linksOfPlan(org: Organisation, planId: string): PlanSection[] {
  return org.planSections.filter((l) => l.plan_id === planId && isLive(l)).sort(compareRank);
}

/**
 * Live tasks of a section in order (archived tasks excluded). Pass `planId` to get the section as
 * that plan shows it, without the tasks removed from that plan.
 */
export function tasksOfSection(org: Organisation, sectionId: string, planId?: string): Task[] {
  return org.tasks
    .filter(
      (t) =>
        t.section_id === sectionId &&
        isActive(t) &&
        (planId === undefined || isTaskInPlan(t, planId)),
    )
    .sort(compareRank);
}

export interface SectionRow {
  readonly section: Section;
  readonly taskCount: number;
  /** Sum of its tasks' full minutes ("25m from tasks"). */
  readonly minutesFromTasks: number;
  /** Other live plans the section also sits in. */
  readonly alsoIn: readonly DayPlan[];
}

/** Sections of a plan for the Sections manager / Today menus (live, not archived). */
export function sectionRows(org: Organisation, planId: string): SectionRow[] {
  const byId = new Map(org.sections.map((s) => [s.id, s]));
  return linksOfPlan(org, planId).flatMap((link) => {
    const section = byId.get(link.section_id);
    if (!section || !isActive(section)) return [];
    const tasks = tasksOfSection(org, section.id, planId);
    return [
      {
        section,
        taskCount: tasks.length,
        minutesFromTasks: tasks.reduce((sum, t) => sum + t.minutes, 0),
        alsoIn: plansOfSection(org, section.id).filter((p) => p.id !== planId),
      },
    ];
  });
}

/** Live plans (archived included) a section is linked into, in plan order. */
export function plansOfSection(org: Organisation, sectionId: string): DayPlan[] {
  const planIds = new Set(
    org.planSections.filter((l) => l.section_id === sectionId && isLive(l)).map((l) => l.plan_id),
  );
  return org.plans.filter((p) => planIds.has(p.id) && isLive(p)).sort(compareRank);
}

/** Live plans (archived included) a task shows in: its section's, minus any it was removed from. */
export function plansOfTask(org: Organisation, task: Task): DayPlan[] {
  return plansOfSection(org, task.section_id).filter((p) => isTaskInPlan(task, p.id));
}

const nameKey = (name: string) => name.trim().toLowerCase();

/**
 * Separate rows that are this same task in the user's other plans: copies made by "Also add to",
 * Copy to Day Plan or duplicating a section. Copies are independent rows, so the name is the only
 * link, and a name alone proves nothing: people keep a same-named task twice on
 * purpose (a morning and an evening "Tidy kitchen"). So a row only counts when it shares no plan
 * with this task and no other candidate shares a plan with it, which would make it ambiguous.
 * @see docs/handoff/README.md "Deleting a task that's in several plans"
 */
export function copiesOfTask(org: Organisation, task: Task): Task[] {
  const own = new Set(plansOfTask(org, task).map((p) => p.id));
  if (own.size === 0) return [];
  const wanted = nameKey(task.name);
  const liveSections = new Set(org.sections.filter(isActive).map((s) => s.id));
  const candidates = org.tasks.flatMap((other) => {
    if (other.id === task.id || !isActive(other) || !liveSections.has(other.section_id)) return [];
    if (nameKey(other.name) !== wanted) return [];
    const planIds = plansOfTask(org, other).map((p) => p.id);
    return planIds.length > 0 && !planIds.some((id) => own.has(id))
      ? [{ row: other, planIds }]
      : [];
  });
  return candidates
    .filter(
      (c) => !candidates.some((o) => o !== c && o.planIds.some((id) => c.planIds.includes(id))),
    )
    .map((c) => c.row);
}

export interface TaskPlacement {
  /** The plan "Only from {plan}" acts on: today's plan when the task is in it, else its first. */
  readonly current: DayPlan | null;
  /** Every plan showing the task, itself or through a copy, in plan order. */
  readonly plans: readonly DayPlan[];
  /** The separate rows behind `plans` (see copiesOfTask). */
  readonly copies: readonly Task[];
}

/** Where a task is, for the delete choice. `todayPlanId` is the plan Today shows. */
export function taskPlacement(
  org: Organisation,
  task: Task,
  todayPlanId: string | null,
): TaskPlacement {
  const own = plansOfTask(org, task);
  const copies = copiesOfTask(org, task);
  const everywhere = [...own, ...copies.flatMap((copy) => plansOfTask(org, copy))];
  return {
    current: own.find((p) => p.id === todayPlanId) ?? own.find(isActive) ?? own[0] ?? null,
    plans: [...new Map(everywhere.map((p) => [p.id, p])).values()].sort(compareRank),
    copies,
  };
}

/**
 * A task moved to another section stays out of the plans it was removed from, unless that would
 * leave it in no plan at all and so make it vanish.
 */
export function exclusionsAfterMove(
  excluded: readonly string[],
  targetPlanIds: readonly string[],
): string[] {
  return targetPlanIds.some((id) => !excluded.includes(id)) ? [...excluded] : [];
}

export interface PlanCard {
  readonly plan: DayPlan;
  readonly sectionCount: number;
  readonly taskCount: number;
}

/** Settings → Day Plans cards: live, non-archived plans with their counts. */
export function planCards(org: Organisation): PlanCard[] {
  return activePlans(org).map((plan) => {
    const rows = sectionRows(org, plan.id);
    return {
      plan,
      sectionCount: rows.length,
      taskCount: rows.reduce((sum, r) => sum + r.taskCount, 0),
    };
  });
}

export interface ArchivedPlan {
  readonly plan: DayPlan;
  readonly sectionCount: number;
  readonly taskCount: number;
}

export interface ArchivedSection {
  readonly section: Section;
  /** Plans it was in, for "From Normal". */
  readonly planNames: readonly string[];
}

/** Most recently archived first. */
function newestFirst(a: { at: string }, b: { at: string }): number {
  return a.at < b.at ? 1 : a.at > b.at ? -1 : 0;
}

export function archivedPlans(org: Organisation): ArchivedPlan[] {
  return org.plans
    .flatMap((plan) =>
      isLive(plan) && plan.archived_at !== null ? [{ plan, at: plan.archived_at }] : [],
    )
    .sort(newestFirst)
    .map(({ plan }) => {
      const sectionIds = linksOfPlan(org, plan.id).map((l) => l.section_id);
      const sections = org.sections.filter((s) => sectionIds.includes(s.id) && isLive(s));
      return {
        plan,
        sectionCount: sections.length,
        taskCount: sections.reduce((sum, s) => sum + tasksOfSection(org, s.id, plan.id).length, 0),
      };
    });
}

export function archivedSections(org: Organisation): ArchivedSection[] {
  return org.sections
    .flatMap((section) =>
      isLive(section) && section.archived_at !== null ? [{ section, at: section.archived_at }] : [],
    )
    .sort(newestFirst)
    .map(({ section }) => ({
      section,
      planNames: plansOfSection(org, section.id).map((p) => p.name),
    }));
}

export interface SectionChoice {
  readonly section: Section;
  readonly plan: DayPlan;
}

/** Every live section in every active plan ("{section} · {plan}" chips on the move sheet). */
export function allSectionChoices(org: Organisation): SectionChoice[] {
  return activePlans(org).flatMap((plan) =>
    sectionRows(org, plan.id).map((row) => ({ section: row.section, plan })),
  );
}

/**
 * Other plans holding a task with the same name ("Also in" on Task detail). Copies are
 * independent rows, so the name is the link the user recognises. Plans the task itself sits in
 * don't count, so a copy in another section of the same plan never lists that plan.
 */
export function otherPlansWithTask(org: Organisation, task: Task): DayPlan[] {
  const wanted = task.name.trim().toLowerCase();
  const own = new Set(plansOfSection(org, task.section_id).map((plan) => plan.id));
  return activePlans(org).filter(
    (plan) =>
      !own.has(plan.id) &&
      sectionRows(org, plan.id).some((row) =>
        tasksOfSection(org, row.section.id, plan.id).some(
          (t) => t.id !== task.id && t.name.trim().toLowerCase() === wanted,
        ),
      ),
  );
}

/** The plan a section is shown under when there's no other context: its first plan. */
export function homePlanOf(org: Organisation, sectionId: string): DayPlan | null {
  return plansOfSection(org, sectionId).find(isActive) ?? null;
}
