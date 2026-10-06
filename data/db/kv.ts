import { z } from "zod";
import { DayKeySchema } from "@/domain/schemas";
import { TimerStateSchema } from "@/domain/timer";
import type { RoutineDb } from "./schema";

/**
 * Device-only key/value state (TECH_SPEC §2.3 `kv`): never synced. Every key has a schema, so a
 * value written by another app version or corrupted on disk reads as "absent" instead of
 * crashing a screen.
 */
export const KV_SCHEMAS = {
  /** The last day the rollover routine ran for. */
  last_day_key: DayKeySchema,
  /** Day on which the "Which kind of day is it?" box was hidden. */
  day_prompt_dismissed: DayKeySchema,
  /** The running task timer, or absent. */
  timer: TimerStateSchema,
  /** Account whose server copy this device syncs with. */
  sync_owner: z.string().min(1),
  /** When the last sync finished successfully. */
  last_synced_at: z.string().min(1),
  /**
   * The phone was emptied for "Use the saved copy" and the download hasn't finished: don't
   * create default plans (they'd clash with the saved copy's) until it has.
   */
  pending_initial_pull: z.boolean(),
  /** Rows the server refused (RR-SYNC-003), kept off the push queue until retried. */
  sync_quarantine: z.array(
    z.object({
      table: z.string(),
      key: z.union([z.string(), z.tuple([z.string(), z.string()])]),
      code: z.string(),
      at: z.string(),
    }),
  ),
  /** The first-run welcome card on Today was dismissed. */
  welcome_dismissed: z.boolean(),
} as const;

export type KvKey = keyof typeof KV_SCHEMAS;
export type KvValue<K extends KvKey> = z.infer<(typeof KV_SCHEMAS)[K]>;

export async function readKv<K extends KvKey>(db: RoutineDb, key: K): Promise<KvValue<K> | null> {
  const row = await db.kv.get(key);
  if (!row) return null;
  const parsed = KV_SCHEMAS[key].safeParse(row.value);
  return parsed.success ? (parsed.data as KvValue<K>) : null;
}

export async function writeKv<K extends KvKey>(
  db: RoutineDb,
  key: K,
  value: KvValue<K>,
): Promise<void> {
  await db.kv.put({ key, value });
}

export async function deleteKv(db: RoutineDb, key: KvKey): Promise<void> {
  await db.kv.delete(key);
}
