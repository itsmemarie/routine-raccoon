import { compareRank } from "./rank";
import { isActive, isLive, type DayPlan, type PlanSection, type Section, type Task } from "./types";

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

/** Live tasks of a section in order (archived tasks excluded). */
export function tasksOfSection(org: Organisation, sectionId: string): Task[] {
  return org.tasks.filter((t) => t.section_id === sectionId && isActive(t)).sort(compareRank);
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
    const tasks = tasksOfSection(org, section.id);
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
        taskCount: sections.reduce((sum, s) => sum + tasksOfSection(org, s.id).length, 0),
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
 * Survival plans holding a task with the same name ("Also in" on Task detail). Copies are
 * independent rows, so the name is the link the user recognises.
 */
export function survivalPlansWithTask(org: Organisation, task: Task): DayPlan[] {
  const wanted = task.name.trim().toLowerCase();
  return activePlans(org).filter(
    (plan) =>
      plan.kind === "survival" &&
      sectionRows(org, plan.id).some((row) =>
        tasksOfSection(org, row.section.id).some(
          (t) => t.id !== task.id && t.name.trim().toLowerCase() === wanted,
        ),
      ),
  );
}

/** The plan a section is shown under when there's no other context: its first plan. */
export function homePlanOf(org: Organisation, sectionId: string): DayPlan | null {
  return plansOfSection(org, sectionId).find(isActive) ?? null;
}
