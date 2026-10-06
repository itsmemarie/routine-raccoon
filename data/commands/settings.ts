import { resetTimeCopy, survivalRenamedCopy } from "@/domain/log";
import { normalizeSettings } from "@/domain/settings";
import { formatHHMM12, parseHHMM } from "@/domain/time";
import type { Settings } from "@/domain/types";
import { AppError } from "@/lib/errors/app-error";
import type { Result } from "@/lib/errors/result";
import type { CommandContext } from "./context";
import { appendLog, runCommand } from "./run-command";
import { currentDayKey, nowIso, readSettings, requireName } from "./shared";

/**
 * Settings commands. Values are validated explicitly (so the user sees RR-VAL-00x) instead of
 * silently falling back to defaults the way reads do.
 * @see docs/handoff/README.md screen 15, "Day Plans (Settings)"
 */

function validatePatch(patch: Partial<Settings>): Partial<Settings> {
  const next: Partial<Settings> = { ...patch };
  if (patch.resetAt !== undefined && parseHHMM(patch.resetAt) === null) {
    throw new AppError("RR-VAL-004", { context: { field: "resetAt" } });
  }
  if (patch.survivalName !== undefined) next.survivalName = requireName(patch.survivalName, 40);
  if (patch.longAt !== undefined) {
    if (!Number.isInteger(patch.longAt) || patch.longAt < 1 || patch.longAt > 600) {
      throw new AppError("RR-VAL-002", { context: { field: "longAt" } });
    }
  }
  return next;
}

/**
 * Updates one or more settings. Changing the reset time or the Survival Mode name is logged
 * (handoff: "reset time change" writes an entry).
 */
export function updateSettings(
  ctx: CommandContext,
  patch: Partial<Settings>,
): Promise<Result<Settings, AppError>> {
  return runCommand(ctx, "updateSettings", async () => {
    const valid = validatePatch(patch);
    const before = await readSettings(ctx);
    const next = normalizeSettings({ ...before, ...valid });
    const at = nowIso(ctx);
    const existing = await ctx.db.user_settings.get("me");
    await ctx.db.user_settings.put({
      key: "me",
      settings: next,
      created_at: existing?.created_at ?? at,
      updated_at: at,
      deleted_at: null,
      _dirty: 1,
    });
    const dayKey = await currentDayKey(ctx);
    if (valid.resetAt !== undefined && valid.resetAt !== before.resetAt) {
      await appendLog(ctx, resetTimeCopy(formatHHMM12(next.resetAt), next.survivalName), {
        dayKey,
      });
    }
    if (valid.survivalName !== undefined && valid.survivalName !== before.survivalName) {
      await appendLog(ctx, survivalRenamedCopy(before.survivalName, next.survivalName), {
        dayKey,
      });
    }
    return next;
  });
}
