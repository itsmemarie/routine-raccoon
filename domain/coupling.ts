import {
  activePlans,
  plansOfSection,
  plansOfTask,
  sectionRows,
  type Organisation,
} from "./organise";
import { resolveCopyTarget } from "./survival";
import { linkedCopies } from "./task-links";
import { isActive, type DayPlan, type Section, type Task } from "./types";

/**
 * The Coupling sheet ("Where {name} lives"): every place a task or section could live, and how it
 * lives there. Pure view model plus the wording of a staged change.
 * @see docs/handoff/README.md "Coupling"
 */

export type TaskPlaceState =
  /** A coupled copy lives here. */
  | { readonly kind: "coupled"; readonly copyId: string; readonly sectionName: string }
  /** The task itself shows here because its section is coupled into this plan. */
  | { readonly kind: "through"; readonly sectionName: string }
  /** Not here. Coupling lands in `landing`; `bringBack`: the task was removed from this plan. */
  | { readonly kind: "off"; readonly landing: string; readonly bringBack: boolean };

export interface TaskPlace {
  /** A section id (scope "section") or a plan id (scope "plan"). */
  readonly id: string;
  readonly scope: "section" | "plan";
  readonly name: string;
  readonly state: TaskPlaceState;
}

export interface TaskCouplingView {
  readonly task: Task;
  readonly plan: DayPlan | null;
  readonly sectionName: string;
  /** Other sections of this Day Plan. */
  readonly sections: readonly TaskPlace[];
  /** Other Day Plans. */
  readonly plans: readonly TaskPlace[];
  /** Live coupled copies, wherever they are. */
  readonly copyCount: number;
}

function liveCopies(org: Organisation, task: Task): Task[] {
  const live = new Set(org.sections.filter(isActive).map((s) => s.id));
  return linkedCopies(org.tasks, task).filter((t) => isActive(t) && live.has(t.section_id));
}

/** How many other places share this task's edits (the link glyph's count). */
export function coupledCount(org: Organisation, task: Task): number {
  return task.link_id === null ? 0 : liveCopies(org, task).length;
}

/**
 * `planId` is the plan on screen. When the task isn't in it, the task's first plan stands in.
 */
export function taskCouplingView(
  org: Organisation,
  task: Task,
  planId: string | null,
): TaskCouplingView {
  const own = plansOfTask(org, task);
  const plan = own.find((p) => p.id === planId) ?? own.find(isActive) ?? own[0] ?? null;
  const sectionsById = new Map(org.sections.map((s) => [s.id, s]));
  const sectionName = sectionsById.get(task.section_id)?.name ?? "";
  const copies = liveCopies(org, task);
  const copiesIn = (p: DayPlan) =>
    copies.filter((c) => plansOfTask(org, c).some((x) => x.id === p.id));

  const sections: TaskPlace[] = plan
    ? sectionRows(org, plan.id)
        .filter((row) => row.section.id !== task.section_id)
        .map(({ section }) => {
          const copy = copiesIn(plan).find((c) => c.section_id === section.id);
          return {
            id: section.id,
            scope: "section" as const,
            name: section.name,
            state: copy
              ? { kind: "coupled" as const, copyId: copy.id, sectionName: section.name }
              : { kind: "off" as const, landing: section.name, bringBack: false },
          };
        })
    : [];

  const plans: TaskPlace[] = activePlans(org)
    .filter((p) => p.id !== plan?.id)
    .map((p) => {
      const place = { id: p.id, scope: "plan" as const, name: p.name };
      if (own.some((x) => x.id === p.id)) {
        return { ...place, state: { kind: "through" as const, sectionName } };
      }
      const copy = copiesIn(p)[0];
      if (copy) {
        const name = sectionsById.get(copy.section_id)?.name ?? "";
        return {
          ...place,
          state: { kind: "coupled" as const, copyId: copy.id, sectionName: name },
        };
      }
      if (plansOfSection(org, task.section_id).some((x) => x.id === p.id)) {
        return { ...place, state: { kind: "off" as const, landing: sectionName, bringBack: true } };
      }
      const target = resolveCopyTarget(sectionName, p.id, org.planSections, org.sections);
      const landing =
        target.kind === "create-section"
          ? `New section ${sectionName}`
          : (sectionsById.get(target.sectionId)?.name ?? sectionName);
      return { ...place, state: { kind: "off" as const, landing, bringBack: false } };
    });

  return { task, plan, sectionName, sections, plans, copyCount: copies.length };
}

