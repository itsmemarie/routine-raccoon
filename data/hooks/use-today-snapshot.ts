"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/data/db/client";
import { readDayInput, type DayInput } from "@/data/db/queries";
import { normalizeSettings } from "@/domain/settings";
import type { DayKey, Settings } from "@/domain/types";
import { toAppError } from "@/lib/errors/app-error";

/** Everything the Today selector needs, read in ONE live query so it is a consistent snapshot. */
export type TodaySnapshot = DayInput;

/**
 * Live, reactive read for Today. Re-runs whenever any table it touched changes (a tick, an
 * edit, a pull from sync). Returns `undefined` while loading. A storage failure is thrown as an
 * AppError so the route's error.tsx shows its code (RR-DB-001 by default).
 */
export function useTodaySnapshot(dayKey: DayKey | null): TodaySnapshot | undefined {
  return useLiveQuery(async () => {
    if (!dayKey) return undefined;
    try {
      return await readDayInput(getDb(), dayKey);
    } catch (error) {
      throw toAppError(error, "RR-DB-001");
    }
  }, [dayKey]);
}

/** Settings only (with defaults and legacy keys mapped), for screens that don't need more. */
export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => {
    try {
      const row = await getDb().user_settings.get("me");
      return normalizeSettings(row?.settings);
    } catch (error) {
      throw toAppError(error, "RR-DB-001");
    }
  }, []);
}
