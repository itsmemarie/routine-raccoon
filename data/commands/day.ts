import { readKv, writeKv } from "@/data/db/kv";
import { readDayInput } from "@/data/db/queries";
import type { LocalDayRecord } from "@/data/db/schema";
import { carryOverTaskIds, isLaterDay, nextDayRecordPatch } from "@/domain/day";
import { displayMinutes } from "@/domain/duration";
import {
  closedCopy,
  completedCopy,
  planPickedCopy,
  skippedCopy,
  uncompletedCopy,
} from "@/domain/log";
import { primaryPlan, survivalPlanFor } from "@/domain/survival";
import { daysBetween } from "@/domain/time";
import { summariseDay } from "@/domain/today";
import type { DayKey, SurvivalLevel } from "@/domain/types";
import { AppError } from "@/lib/errors/app-error";
import type { Result } from "@/lib/errors/result";
import type { CommandContext } from "./context";
import { appendLog, runCommand } from "./run-command";
import {
  findOccurrence,
  nowIso,
  readSettings,
  requireTask,
  sectionNameOf,
  writeOccurrence,
} from "./shared";

/**
 * Day commands: tick, untick, skip, steps, plan picks, close and rollover. Each is one
 * transaction with its log entry.
 * @see docs/handoff/README.md "Tick, undo, day complete", "Today's plan picker", "Regeneration"
 */

/** Tick: mark done, credit the displayed minutes (shrunk in Survival Mode), log `completed`. */
export function tickTask(
  ctx: CommandContext,
  input: { taskId: string; dayKey: DayKey },
): Promise<Result<{ occurrenceId: string }, AppError>> {
  return runCommand(ctx, "tickTask", async () => {
    const task = await requireTask(ctx, input.taskId);
    const record = await ctx.db.day_records.get(input.dayKey);
    const survivalOn = (record?.deleted_at === null && record.survival_on) || false;
    const minutes = displayMinutes(task, survivalOn);
    const row = await writeOccurrence(ctx, task.id, input.dayKey, {
      status: "done",
      completed_at: nowIso(ctx),
      minutes_credited: minutes,
      survival_level_at_completion: survivalOn ? (record?.survival_level ?? null) : null,
    });
    await appendLog(ctx, completedCopy(task, await sectionNameOf(ctx, task.section_id), minutes), {
      dayKey: input.dayKey,
      taskId: task.id,
      sectionId: task.section_id,
    });
    return { occurrenceId: row.id };
  });
}

/** Undo / un-tick: back to pending, log `uncompleted`. Subtask ticks are kept. */
export function untickTask(
  ctx: CommandContext,
  input: { taskId: string; dayKey: DayKey },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "untickTask", async () => {
    const task = await requireTask(ctx, input.taskId);
    await writeOccurrence(ctx, task.id, input.dayKey, {
      status: "pending",
      completed_at: null,
      minutes_credited: null,
      survival_level_at_completion: null,
    });
    await appendLog(ctx, uncompletedCopy(task, await sectionNameOf(ctx, task.section_id)), {
      dayKey: input.dayKey,
      taskId: task.id,
      sectionId: task.section_id,
    });
  });
}

/** Skip today: hidden from Today until the next day; feeds "Skipped N days running". */
export function skipTaskToday(
  ctx: CommandContext,
  input: { taskId: string; dayKey: DayKey },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "skipTaskToday", async () => {
    const task = await requireTask(ctx, input.taskId);
    await writeOccurrence(ctx, task.id, input.dayKey, {
      status: "skipped",
      completed_at: null,
      minutes_credited: null,
    });
    await appendLog(ctx, skippedCopy(task, await sectionNameOf(ctx, task.section_id)), {
      dayKey: input.dayKey,
      taskId: task.id,
      sectionId: task.section_id,
    });
  });
}

/**
 * Ticks or unticks one step for the day. Steps reset daily because they live on the day's
 * occurrence. Ticking every step does NOT complete the task (handoff). Not logged.
 */
export function toggleStep(
  ctx: CommandContext,
  input: { taskId: string; dayKey: DayKey; stepId: string; checked: boolean },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "toggleStep", async () => {
    const task = await requireTask(ctx, input.taskId);
    const existing = await findOccurrence(ctx, task.id, input.dayKey);
    const current = new Set(existing?.checked_step_ids ?? []);
    if (input.checked) current.add(input.stepId);
    else current.delete(input.stepId);
    await writeOccurrence(ctx, task.id, input.dayKey, { checked_step_ids: [...current] });
  });
}

async function upsertDayRecord(
  ctx: CommandContext,
  dayKey: DayKey,
  patch: Partial<Pick<LocalDayRecord, "survival_on" | "survival_level" | "plan_id" | "closed_at">>,
  defaultLevel: SurvivalLevel,
): Promise<void> {
  const at = nowIso(ctx);
  const existing = await ctx.db.day_records.get(dayKey);
  await ctx.db.day_records.put({
    day_key: dayKey,
    survival_on: false,
    survival_level: defaultLevel,
    closed_at: null,
    plan_id: null,
    created_at: at,
    ...existing,
    deleted_at: null,
    ...patch,
    updated_at: at,
    _dirty: 1,
  });
}