export interface SectionPlace {
  readonly plan: DayPlan;
  readonly coupled: boolean;
}

export interface SectionCouplingView {
  readonly section: Section;
  readonly plan: DayPlan | null;
  readonly plans: readonly SectionPlace[];
}

export function sectionCouplingView(
  org: Organisation,
  section: Section,
  planId: string | null,
): SectionCouplingView {
  const linked = plansOfSection(org, section.id);
  const plan = linked.find((p) => p.id === planId) ?? linked.find(isActive) ?? null;
  return {
    section,
    plan,
    plans: activePlans(org)
      .filter((p) => p.id !== plan?.id)
      .map((p) => ({ plan: p, coupled: linked.some((x) => x.id === p.id) })),
  };
}

const list = (names: readonly string[]) =>
  new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" }).format(names);

export interface StagedSummary {
  /** The footer button, e.g. "Couple to 2 · Decouple from 1". Empty when nothing is staged. */
  readonly label: string;
  /** What will happen, one sentence per kind of change. */
  readonly lines: readonly string[];
  /** False when part of the change can't be undone (a section decouple moves history). */
  readonly undoable: boolean;
}

function label(couple: number, decouple: number): string {
  return [couple > 0 ? `Couple to ${couple}` : "", decouple > 0 ? `Decouple from ${decouple}` : ""]
    .filter(Boolean)
    .join(" · ");
}

/** Wording for a staged change on a task's sheet. */
export function taskStagedSummary(
  taskName: string,
  couple: readonly TaskPlace[],
  decouple: readonly TaskPlace[],
): StagedSummary {
  const lines: string[] = [];
  const copies = couple.filter((p) => p.state.kind === "off" && !p.state.bringBack);
  const back = couple.filter((p) => p.state.kind === "off" && p.state.bringBack);
  if (copies.length > 0) {
    const where = copies.map((p) =>
      p.scope === "plan" && p.state.kind === "off" ? `${p.name} (${p.state.landing})` : p.name,
    );
    lines.push(
      `${list(where)} ${copies.length === 1 ? "gets" : "get"} a coupled copy. Edits reach every copy; ticks stay separate.`,
    );
  }
  if (back.length > 0) lines.push(`${taskName} comes back to ${list(back.map((p) => p.name))}.`);
  if (decouple.length > 0) {
    lines.push(
      `${list(decouple.map((p) => p.name))} ${decouple.length === 1 ? "keeps its" : "keep their"} own ${taskName}; later edits won't reach ${decouple.length === 1 ? "it" : "them"}.`,
    );
  }
  return { label: label(couple.length, decouple.length), lines, undoable: true };
}

/** Wording for a staged change on a section's sheet. */
export function sectionStagedSummary(
  sectionName: string,
  couple: readonly DayPlan[],
  decouple: readonly DayPlan[],
): StagedSummary {
  const lines: string[] = [];
  if (couple.length > 0) {
    lines.push(
      `${sectionName} and its tasks show in ${list(couple.map((p) => p.name))} too. It's one section, so ticks are shared: only one Day Plan runs each day.`,
    );
  }
  if (decouple.length > 0) {
    lines.push(
      `${sectionName} stops being shared with ${list(decouple.map((p) => p.name))}: each keeps its own copy and the ticks of the days it ran. This can't be undone.`,
    );
  }
  return {
    label: label(couple.length, decouple.length),
    lines,
    undoable: decouple.length === 0,
  };
}
