import { deleteKv, readKv, writeKv } from "@/data/db/kv";
import { displayMinutes } from "@/domain/duration";
import { timerEndsAt, type TimerState } from "@/domain/timer";
import type { DayKey } from "@/domain/types";
import type { AppError } from "@/lib/errors/app-error";
import type { Result } from "@/lib/errors/result";
import type { CommandContext } from "./context";
import { runCommand } from "./run-command";
import { requireTask } from "./shared";

/**
 * The single task timer (PRD R10). Device-only state in `kv`: a timer is about this phone, so
 * it never syncs. Asking before replacing a running timer is the UI's job ("Stop {current} and
 * start {new}?"); this command simply replaces it.
 */
export function startTimer(
  ctx: CommandContext,
  input: { taskId: string; dayKey: DayKey },
): Promise<Result<{ timer: TimerState; replaced: TimerState | null }, AppError>> {
  return runCommand(
    ctx,
    "startTimer",
    async () => {
      const task = await requireTask(ctx, input.taskId);
      const record = await ctx.db.day_records.get(input.dayKey);
      const survivalOn = Boolean(record && record.deleted_at === null && record.survival_on);
      const minutes = displayMinutes(task, survivalOn);
      const replaced = await readKv(ctx.db, "timer");
      const start = ctx.now();
      const timer: TimerState = {
        taskId: task.id,
        taskName: task.name,
        emoji: task.emoji,
        dayKey: input.dayKey,
        minutes,
        startedAt: start.toISOString(),
        endsAt: timerEndsAt(start, minutes).toISOString(),
        alerted: false,
      };
      await writeKv(ctx.db, "timer", timer);
      return { timer, replaced };
    },
    { syncable: false },
  );
}

export function stopTimer(ctx: CommandContext): Promise<Result<void, AppError>> {
  return runCommand(ctx, "stopTimer", () => deleteKv(ctx.db, "timer"), { syncable: false });
}

/** Records that the expiry nudge was shown, so it shows once. */
export function markTimerAlerted(ctx: CommandContext): Promise<Result<void, AppError>> {
  return runCommand(
    ctx,
    "markTimerAlerted",
    async () => {
      const timer = await readKv(ctx.db, "timer");
      if (timer && !timer.alerted) await writeKv(ctx.db, "timer", { ...timer, alerted: true });
    },
    { syncable: false },
  );
}
