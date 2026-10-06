import type { RoutineDb, SyncTable } from "@/data/db/schema";
import { SYNC_TABLES } from "@/data/db/schema";
import { OccurrenceSchema } from "@/domain/schemas";
import { AppError, toAppError } from "@/lib/errors/app-error";
import type { ErrorCode } from "@/lib/errors/codes";
import { reportError } from "@/lib/errors/report";
import { err, ok, type Result } from "@/lib/errors/result";
import { withRetry, type RetryOptions } from "@/lib/net/retry";
import type { RemoteRow, SyncGateway } from "./gateway";
import { fromRemote, localKey, preserveLocalOnly, toRemote } from "./mapping";

/**
 * Push/pull sync between Dexie and Supabase (TECH_SPEC §2.6).
 *
 * Invariants:
 * - The phone never loses a local edit: `_dirty` is cleared only if the row is unchanged since
 *   it was read for the push (compare-and-clear), and a pull never overwrites a dirty row.
 * - The server arbitrates conflicts (last-write-wins trigger). The client just pushes, then pulls.
 * - One bad row never blocks the rest: a constraint failure quarantines that row (RR-SYNC-003).
 * - Sync is single-flight: concurrent callers share the running sync.
 */

export interface SyncReport {
  readonly pushed: number;
  readonly pulled: number;
  readonly quarantined: number;
  readonly skippedInvalid: number;
  /** Occurrences sent again after the pull re-keyed them to the server's id. */
  readonly deferred: number;
}

export interface QuarantineEntry {
  readonly table: SyncTable;
  readonly key: string | [string, string];
  readonly code: ErrorCode;
  readonly at: string;
}

export const QUARANTINE_KEY = "sync_quarantine";

interface Deps {
  readonly db: RoutineDb;
  readonly gateway: SyncGateway;
  readonly now?: () => Date;
  readonly pushBatchSize?: number;
  readonly pullPageSize?: number;
  readonly retry?: Omit<RetryOptions, "fallback">;
}

type AnyRow = Record<string, unknown> & { updated_at?: unknown; _dirty?: unknown };

/**
 * True when timestamp `a` is strictly later than `b`. Parsed, not string-compared: Postgres
 * returns "+00:00" offsets while the app writes "Z".
 */
export function isNewer(a: unknown, b: unknown): boolean {
  const ta = typeof a === "string" ? Date.parse(a) : Number.NaN;
  const tb = typeof b === "string" ? Date.parse(b) : Number.NaN;
  if (Number.isNaN(ta)) return false;
  if (Number.isNaN(tb)) return true;
  return ta > tb;
}

function isLivePrimary(row: AnyRow): boolean {
  return row.kind === "primary" && (row.deleted_at === null || row.deleted_at === undefined);
}

export class SyncEngine {
  private running: Promise<Result<SyncReport, AppError>> | null = null;

  constructor(private readonly deps: Deps) {}

