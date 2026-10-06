"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { getDb } from "@/data/db/client";
import { effectiveDayKey } from "@/domain/day";
import { dayKeyFor } from "@/domain/time";
import type { DayKey, HHMM } from "@/domain/types";
import { toAppError } from "@/lib/errors/app-error";
import { onAppResume } from "@/lib/platform/lifecycle";
import { useSettings } from "./use-today-snapshot";

/**
 * The current time, refreshed every `intervalMs` and whenever the app returns to the
 * foreground. Null until mounted: the static export prerenders without a clock.
 */
export function useClock(intervalMs = 60_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const interval = window.setInterval(tick, intervalMs);
    const unsubscribe = onAppResume(tick);
    return () => {
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [intervalMs]);
  return now;
}

/**
 * The calendar's logical day (reset time applied). Re-evaluated every minute and on resume,
 * so Today flips at `resetAt` without a restart (TECH_SPEC §2.4).
 */
export function useDayKey(resetAt: HHMM | undefined): DayKey | null {
  const now = useClock();
  return now && resetAt ? dayKeyFor(now, resetAt) : null;
}

/**
 * The day the app shows: the calendar day, or the next one once the calendar day was closed
 * with "Close the day" (domain/day.ts effectiveDayKey). Null while loading.
 */
export function useEffectiveDayKey(): DayKey | null {
  const settings = useSettings();
  const calendar = useDayKey(settings?.resetAt);
  const closed = useLiveQuery(async () => {
    if (!calendar) return undefined;
    try {
      const record = await getDb().day_records.get(calendar);
      return Boolean(record && record.deleted_at === null && record.closed_at);
    } catch (error) {
      throw toAppError(error, "RR-DB-001");
    }
  }, [calendar]);
  return calendar && closed !== undefined ? effectiveDayKey(calendar, closed) : null;
}
