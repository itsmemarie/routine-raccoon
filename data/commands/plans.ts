import type { LocalDayPlan } from "@/data/db/schema";
import {
  planAddedCopy,
  planArchivedCopy,
  planDeletedCopy,
  planDescribedCopy,
  planDuplicatedCopy,
  planPrimaryCopy,
  planRenamedCopy,
  planRestoredCopy,
  planSurvivalCopy,
} from "@/domain/log";
import { compareRank } from "@/domain/rank";
import { canDemotePlan, SURVIVAL_LEVELS } from "@/domain/survival";
import type { SurvivalLevel } from "@/domain/types";
import { AppError } from "@/lib/errors/app-error";
import type { Result } from "@/lib/errors/result";
import type { CommandContext } from "./context";
import { copySectionTasks, insertSection, sectionContent, unlinkSection } from "./rows";
import { appendLog, runCommand } from "./run-command";
import { deleteSectionRows } from "./sections";
import {
  currentDayKey,
  indexAfter,
  linksOfPlan,
  linksOfSection,
  newRowStamp,
  placeInOrder,
  readSettings,
  requireName,
  requirePlan,
  touch,
} from "./shared";
import { clampText, LIMITS } from "./validate";

/**
 * Day Plan commands (TECH_SPEC §2.5 "Plans").
 * Rules: exactly one primary; the primary can't be deleted, archived or made a survival plan
 * (RR-VAL-005); each survival level 1–3 has at most one plan.
 * @see docs/handoff/README.md "Day Plans (Settings)"
 */

async function liveOrderedPlans(ctx: CommandContext): Promise<LocalDayPlan[]> {
  return (await ctx.db.day_plans.toArray()).filter((p) => p.deleted_at === null).sort(compareRank);
}

function writePlanRank(ctx: CommandContext) {
  return (plan: LocalDayPlan, rank: string) =>
    ctx.db.day_plans.update(plan.id, { rank, ...touch(ctx) });
}

/** New regular (custom) Day Plan at the end of the list. */
export function createPlan(
  ctx: CommandContext,
  input: { name: string },
): Promise<Result<{ planId: string; name: string }, AppError>> {
  return runCommand(ctx, "createPlan", async () => {
    const name = requireName(input.name, LIMITS.name);
    const siblings = await liveOrderedPlans(ctx);
    const rank = await placeInOrder(ctx, siblings, siblings.length, writePlanRank(ctx));
    const plan: LocalDayPlan = {
      id: ctx.newId(),
      name,
      description: "",
      kind: "custom",
      survival_level: null,
      rank,
      archived_at: null,
      ...newRowStamp(ctx),
    };
    await ctx.db.day_plans.add(plan);
    await appendLog(ctx, planAddedCopy(name), { dayKey: await currentDayKey(ctx) });
    return { planId: plan.id, name };
  });
}

export function renamePlan(
  ctx: CommandContext,
  input: { planId: string; name: string },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "renamePlan", async () => {
    const plan = await requirePlan(ctx, input.planId);
    const name = requireName(input.name, LIMITS.name);
    if (name === plan.name) return;
    await ctx.db.day_plans.update(plan.id, { name, ...touch(ctx) });
    await appendLog(ctx, planRenamedCopy(plan.name, name), { dayKey: await currentDayKey(ctx) });
  });
}

export function setPlanDescription(
  ctx: CommandContext,
  input: { planId: string; description: string },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "setPlanDescription", async () => {
    const plan = await requirePlan(ctx, input.planId);
    const description = clampText(input.description, LIMITS.description);
    if (description === plan.description) return;
    await ctx.db.day_plans.update(plan.id, { description, ...touch(ctx) });
    await appendLog(ctx, planDescribedCopy(plan.name), { dayKey: await currentDayKey(ctx) });
  });
}

/** Makes a regular plan the primary one; the old primary becomes a regular plan. */
export function makePrimary(
  ctx: CommandContext,
  input: { planId: string },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "makePrimary", async () => {
    const plan = await requirePlan(ctx, input.planId);
    if (plan.kind === "primary") return;
    if (plan.kind === "survival" || plan.archived_at !== null) {
      throw new AppError("RR-VAL-008", { context: { kind: plan.kind } });
    }
    for (const other of await liveOrderedPlans(ctx)) {
      if (other.kind === "primary") {
        await ctx.db.day_plans.update(other.id, { kind: "custom", ...touch(ctx) });
      }
    }
    await ctx.db.day_plans.update(plan.id, { kind: "primary", ...touch(ctx) });
    await appendLog(ctx, planPrimaryCopy(plan.name), { dayKey: await currentDayKey(ctx) });
  });
}

/**
 * Adds a plan to / removes it from Survival Mode. Adding takes the lowest free level (1–3);
 * RR-VAL-009 when all three are taken. The primary plan can't join (RR-VAL-005).
 */
