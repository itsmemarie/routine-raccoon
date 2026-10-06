import { SYNC_TABLES } from "@/data/db/schema";
import { deleteKv, readKv, writeKv } from "@/data/db/kv";
import { accountCopy, type LogCopy } from "@/domain/log";
import { planFixesAfterCombine } from "@/domain/merge";
import type { AppError } from "@/lib/errors/app-error";
import type { Result } from "@/lib/errors/result";
import type { CommandContext } from "./context";
import { linkSection, unlinkSection } from "./rows";
import { appendLog, runCommand } from "./run-command";
import { currentDayKey, linksOfPlan, touch } from "./shared";

/**
 * Local side of the account flows (TECH_SPEC §2.6 "Two copies of your day"). The network side
 * lives in data/sync/account.ts.
 */

/** Combine: hand the phone's duplicate primary / survival plans' sections to the saved ones. */
export function combinePlans(
  ctx: CommandContext,
  input: { localPlanIds: ReadonlySet<string> },
): Promise<Result<{ retired: number }, AppError>> {
  return runCommand(ctx, "combinePlans", async () => {
    const plans = await ctx.db.day_plans.toArray();
    const fixes = planFixesAfterCombine(plans, input.localPlanIds);
    for (const fix of fixes) {
      const keepLinks = new Set((await linksOfPlan(ctx, fix.keep)).map((l) => l.section_id));
      for (const link of await linksOfPlan(ctx, fix.drop)) {
        if (!keepLinks.has(link.section_id)) await linkSection(ctx, fix.keep, link.section_id);
        await unlinkSection(ctx, fix.drop, link.section_id);
      }
      await ctx.db.day_plans.update(fix.drop, {
        deleted_at: ctx.now().toISOString(),
        ...touch(ctx),
      });
    }
    return { retired: fixes.length };
  });
}

/**
 * Marks every synced row for upload to the account now linked to this phone. `bump` also
 * stamps them as the newest version ("Keep this phone's": the phone must win every conflict).
 */
export function adoptAllRows(
  ctx: CommandContext,
  input: { owner: string; bump: boolean },
): Promise<Result<void, AppError>> {
  return runCommand(
    ctx,
    "adoptAllRows",
    async () => {
      const at = ctx.now().toISOString();
      for (const name of SYNC_TABLES) {
        await ctx.db
          .table<Record<string, unknown>>(name)
          .toCollection()
          .modify((row) => {
            row._dirty = 1;
            if (input.bump) row.updated_at = at;
          });
      }
      await writeKv(ctx.db, "sync_owner", input.owner);
    },
    { syncable: false },
  );
}

/** "Use the saved copy": empties the phone's synced tables (the server copy is pulled next). */
export function clearSyncedData(
  ctx: CommandContext,
  input: { owner: string },
): Promise<Result<void, AppError>> {
  return runCommand(
    ctx,
    "clearSyncedData",
    async () => {
      for (const name of SYNC_TABLES) await ctx.db.table(name).clear();
      await ctx.db.sync_state.clear();
      await deleteKv(ctx.db, "last_synced_at");
      await writeKv(ctx.db, "sync_owner", input.owner);
      await writeKv(ctx.db, "pending_initial_pull", true);
    },
    { syncable: false },
  );
}

/** Forgets which account this phone syncs with (after deleting the saved copy). */
export function forgetAccount(ctx: CommandContext): Promise<Result<void, AppError>> {
  return runCommand(
    ctx,
    "forgetAccount",
    async () => {
      await deleteKv(ctx.db, "sync_owner");
      await deleteKv(ctx.db, "last_synced_at");
      await ctx.db.sync_state.clear();
    },
    { syncable: false },
  );
}

/** Account created / signed in / deleted (handoff "Log": events that write entries). */
export function logAccountEvent(
  ctx: CommandContext,
  input: {
    event: "created" | "signed-in" | "deleted";
    detail: string;
    provider: "email" | "google";
  },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "logAccountEvent", async () => {
    const copy: LogCopy = accountCopy(input.event, input.detail, input.provider);
    await appendLog(ctx, copy, { dayKey: await currentDayKey(ctx) });
  });
}

/**
 * Account → "Try again" for changes the server refused (RR-SYNC-003): puts them back in the
 * upload queue. Emits a local write, so sync runs straight after.
 */
export function retryQuarantined(
  ctx: CommandContext,
): Promise<Result<{ count: number }, AppError>> {
  return runCommand(ctx, "retryQuarantined", async () => {
    const entries = (await readKv(ctx.db, "sync_quarantine")) ?? [];
    let count = 0;
    for (const entry of entries) {
      const table = SYNC_TABLES.find((t) => t === entry.table);
      if (!table) continue;
      count += await ctx.db
        .table<Record<string, unknown>, string | [string, string]>(table)
        .update(entry.key, { _dirty: 1 });
    }
    await deleteKv(ctx.db, "sync_quarantine");
    return { count };
  });
}
