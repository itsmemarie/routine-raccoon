import type { SyncTable } from "@/data/db/schema";

/**
 * Sync port (TECH_SPEC §2.6). The engine only knows this interface; adapters are
 * SupabaseGateway (production) and MemoryGateway (tests). Implementations throw AppErrors.
 */
export type RemoteRow = Readonly<Record<string, unknown>>;

export interface PulledRow extends RemoteRow {
  readonly server_seq: number;
}

export interface SyncGateway {
  /** Upsert rows on the table's primary key. `log_entries` must ignore duplicates (insert-only). */
  push(table: SyncTable, rows: readonly RemoteRow[]): Promise<void>;
  /** Rows with `server_seq > afterSeq`, ascending, at most `limit`. */
  pull(table: SyncTable, afterSeq: number, limit: number): Promise<readonly PulledRow[]>;
}