export function setSurvivalMembership(
  ctx: CommandContext,
  input: { planId: string; on: boolean },
): Promise<Result<{ level: SurvivalLevel | null }, AppError>> {
  return runCommand(ctx, "setSurvivalMembership", async () => {
    const plan = await requirePlan(ctx, input.planId);
    const settings = await readSettings(ctx);
    if (input.on) {
      if (plan.kind === "survival") return { level: plan.survival_level };
      if (!canDemotePlan(plan)) throw new AppError("RR-VAL-005");
      const taken = new Set(
        (await liveOrderedPlans(ctx))
          .filter((p) => p.kind === "survival" && p.archived_at === null)
          .map((p) => p.survival_level),
      );
      const level = SURVIVAL_LEVELS.find((l) => !taken.has(l));
      if (!level) throw new AppError("RR-VAL-009", { params: { name: settings.survivalName } });
      await ctx.db.day_plans.update(plan.id, {
        kind: "survival",
        survival_level: level,
        ...touch(ctx),
      });
      await appendLog(ctx, planSurvivalCopy(plan.name, settings.survivalName, true), {
        dayKey: await currentDayKey(ctx),
      });
      return { level };
    }
    if (plan.kind !== "survival") return { level: null };
    await ctx.db.day_plans.update(plan.id, { kind: "custom", survival_level: null, ...touch(ctx) });
    await appendLog(ctx, planSurvivalCopy(plan.name, settings.survivalName, false), {
      dayKey: await currentDayKey(ctx),
    });
    return { level: null };
  });
}

/**
 * Duplicate: "{name} copy" as a regular plan (a survival level has one plan), placed after the
 * original, with copies of its sections and their tasks.
 */
export function duplicatePlan(
  ctx: CommandContext,
  input: { planId: string },
): Promise<Result<{ planId: string }, AppError>> {
  return runCommand(ctx, "duplicatePlan", async () => {
    const plan = await requirePlan(ctx, input.planId);
    const siblings = await liveOrderedPlans(ctx);
    const rank = await placeInOrder(
      ctx,
      siblings,
      indexAfter(siblings, plan.id),
      writePlanRank(ctx),
    );
    const copy: LocalDayPlan = {
      id: ctx.newId(),
      name: `${plan.name} copy`.slice(0, LIMITS.name),
      description: plan.description,
      kind: "custom",
      survival_level: null,
      rank,
      archived_at: null,
      ...newRowStamp(ctx),
    };
    await ctx.db.day_plans.add(copy);
    for (const link of await linksOfPlan(ctx, plan.id)) {
      const section = await ctx.db.sections.get(link.section_id);
      if (!section || section.deleted_at !== null || section.archived_at !== null) continue;
      const sectionCopy = await insertSection(ctx, sectionContent(section), copy.id);
      await copySectionTasks(ctx, section.id, sectionCopy.id);
    }
    await appendLog(ctx, planDuplicatedCopy(plan.name), { dayKey: await currentDayKey(ctx) });
    return { planId: copy.id };
  });
}

/** Drag / ↑↓ in Settings: places the plan right after `afterPlanId` (null = first). */
export function reorderPlan(
  ctx: CommandContext,
  input: { planId: string; afterPlanId: string | null },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "reorderPlan", async () => {
    const plan = await requirePlan(ctx, input.planId);
    const others = (await liveOrderedPlans(ctx)).filter((p) => p.id !== plan.id);
    const rank = await placeInOrder(
      ctx,
      others,
      indexAfter(others, input.afterPlanId),
      writePlanRank(ctx),
    );
    if (rank !== plan.rank) await ctx.db.day_plans.update(plan.id, { rank, ...touch(ctx) });
  });
}

/** Archive keeps the plan, its sections and history; it just leaves the picker. */
export function archivePlan(
  ctx: CommandContext,
  input: { planId: string },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "archivePlan", async () => {
    const plan = await requirePlan(ctx, input.planId);
    if (!canDemotePlan(plan)) throw new AppError("RR-VAL-005");
    await ctx.db.day_plans.update(plan.id, {
      archived_at: ctx.now().toISOString(),
      ...touch(ctx),
    });
    await appendLog(ctx, planArchivedCopy(plan.name), { dayKey: await currentDayKey(ctx) });
  });
}

/**
 * Restore from Archive. A survival plan whose level was taken meanwhile comes back as a
 * regular plan rather than creating a second plan for that level.
 */
export function restorePlan(
  ctx: CommandContext,
  input: { planId: string },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "restorePlan", async () => {
    const plan = await requirePlan(ctx, input.planId);
    const levelTaken =
      plan.kind === "survival" &&
      (await liveOrderedPlans(ctx)).some(
        (p) =>
          p.id !== plan.id &&
          p.kind === "survival" &&
          p.archived_at === null &&
          p.survival_level === plan.survival_level,
      );
    await ctx.db.day_plans.update(plan.id, {
      archived_at: null,
      ...(levelTaken ? { kind: "custom" as const, survival_level: null } : {}),
      ...touch(ctx),
    });
    await appendLog(ctx, planRestoredCopy(plan.name), { dayKey: await currentDayKey(ctx) });
  });
}

/**
 * Delete for good (soft delete): the plan and its links go; sections that were only in this
 * plan go with their tasks. Sections shared with other plans stay there.
 */
export function deletePlan(
  ctx: CommandContext,
  input: { planId: string },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "deletePlan", async () => {
    const plan = await requirePlan(ctx, input.planId);
    if (!canDemotePlan(plan)) throw new AppError("RR-VAL-005");
    for (const link of await linksOfPlan(ctx, plan.id)) {
      const others = (await linksOfSection(ctx, link.section_id)).filter(
        (l) => l.plan_id !== plan.id,
      );
      const section = await ctx.db.sections.get(link.section_id);
      if (others.length === 0 && section && section.deleted_at === null) {
        await deleteSectionRows(ctx, section);
      } else {
        await unlinkSection(ctx, plan.id, link.section_id);
      }
    }
    await ctx.db.day_plans.update(plan.id, { deleted_at: ctx.now().toISOString(), ...touch(ctx) });
    await appendLog(ctx, planDeletedCopy(plan.name), { dayKey: await currentDayKey(ctx) });
  });
}
