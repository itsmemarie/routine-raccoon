import {
  sectionCoupledCopy,
  sectionRemovedFromPlanCopy,
  taskCoupledCopy,
  taskDecoupledCopy,
} from "@/domain/log";
import { AppError } from "@/lib/errors/app-error";
import type { Result } from "@/lib/errors/result";
import type { CommandContext } from "./context";
import { linkSection, unlinkSection } from "./rows";
import { appendLog, runCommand } from "./run-command";
import { separateSectionRows } from "./sections";
import {
  currentDayKey,
  linksOfSection,
  nowIso,
  requirePlan,
  requireSection,
  requireTask,
  sectionNameOf,
  tasksInSection,
  touch,
} from "./shared";
import { copyTaskRows } from "./tasks";

/**
 * Coupling sheet commands ("Where {name} lives"). A task couples by getting a linked copy in
 * each place (domain/task-links); a section couples by being linked into more Day Plans
 * (plan_sections). Each runs as one transaction with its log entry, and returns what Undo needs.
 * @see docs/handoff/README.md "Coupling"
 */

/** What a coupling change wrote, so the toast's Undo can take it back. */
export interface CouplingUndo {
  readonly createdTaskIds: readonly string[];
  readonly createdSectionIds: readonly string[];
  readonly linksAdded: readonly (readonly [planId: string, sectionId: string])[];
  /** Task fields as they were before. */
  readonly restore: readonly {
    readonly id: string;
    readonly link_id: string | null;
    readonly excluded_plan_ids: readonly string[];
  }[];
}

/**
 * Couples `task` into other sections of its plan and other Day Plans (`couple`), and stops the
 * listed coupled copies sharing edits (`decouple`: copy ids, or the task's own id for "Edit only
 * here"). A decoupled copy stays where it is as its own task. When one copy is left alone in its
 * link, its link goes too, so the link glyph never counts zero others.
 */
export function applyTaskCoupling(
  ctx: CommandContext,
  input: {
    taskId: string;
    couple?: { sectionIds: readonly string[]; planIds: readonly string[] };
    decouple?: readonly string[];
    /** Names of the places, for the log line ("With Travel, Evening"). */
    placeNames?: { couple: readonly string[]; decouple: readonly string[] };
  },
): Promise<Result<{ undo: CouplingUndo; coupled: number; decoupled: number }, AppError>> {
  return runCommand(ctx, "applyTaskCoupling", async () => {
    const task = await requireTask(ctx, input.taskId);
    const restore = new Map<string, CouplingUndo["restore"][number]>();
    const remember = (row: { id: string; link_id: string | null; excluded_plan_ids: string[] }) => {
      if (!restore.has(row.id)) {
        restore.set(row.id, {
          id: row.id,
          link_id: row.link_id,
          excluded_plan_ids: [...row.excluded_plan_ids],
        });
      }
    };
    remember(task);
    const dayKey = await currentDayKey(ctx);

    const outcome = await copyTaskRows(ctx, task, dayKey, {
      sectionIds: input.couple?.sectionIds ?? [],
      planIds: input.couple?.planIds ?? [],
      coupled: true,
    });
    const linkId = (await requireTask(ctx, task.id)).link_id;

    let decoupled = 0;
    for (const id of new Set(input.decouple ?? [])) {
      const row = await ctx.db.tasks.get(id);
      if (!row || row.deleted_at !== null || row.link_id === null) continue;
      if (row.link_id !== linkId) {
        throw new AppError("RR-DB-005", { context: { entity: "coupled_task", id } });
      }
      remember(row);
      await ctx.db.tasks.update(id, { link_id: null, ...touch(ctx) });
      decoupled++;
    }
    // A link of one is no link.
    if (linkId !== null) {
      const members = (await ctx.db.tasks.where("link_id").equals(linkId).toArray()).filter(
        (t) => t.deleted_at === null,
      );
      if (members.length === 1 && members[0]) {
        remember(members[0]);
        await ctx.db.tasks.update(members[0].id, { link_id: null, ...touch(ctx) });
      }
    }

    const names = input.placeNames;
    const refs = { dayKey, taskId: task.id, sectionId: task.section_id };
    if (outcome.copyIds.length + outcome.broughtBack.length > 0) {
      await appendLog(ctx, taskCoupledCopy(task, names?.couple ?? outcome.copiedTo), refs);
    }
    if (decoupled > 0) {
      const places = names?.decouple ?? [await sectionNameOf(ctx, task.section_id)];
      await appendLog(ctx, taskDecoupledCopy(task, places), refs);
    }
    return {
      undo: {
        createdTaskIds: outcome.copyIds,
        createdSectionIds: outcome.sectionIds,
        linksAdded: [],
        restore: [...restore.values()],
      },
      coupled: outcome.copyIds.length + outcome.broughtBack.length,
      decoupled,
    };
  });
}

