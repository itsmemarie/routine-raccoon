import type { SyncTable } from "@/data/db/schema";
import { AppError } from "@/lib/errors/app-error";
import type { PulledRow, RemoteRow, SyncGateway } from "./gateway";
import { CONFLICT_TARGET } from "./mapping";

/**
 * In-memory server for tests. It reproduces the semantics of the real database that sync
 * depends on (TECH_SPEC §2.1):
 * - LWW: an upsert older than the stored `updated_at` is silently dropped (trigger returns NULL).
 * - Every accepted write gets the next `server_seq` from ONE shared sequence.
 * - `log_entries` is insert-only: duplicates are ignored.
 * Failure injection lets tests exercise retry and quarantine paths.
 */
export class MemoryGateway implements SyncGateway {
  private seq = 0;
  readonly tables = new Map<SyncTable, Map<string, PulledRow>>();
  readonly calls: { op: "push" | "pull"; table: SyncTable }[] = [];
  private failures: AppError[] = [];
  private rejectRow: ((table: SyncTable, row: RemoteRow) => boolean) | null = null;

  /** The next N calls (push or pull) fail with these errors, in order. */
  failNext(...errors: AppError[]): void {
    this.failures.push(...errors);
  }

  /** Rows matching the predicate fail with a constraint violation (RR-SYNC-003). */
  rejectWhen(predicate: (table: SyncTable, row: RemoteRow) => boolean): void {
    this.rejectRow = predicate;
  }

  rows(table: SyncTable): PulledRow[] {
    return [...(this.tables.get(table)?.values() ?? [])];
  }

  private keyOf(table: SyncTable, row: RemoteRow): string {
    return CONFLICT_TARGET[table]
      .split(",")
      .map((column) => (column === "user_id" ? "me" : String(row[column])))
      .join("|");
  }

  /** Simulates a write made by ANOTHER device. */
  serverWrite(table: SyncTable, row: RemoteRow): void {
    this.apply(table, row);
  }

  private apply(table: SyncTable, row: RemoteRow): void {
    const store = this.tables.get(table) ?? new Map<string, PulledRow>();
    this.tables.set(table, store);
    const key = this.keyOf(table, row);
    const existing = store.get(key);
    if (existing && table === "log_entries") return; // ON CONFLICT DO NOTHING
    if (existing && String(row.updated_at) < String(existing.updated_at)) return; // LWW drop
    store.set(key, { ...existing, ...row, server_seq: ++this.seq });
  }

  push(table: SyncTable, rows: readonly RemoteRow[]): Promise<void> {
    this.calls.push({ op: "push", table });
    const failure = this.failures.shift();
    if (failure) return Promise.reject(failure);
    if (this.rejectRow && rows.some((row) => this.rejectRow?.(table, row))) {
      // Postgres rejects the whole statement, like a real check-constraint failure.
      return Promise.reject(new AppError("RR-SYNC-003", { context: { sqlState: "23514" } }));
    }
    const snapshot = new Map(this.tables.get(table));
    for (const row of rows) {
      const violates =
        table === "task_occurrences" &&
        this.rows(table).some(
          (r) => r.id !== row.id && r.task_id === row.task_id && r.day_key === row.day_key,
        );
      if (!violates) this.apply(table, row);
      if (violates || (table === "day_plans" && this.livePrimaries() > 1)) {
        // A unique index (`one_occurrence_per_task_per_day`, `day_plans_one_primary`) fails
        // the whole statement, rolling it back.
        this.tables.set(table, snapshot);
        return Promise.reject(new AppError("RR-SYNC-003", { context: { sqlState: "23505" } }));
      }
    }
    return Promise.resolve();
  }

  private livePrimaries(): number {
    return this.rows("day_plans").filter(
      (r) => r.kind === "primary" && (r.deleted_at === null || r.deleted_at === undefined),
    ).length;
  }

  pull(table: SyncTable, afterSeq: number, limit: number): Promise<readonly PulledRow[]> {
    this.calls.push({ op: "pull", table });
    const failure = this.failures.shift();
    if (failure) return Promise.reject(failure);
    return Promise.resolve(
      this.rows(table)
        .filter((row) => row.server_seq > afterSeq)
        .sort((a, b) => a.server_seq - b.server_seq)
        .slice(0, limit),
    );
  }
}
