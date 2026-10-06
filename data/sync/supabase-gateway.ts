import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncTable } from "@/data/db/schema";
import { toAppError } from "@/lib/errors/app-error";
import { withTimeout } from "@/lib/net/timeout";
import type { RaccoonSupabase } from "@/lib/supabase/client";
import type { PulledRow, RemoteRow, SyncGateway } from "./gateway";
import { CONFLICT_TARGET } from "./mapping";

/**
 * Production sync adapter over PostgREST. Every call has a timeout (RR-NET-002) and every
 * error is mapped to a code by toAppError (401 → AUTH-004, 23xxx → SYNC-003, 5xx → NET-004).
 * Pulled rows are validated by the engine (mapping.fromRemote), not trusted here.
 */
export class SupabaseGateway implements SyncGateway {
  /**
   * Table names are dynamic here, which the generated generics can't express without a union
   * explosion. We widen the CLIENT type only; rows are allowlisted on push (toRemote) and
   * Zod-validated on pull, so no data is trusted because of this widening.
   */
  private readonly client: SupabaseClient;

  constructor(client: RaccoonSupabase) {
    this.client = client as unknown as SupabaseClient;
  }

  async push(table: SyncTable, rows: readonly RemoteRow[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await withTimeout((signal) =>
      Promise.resolve(
        this.client
          .from(table)
          .upsert([...rows], {
            onConflict: CONFLICT_TARGET[table],
            ignoreDuplicates: table === "log_entries",
          })
          .abortSignal(signal),
      ),
    );
    if (error) throw toAppError(error, "RR-SYNC-001");
  }

  async pull(table: SyncTable, afterSeq: number, limit: number): Promise<readonly PulledRow[]> {
    const { data, error } = await withTimeout((signal) =>
      Promise.resolve(
        this.client
          .from(table)
          .select("*")
          .gt("server_seq", afterSeq)
          .order("server_seq", { ascending: true })
          .limit(limit)
          .abortSignal(signal),
      ),
    );
    if (error) throw toAppError(error, "RR-SYNC-002");
    return (data ?? []).filter(
      (row): row is PulledRow =>
        typeof row === "object" && row !== null && typeof row.server_seq === "number",
    );
  }
}