/**
 * Couples a section into more Day Plans (`couple`: the same section, so its tasks and ticks are
 * shared) and decouples it from others (`decouple`: each gets its own copy that keeps the ticks
 * of the days it ran; see `separateSectionRows`). `planId` is the plan the sheet was opened in.
 * Only a change without a decouple can be undone: a decouple moves history.
 */
export function applySectionCoupling(
  ctx: CommandContext,
  input: {
    sectionId: string;
    planId: string;
    couple?: readonly string[];
    decouple?: readonly string[];
  },
): Promise<Result<{ undo: CouplingUndo | null }, AppError>> {
  return runCommand(ctx, "applySectionCoupling", async () => {
    const section = await requireSection(ctx, input.sectionId);
    const dayKey = await currentDayKey(ctx);
    const linked = new Set((await linksOfSection(ctx, section.id)).map((l) => l.plan_id));
    const decouple = [...new Set(input.decouple ?? [])].filter((id) => id !== input.planId);
    if (decouple.length > 0 && decouple.length >= linked.size) throw new AppError("RR-VAL-007");

    const linksAdded: [string, string][] = [];
    const restore: CouplingUndo["restore"][number][] = [];
    const added: string[] = [];
    for (const planId of new Set(input.couple ?? [])) {
      if (linked.has(planId)) continue;
      const plan = await requirePlan(ctx, planId);
      await linkSection(ctx, plan.id, section.id);
      linksAdded.push([plan.id, section.id]);
      added.push(plan.name);
      // Coupling on purpose shows every task, even one once removed from this plan.
      for (const task of await tasksInSection(ctx, section.id)) {
        if (!task.excluded_plan_ids.includes(plan.id)) continue;
        restore.push({
          id: task.id,
          link_id: task.link_id,
          excluded_plan_ids: [...task.excluded_plan_ids],
        });
        await ctx.db.tasks.update(task.id, {
          excluded_plan_ids: task.excluded_plan_ids.filter((id) => id !== plan.id),
          ...touch(ctx),
        });
      }
    }
    if (added.length > 0) {
      await appendLog(ctx, sectionCoupledCopy(section.name, added), {
        dayKey,
        sectionId: section.id,
      });
    }
    // Decoupled from every other plan: this plan takes the copy, as Separate does, so the
    // others stay coupled with each other. Otherwise each decoupled plan takes its own copy.
    const now = new Set((await linksOfSection(ctx, section.id)).map((l) => l.plan_id));
    const leaving = decouple.filter((id) => now.has(id));
    const others = [...now].filter((id) => id !== input.planId);
    if (leaving.length > 0 && leaving.length === others.length && now.has(input.planId)) {
      await separateSectionRows(ctx, section, await requirePlan(ctx, input.planId));
    } else {
      for (const planId of leaving) {
        await separateSectionRows(ctx, section, await requirePlan(ctx, planId));
      }
    }
    return {
      undo:
        decouple.length === 0
          ? { createdTaskIds: [], createdSectionIds: [], linksAdded, restore }
          : null,
    };
  });
}

/** Undo for a coupling change: removes what it added and puts the changed fields back. */
export function revertCoupling(
  ctx: CommandContext,
  input: { undo: CouplingUndo },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "revertCoupling", async () => {
    const { undo } = input;
    for (const id of undo.createdTaskIds) {
      await ctx.db.tasks.update(id, { deleted_at: nowIso(ctx), ...touch(ctx) });
    }
    for (const id of undo.createdSectionIds) {
      for (const link of await linksOfSection(ctx, id)) {
        await unlinkSection(ctx, link.plan_id, id);
      }
      await ctx.db.sections.update(id, { deleted_at: nowIso(ctx), ...touch(ctx) });
    }
    for (const [planId, sectionId] of undo.linksAdded) {
      await unlinkSection(ctx, planId, sectionId);
      const plan = await ctx.db.day_plans.get(planId);
      const section = await ctx.db.sections.get(sectionId);
      if (plan && section) {
        await appendLog(ctx, sectionRemovedFromPlanCopy(section.name, plan.name), {
          dayKey: await currentDayKey(ctx),
          sectionId,
        });
      }
    }
    for (const row of undo.restore) {
      const live = await ctx.db.tasks.get(row.id);
      if (!live || live.deleted_at !== null) continue;
      await ctx.db.tasks.update(row.id, {
        link_id: row.link_id,
        excluded_plan_ids: [...row.excluded_plan_ids],
        ...touch(ctx),
      });
    }
  });
}
