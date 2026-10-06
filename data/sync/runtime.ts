import { create } from "zustand";
import { defaultContext } from "@/data/commands/context";
import { readKv, writeKv } from "@/data/db/kv";
import { getSessionState } from "@/data/remote/session";
import type { AppError } from "@/lib/errors/app-error";
import { err, ok, type Result } from "@/lib/errors/result";
import { getSupabaseClient } from "@/lib/supabase/client";
import { resumeInitialPull, type AccountSyncDeps } from "./account";
import { SyncEngine, type SyncReport } from "./engine";
import { SupabaseGateway } from "./supabase-gateway";

/**
 * The app's sync runtime: one engine over Supabase, and a small status store the Account
 * screen reads ("Saved to your account · backed up 2 min ago", or the last error's code).
 */

export interface SyncStatus {
  readonly phase: "idle" | "syncing" | "error";
  readonly error: AppError | null;
}

export const useSyncStatus = create<SyncStatus>(() => ({ phase: "idle", error: null }));

let deps: AccountSyncDeps | null = null;

/** Engine + gateway for the configured project, or RR-AUTH-008 when the build has none. */
export function getSyncDeps(): Result<AccountSyncDeps, AppError> {
  if (deps) return ok(deps);
  const client = getSupabaseClient();
  if (!client.ok) return client;
  const ctx = defaultContext();
  const gateway = new SupabaseGateway(client.value);
  deps = { ctx, gateway, engine: new SyncEngine({ db: ctx.db, gateway }) };
  return ok(deps);
}

/**
 * One sync, if this phone is linked to the signed-in account. Background callers can ignore
 * the result: the status store records it. Returns ok(null) when there is nothing to do.
 */
export async function syncNow(): Promise<Result<SyncReport | null, AppError>> {
  const session = getSessionState();
  if (session.status !== "signed-in") return ok(null);
  const runtime = getSyncDeps();
  if (!runtime.ok) return runtime;
  const { ctx, engine } = runtime.value;
  if ((await readKv(ctx.db, "sync_owner")) !== session.user.id) return ok(null);

  useSyncStatus.setState({ phase: "syncing" });
  const resumed = await resumeInitialPull(runtime.value);
  const result = resumed.ok ? await engine.sync() : resumed;
  if (result.ok) {
    await writeKv(ctx.db, "last_synced_at", ctx.now().toISOString());
    useSyncStatus.setState({ phase: "idle", error: null });
    return ok(result.value);
  }
  useSyncStatus.setState({ phase: "error", error: result.error });
  return err(result.error);
}