/** Picks a regular Day Plan: Survival off, plan selected for today (primary stored as null). */
export function pickPlan(
  ctx: CommandContext,
  input: { dayKey: DayKey; planId: string },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "pickPlan", async () => {
    const plans = await ctx.db.day_plans.toArray();
    const plan = plans.find(
      (p) => p.id === input.planId && p.deleted_at === null && p.archived_at === null,
    );
    if (!plan || plan.kind === "survival") {
      throw new AppError("RR-DB-005", { context: { entity: "day_plan", planId: input.planId } });
    }
    const settings = await readSettings(ctx);
    const isPrimary = primaryPlan(plans)?.id === plan.id;
    await upsertDayRecord(
      ctx,
      input.dayKey,
      { survival_on: false, plan_id: isPrimary ? null : plan.id },
      settings.defaultLevel,
    );
    await appendLog(
      ctx,
      planPickedCopy(plan.name, { survival: false, survivalName: settings.survivalName }),
      { dayKey: input.dayKey },
    );
  });
}

async function applySurvivalLevel(
  ctx: CommandContext,
  dayKey: DayKey,
  level: SurvivalLevel,
): Promise<void> {
  const plans = await ctx.db.day_plans.toArray();
  const plan = survivalPlanFor(plans, level);
  if (!plan) throw new AppError("RR-DB-005", { context: { entity: "survival_plan", level } });
  const settings = await readSettings(ctx);
  await upsertDayRecord(
    ctx,
    dayKey,
    { survival_on: true, survival_level: level },
    settings.defaultLevel,
  );
  await appendLog(
    ctx,
    planPickedCopy(plan.name, { survival: true, survivalName: settings.survivalName }),
    { dayKey },
  );
}

/** Picks a survival level: Today switches to that level's own plan, shrunk. */
export function pickSurvivalLevel(
  ctx: CommandContext,
  input: { dayKey: DayKey; level: SurvivalLevel },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "pickSurvivalLevel", () =>
    applySurvivalLevel(ctx, input.dayKey, input.level),
  );
}

/**
 * The Settings master switch. On: Survival Mode at the default level (handoff "Prototype vs
 * spec": not the current level). Off: back to the day's regular plan.
 */
export function setSurvivalMode(
  ctx: CommandContext,
  input: { dayKey: DayKey; on: boolean },
): Promise<Result<void, AppError>> {
  if (input.on) {
    return runCommand(ctx, "setSurvivalOn", async () => {
      const settings = await readSettings(ctx);
      await applySurvivalLevel(ctx, input.dayKey, settings.defaultLevel);
    });
  }
  return runCommand(ctx, "setSurvivalOff", async () => {
    const record = await ctx.db.day_records.get(input.dayKey);
    if (!record?.survival_on) return;
    const settings = await readSettings(ctx);
    const plans = await ctx.db.day_plans.toArray();
    const base =
      plans.find((p) => p.id === record.plan_id && p.deleted_at === null) ?? primaryPlan(plans);
    await upsertDayRecord(ctx, input.dayKey, { survival_on: false }, settings.defaultLevel);
    await appendLog(
      ctx,
      planPickedCopy(base?.name ?? "the full day", {
        survival: false,
        survivalName: settings.survivalName,
      }),
      { dayKey: input.dayKey },
    );
  });
}

/**
 * Close the day (Day complete): records it, logs "{ticked} of {total} ticked", and makes the
 * app move on to the next day's fresh list (see domain/day.ts effectiveDayKey).
 */
export function closeDay(
  ctx: CommandContext,
  input: { dayKey: DayKey },
): Promise<Result<{ ticked: number; total: number }, AppError>> {
  return runCommand(ctx, "closeDay", async () => {
    const day = await readDayInput(ctx.db, input.dayKey);
    const summary = summariseDay(day);
    await upsertDayRecord(ctx, input.dayKey, { closed_at: nowIso(ctx) }, day.settings.defaultLevel);
    await appendLog(ctx, closedCopy(summary.ticked, summary.total), { dayKey: input.dayKey });
    return { ticked: summary.ticked, total: summary.total };
  });
}

/**
 * Runs when the app first shows a new day (start, resume, reset time, Close the day). Once per
 * day per device; idempotent across devices because carried occurrences have deterministic ids.
 * - Survival Mode carries over only with "Keep Survival Mode on after the day resets".
 * - With "Roll unfinished tasks over", yesterday's open tasks are carried into today.
 */
export function rolloverDay(
  ctx: CommandContext,
  input: { toDayKey: DayKey },
): Promise<Result<{ from: DayKey | null; carried: number }, AppError>> {
  return runCommand(ctx, "rolloverDay", async () => {
    const last = await readKv(ctx.db, "last_day_key");
    await writeKv(ctx.db, "last_day_key", input.toDayKey);
    if (!last || !isLaterDay(last, input.toDayKey)) return { from: last, carried: 0 };

    const settings = await readSettings(ctx);
    const previous = await readDayInput(ctx.db, last);
    const patch = nextDayRecordPatch(previous.dayRecord, settings);
    if (patch && !(await ctx.db.day_records.get(input.toDayKey))) {
      await upsertDayRecord(ctx, input.toDayKey, patch, settings.defaultLevel);
    }

    // Carry only from the day directly before: after days away, an old list is not "yesterday".
    let carried = 0;
    if (settings.roll && daysBetween(last, input.toDayKey) === 1) {
      const next = await readDayInput(ctx.db, input.toDayKey);
      for (const taskId of carryOverTaskIds(previous, next)) {
        if (await findOccurrence(ctx, taskId, input.toDayKey)) continue;
        await writeOccurrence(ctx, taskId, input.toDayKey, { carried_from_day_key: last });
        carried++;
      }
    }
    return { from: last, carried };
  });
}

/** Hides the "Which kind of day is it?" box for the rest of the day (device only). */
export function dismissDayPrompt(
  ctx: CommandContext,
  input: { dayKey: DayKey },
): Promise<Result<void, AppError>> {
  return runCommand(
    ctx,
    "dismissDayPrompt",
    () => writeKv(ctx.db, "day_prompt_dismissed", input.dayKey),
    { syncable: false },
  );
}