  /** Push then pull every table. Never throws; failure is `err(AppError)` with a SYNC/NET code. */
  sync(): Promise<Result<SyncReport, AppError>> {
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /**
   * Pull only (first sign-in "Combine" / "Use the saved copy"): brings the server copy in
   * before anything local is pushed. Shares the single-flight slot with sync().
   */
  pullAll(): Promise<Result<SyncReport, AppError>> {
    this.running ??= this.pullOnly().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async pullOnly(): Promise<Result<SyncReport, AppError>> {
    const report = { pushed: 0, pulled: 0, quarantined: 0, skippedInvalid: 0, deferred: 0 };
    try {
      for (const table of SYNC_TABLES) await this.pullTable(table, report);
    } catch (error) {
      return err(toAppError(error, "RR-SYNC-002"));
    }
    return ok(report);
  }

  private async run(): Promise<Result<SyncReport, AppError>> {
    const report = { pushed: 0, pulled: 0, quarantined: 0, skippedInvalid: 0, deferred: 0 };
    try {
      for (const table of SYNC_TABLES) await this.pushTable(table, report);
    } catch (error) {
      return err(toAppError(error, "RR-SYNC-001"));
    }
    try {
      for (const table of SYNC_TABLES) await this.pullTable(table, report);
    } catch (error) {
      return err(toAppError(error, "RR-SYNC-002"));
    }
    if (report.deferred > 0) {
      // The pull re-keyed the deferred occurrences to the server's ids; send them now.
      try {
        await this.pushTable("task_occurrences", report);
      } catch (error) {
        return err(toAppError(error, "RR-SYNC-001"));
      }
    }
    return ok(report);
  }

  private table(name: SyncTable) {
    return this.deps.db.table<AnyRow, string | [string, string]>(name);
  }

  private async pushTable(
    name: SyncTable,
    report: { pushed: number; quarantined: number; deferred: number },
  ) {
    const dirty = await this.table(name).where("_dirty").equals(1).toArray();
    // The server allows one live primary plan per user (unique partial index, checked row by
    // row). Push demotions and tombstones before the new primary so "Make primary" can't
    // collide with the old primary inside one batch.
    if (name === "day_plans")
      dirty.sort((a, b) => Number(isLivePrimary(a)) - Number(isLivePrimary(b)));
    const size = this.deps.pushBatchSize ?? 200;
    for (let i = 0; i < dirty.length; i += size) {
      const batch = dirty.slice(i, i + size);
      try {
        await this.pushWithRetry(
          name,
          batch.map((row) => toRemote(name, row)),
        );
        report.pushed += await this.compareAndClear(name, batch);
      } catch (error) {
        const appError = toAppError(error, "RR-SYNC-001");
        if (appError.code !== "RR-SYNC-003") throw appError;
        // A constraint failure: isolate the offending rows one by one so the rest still sync.
        for (const row of batch) {
          try {
            await this.pushWithRetry(name, [toRemote(name, row)]);
            report.pushed += await this.compareAndClear(name, [row]);
          } catch (rowError) {
            const rowAppError = toAppError(rowError, "RR-SYNC-001");
            if (rowAppError.code !== "RR-SYNC-003") throw rowAppError;
            if (name === "task_occurrences" && rowAppError.context.sqlState === "23505") {
              // Same task and day already on the server under another id (rows from the retired
              // app). Not a bad row: keep it dirty; the pull re-keys it to the server's id.
              report.deferred++;
              continue;
            }
            await this.quarantine(name, row, rowAppError);
            report.quarantined++;
          }
        }
      }
    }
  }

  private pushWithRetry(name: SyncTable, rows: readonly RemoteRow[]) {
    return withRetry(() => this.deps.gateway.push(name, rows), {
      ...this.deps.retry,
      fallback: "RR-SYNC-001",
    });
  }

  /** Clears `_dirty` only for rows whose `updated_at` didn't change while the push was in flight. */
  private async compareAndClear(name: SyncTable, pushed: readonly AnyRow[]): Promise<number> {
    const table = this.table(name);
    let cleared = 0;
    await this.deps.db.transaction("rw", table, async () => {
      for (const row of pushed) {
        const key = localKey(name, row);
        const current = await table.get(key);
        if (current && current.updated_at === row.updated_at) {
          await table.update(key, { _dirty: 0 });
          cleared++;
        }
      }
    });
    return cleared;
  }

  /** Stops retrying a rejected row until it is edited again, and records why (Account screen). */
  private async quarantine(name: SyncTable, row: AnyRow, error: AppError) {
    const key = localKey(name, row);
    const entry: QuarantineEntry = {
      table: name,
      key,
      code: error.code,
      at: (this.deps.now?.() ?? new Date()).toISOString(),
    };
    await this.deps.db.transaction("rw", [this.table(name), this.deps.db.kv], async () => {
      const existing = await this.deps.db.kv.get(QUARANTINE_KEY);
      const list = Array.isArray(existing?.value) ? (existing.value as QuarantineEntry[]) : [];
      await this.deps.db.kv.put({ key: QUARANTINE_KEY, value: [...list, entry] });
      await this.table(name).update(key, { _dirty: 0 });
    });
    reportError(error, { fallback: "RR-SYNC-003" });
  }

  private async pullTable(name: SyncTable, report: { pulled: number; skippedInvalid: number }) {
    const pageSize = this.deps.pullPageSize ?? 500;
    const table = this.table(name);
    for (;;) {
      const cursor = (await this.deps.db.sync_state.get(name))?.cursor ?? 0;
      const rows = await withRetry(() => this.deps.gateway.pull(name, cursor, pageSize), {
        ...this.deps.retry,
        fallback: "RR-SYNC-002",
      });
      if (rows.length === 0) return;
      await this.deps.db.transaction("rw", [table, this.deps.db.sync_state], async () => {
        let highest = cursor;
        for (const remote of rows) {
          highest = Math.max(highest, remote.server_seq);
          const local = fromRemote(name, remote);
          if (!local) {
            report.skippedInvalid++;
            reportError(
              new AppError("RR-DB-006", { context: { table: name, serverSeq: remote.server_seq } }),
            );
            continue;
          }
          if (name === "task_occurrences" && (await this.reconcileOccurrence(local))) {
            report.pulled++;
            continue;
          }
          const existing = await table.get(localKey(name, local));
          // A pending local edit is kept when it would win on the server (same or newer
          // updated_at); an OLDER one would be silently dropped by the server's last-write-wins
          // trigger, so take the server's version now instead of diverging until the next edit.
          if (existing?._dirty === 1 && !isNewer(local.updated_at, existing.updated_at)) continue;
          // A tombstone for a row this device never had changes nothing; don't store it.
          if (!existing && typeof local.deleted_at === "string") continue;
          await table.put(preserveLocalOnly(name, remote, local, existing));
          report.pulled++;
        }
        await this.deps.db.sync_state.put({ table: name, cursor: highest });
      });
      if (rows.length < pageSize) return;
    }
  }

  /**
   * One occurrence per task per day is enforced on BOTH sides (`unique (task_id, day_key)`),
   * but ids can differ: rows written by the retired app have random ids, ours are uuidv5. When
   * a pulled row clashes with a local row of another id, the server's id wins (it is the one
   * the server will accept): the local row is re-keyed, keeping a pending local edit dirty so
   * the next push lets the server arbitrate by updated_at. Without this the Dexie unique index
   * would abort the whole pull. Returns true when it handled the row.
   */
  private async reconcileOccurrence(incoming: Record<string, unknown>): Promise<boolean> {
    const occurrences = this.deps.db.task_occurrences;
    const taskId = String(incoming.task_id);
    const dayKey = String(incoming.day_key);
    const clash = await occurrences.where("[task_id+day_key]").equals([taskId, dayKey]).first();
    if (!clash || clash.id === incoming.id) return false;
    await occurrences.delete(clash.id);
    if (clash._dirty === 1) {
      await occurrences.put({ ...clash, id: String(incoming.id), _dirty: 1 });
    } else {
      const parsed = OccurrenceSchema.safeParse(incoming);
      if (!parsed.success) return true;
      await occurrences.put({ ...parsed.data, _dirty: 0 });
    }
    return true;
  }
}
