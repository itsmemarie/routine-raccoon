"use client";

import { useEffect, useMemo, useRef } from "react";
import { toastError } from "@/components/ui/toast-store";
import { defaultContext } from "@/data/commands/context";
import { rolloverDay } from "@/data/commands/day";
import { useClock, useEffectiveDayKey } from "@/data/hooks/use-day-key";
import { useTodaySnapshot } from "@/data/hooks/use-today-snapshot";
import { planSectionNotifications } from "@/domain/notifications";
import { buildToday } from "@/domain/today";
import { reportError } from "@/lib/errors/report";
import { getNotificationScheduler } from "@/lib/platform/notifications";
import { useRun } from "@/features/common";

/**
 * Background day duties (TECH_SPEC §2.4), mounted once by the shell:
 * - runs the rollover routine whenever the app's day changes (start, resume, reset time,
 *   "Close the day");
 * - keeps today's section notifications scheduled (PRD R11; exact alarms on Android, a no-op
 *   record on the web build).
 */
export function DayController() {
  const dayKey = useEffectiveDayKey();
  const run = useRun("P00");

  useEffect(() => {
    if (!dayKey) return;
    void run(rolloverDay(defaultContext(), { toDayKey: dayKey }), {
      success: (v) =>
        v.carried > 0
          ? `${v.carried} unfinished ${v.carried === 1 ? "task" : "tasks"} carried over`
          : null,
    });
  }, [dayKey, run]);

  const snapshot = useTodaySnapshot(dayKey);
  const now = useClock(15 * 60_000);
  const planned = useMemo(() => {
    if (!snapshot || !dayKey || !now) return null;
    const view = buildToday({ ...snapshot, dayKey, filter: "all" });
    return planSectionNotifications(view, now, snapshot.settings.resetAt);
  }, [snapshot, dayKey, now]);

  const scheduledIds = useRef<number[]>([]);
  useEffect(() => {
    if (!planned) return undefined;
    const timer = window.setTimeout(() => {
      void (async () => {
        const scheduler = getNotificationScheduler();
        const next = planned.map((p) => p.id);
        const stale = scheduledIds.current.filter((id) => !next.includes(id));
        if (stale.length > 0) await scheduler.cancel(stale);
        const result = await scheduler.schedule(planned);
        if (result.ok) {
          scheduledIds.current = next;
        } else {
          const { errorId } = reportError(result.error, { pageId: "P00" });
          toastError(result.error, "P00", errorId);
        }
      })();
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [planned]);

  return null;
}
