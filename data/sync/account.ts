import {
  adoptAllRows,
  clearSyncedData,
  combinePlans,
  logAccountEvent,
} from "@/data/commands/account";
import { ensureBaseline } from "@/data/commands/baseline";
import type { CommandContext } from "@/data/commands/context";
import { deleteKv, readKv } from "@/data/db/kv";
import { SYNC_TABLES, type SyncTable } from "@/data/db/schema";
import { toAppError, type AppError } from "@/lib/errors/app-error";
import { err, ok, type Result } from "@/lib/errors/result";
import { withRetry, type RetryOptions } from "@/lib/net/retry";
import type { SyncEngine, SyncReport } from "./engine";
import type { RemoteRow, SyncGateway } from "./gateway";
import { toRemote } from "./mapping";

/**
 * First sign-in on a phone ("Two copies of your day", TECH_SPEC §2.6, handoff "Account").
 *
 * - Same account as before → just sync.
 * - Nothing saved in the account yet → keep this phone's (upload it).
 * - Nothing on this phone yet → use the saved copy (download it).
 * - Both have a day → ask: Combine (recommended) / Use the saved copy / Keep this phone's.
 */

export type MergeStrategy = "merge" | "cloud" | "phone";

export type FirstSyncPlan =
  | { readonly kind: "same-owner" }
  | { readonly kind: "auto"; readonly strategy: "cloud" | "phone" }
  | { readonly kind: "ask"; readonly localTasks: number };

export interface AccountSyncDeps {
  readonly ctx: CommandContext;
  readonly gateway: SyncGateway;
  readonly engine: SyncEngine;
  readonly retry?: Omit<RetryOptions, "fallback">;
}

export interface LinkedAccount {
  readonly id: string;
  readonly email: string;
  readonly provider: "email" | "google";
}

const PAGE = 500;

function isLiveRemote(row: RemoteRow): boolean {
  return row.deleted_at === null || row.deleted_at === undefined;
}

async function liveCount(ctx: CommandContext, table: "tasks" | "sections"): Promise<number> {
  return ctx.db
    .table<{ deleted_at: string | null }>(table)
    .filter((r) => r.deleted_at === null)
    .count();
}

function pull(deps: AccountSyncDeps, table: SyncTable, after: number, limit: number) {
  return withRetry(() => deps.gateway.pull(table, after, limit), {
    ...deps.retry,
    fallback: "RR-SYNC-002",
  });
}

export async function planFirstSync(
  deps: AccountSyncDeps,
  userId: string,
): Promise<Result<FirstSyncPlan, AppError>> {
  try {
    if ((await readKv(deps.ctx.db, "sync_owner")) === userId) return ok({ kind: "same-owner" });
    const [tasks, sections] = await Promise.all([
      liveCount(deps.ctx, "tasks"),
      liveCount(deps.ctx, "sections"),
    ]);
    const remoteTasks = await pull(deps, "tasks", 0, 25);
    const remoteSections = await pull(deps, "sections", 0, 25);
    const remoteHasDay = [...remoteTasks, ...remoteSections].some(isLiveRemote);
    if (!remoteHasDay) return ok({ kind: "auto", strategy: "phone" });
    if (tasks === 0 && sections === 0) return ok({ kind: "auto", strategy: "cloud" });
    return ok({ kind: "ask", localTasks: tasks });
  } catch (error) {
    return err(toAppError(error, "RR-SYNC-002"));
  }
}

const HOW: Record<MergeStrategy, string> = {
  merge: "copies combined",
  cloud: "saved copy restored",
  phone: "this phone's day kept",
};

/**
 * "Keep this phone's": every live row of the saved copy becomes a tombstone (log entries are
 * history and can't be removed), then the phone's rows are uploaded as the newest versions.
 * Returns the highest server_seq seen per table, so the next pull skips the replaced copy.
 */
async function retireSavedCopy(deps: AccountSyncDeps): Promise<Map<SyncTable, number>> {
  const highest = new Map<SyncTable, number>();
  const at = deps.ctx.now().toISOString();
  for (const table of SYNC_TABLES) {
    let cursor = 0;
    for (;;) {
      const rows = await pull(deps, table, cursor, PAGE);
      if (rows.length === 0) break;
      cursor = Math.max(cursor, ...rows.map((r) => r.server_seq));
      if (table !== "log_entries" && table !== "user_settings") {
        const tombstones: RemoteRow[] = rows
          .filter(isLiveRemote)
          .map((r) => ({ ...toRemote(table, r), deleted_at: at, updated_at: at }));
        if (tombstones.length > 0) {
          await withRetry(() => deps.gateway.push(table, tombstones), {
            ...deps.retry,
            fallback: "RR-SYNC-001",
          });
        }
      }
      if (rows.length < PAGE) break;
    }
    highest.set(table, cursor);
  }
  return highest;
}

/** Runs the chosen strategy, then a normal sync. Never throws. */
export async function applyStrategy(
  deps: AccountSyncDeps,
  account: LinkedAccount,
  strategy: MergeStrategy,
  event: "created" | "signed-in",
): Promise<Result<SyncReport, AppError>> {
  const { ctx, engine } = deps;
  try {
    switch (strategy) {
      case "cloud": {
        const cleared = await clearSyncedData(ctx, { owner: account.id });
        if (!cleared.ok) return cleared;
        const pulled = await engine.pullAll();
        if (!pulled.ok) return pulled;
        await deleteKv(ctx.db, "pending_initial_pull");
        const baseline = await ensureBaseline(ctx);
        if (!baseline.ok) return err(baseline.error);
        break;
      }
      case "phone": {
        const highest = await retireSavedCopy(deps);
        const adopted = await adoptAllRows(ctx, { owner: account.id, bump: true });
        if (!adopted.ok) return adopted;
        await ctx.db.sync_state.bulkPut(
          [...highest.entries()].map(([table, cursor]) => ({ table, cursor })),
        );
        break;
      }
      case "merge": {
        const localPlanIds = new Set((await ctx.db.day_plans.toArray()).map((p) => p.id));
        await ctx.db.sync_state.clear();
        const pulled = await engine.pullAll();
        if (!pulled.ok) return pulled;
        const combined = await combinePlans(ctx, { localPlanIds });
        if (!combined.ok) return combined;
        const adopted = await adoptAllRows(ctx, { owner: account.id, bump: false });
        if (!adopted.ok) return adopted;
        break;
      }
    }
    const detail =
      event === "created"
        ? `${account.email} · this phone's day saved to it`
        : `${account.email} · ${HOW[strategy]}`;
    await logAccountEvent(ctx, { event, detail, provider: account.provider });
    return await engine.sync();
  } catch (error) {
    return err(toAppError(error, strategy === "merge" ? "RR-SYNC-004" : "RR-SYNC-001"));
  }
}

/** Finishes an interrupted "Use the saved copy" (the download didn't complete last time). */
export async function resumeInitialPull(deps: AccountSyncDeps): Promise<Result<void, AppError>> {
  if (!(await readKv(deps.ctx.db, "pending_initial_pull"))) return ok(undefined);
  const pulled = await deps.engine.pullAll();
  if (!pulled.ok) return pulled;
  await deleteKv(deps.ctx.db, "pending_initial_pull");
  const baseline = await ensureBaseline(deps.ctx);
  return baseline.ok ? ok(undefined) : err(baseline.error);
}
