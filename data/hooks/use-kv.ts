"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/data/db/client";
import { readKv, type KvKey, type KvValue } from "@/data/db/kv";
import { toAppError } from "@/lib/errors/app-error";

/**
 * Live device-only value (timer, dismissed prompts…). `undefined` while loading, `null` when
 * absent or unreadable.
 */
export function useKv<K extends KvKey>(key: K): KvValue<K> | null | undefined {
  return useLiveQuery(async () => {
    try {
      return await readKv(getDb(), key);
    } catch (error) {
      throw toAppError(error, "RR-DB-001");
    }
  }, [key]);
}
