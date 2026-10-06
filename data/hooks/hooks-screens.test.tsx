// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { bootstrapDatabase } from "@/data/bootstrap";
import { closeDay, tickTask } from "@/data/commands/day";
import { defaultContext } from "@/data/commands/context";
import { getDb } from "@/data/db/client";
import { writeKv } from "@/data/db/kv";
import { monthStart } from "@/domain/progress";
import { primaryPlan } from "@/domain/survival";
import { dayKeyFor } from "@/domain/time";
import { useEffectiveDayKey } from "./use-day-key";
import { useKv } from "./use-kv";
import { useLog, useLogCount } from "./use-log";
import { useOrganisation } from "./use-organisation";
import { useProgressInput } from "./use-progress";
import { useTaskDetail } from "./use-task-detail";

// The demo seed is stamped with the real clock, so use the real logical day.
const DAY = dayKeyFor(new Date(), "00:00");

describe("screen hooks (live reads)", () => {
  let pintId = "";
  beforeAll(async () => {
    expect((await bootstrapDatabase({ seedDemo: true })).ok).toBe(true);
    // Survival plans hold same-named copies; take the one in the primary (Normal) plan.
    const db = getDb();
    const normal = primaryPlan(await db.day_plans.toArray());
    const linked = new Set(
      (await db.plan_sections.toArray())
        .filter((l) => l.plan_id === normal?.id)
        .map((l) => l.section_id),
    );
    const pint = (await db.tasks.toArray()).find(
      (t) => t.name === "Drink a pint" && linked.has(t.section_id),
    );
    pintId = pint?.id ?? "";
    await tickTask(defaultContext(), { taskId: pintId, dayKey: DAY });
  });

  it("useKv reads device values and treats corrupt ones as absent", async () => {
    await writeKv(getDb(), "welcome_dismissed", true);
    const { result } = renderHook(() => useKv("welcome_dismissed"));
    await waitFor(() => expect(result.current).toBe(true));
    await act(async () => {
      await getDb().kv.put({ key: "welcome_dismissed", value: "nope" });
    });
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("useLog pages, filters and narrows to one task; useLogCount counts", async () => {
    const all = renderHook(() => useLog({ filter: "all", taskId: null, limit: 1 }));
    await waitFor(() => expect(all.result.current?.entries).toHaveLength(1));
    expect(all.result.current?.hasMore).toBe(true);
    const completed = renderHook(() => useLog({ filter: "completed", taskId: null, limit: 10 }));
    await waitFor(() =>
      expect(completed.result.current?.entries.map((e) => e.title)).toEqual([
        "Completed Drink a pint",
      ]),
    );
    const activity = renderHook(() => useLog({ filter: "all", taskId: pintId, limit: 10 }));
    await waitFor(() => expect(activity.result.current?.entries).toHaveLength(1));
    expect(activity.result.current?.hasMore).toBe(false);
    const count = renderHook(() => useLogCount());
    await waitFor(() => expect(count.result.current).toBeGreaterThanOrEqual(2));
  });

  it("useOrganisation and useProgressInput read the definitions", async () => {
    const org = renderHook(() => useOrganisation());
    await waitFor(() => expect(org.result.current?.plans.length).toBeGreaterThan(3));
    expect(org.result.current?.settings.resetAt).toBe("00:00");
    const progress = renderHook(() => useProgressInput(monthStart(DAY), DAY));
    await waitFor(() => expect(progress.result.current?.occurrences).toHaveLength(1));
    const waiting = renderHook(() => useProgressInput(monthStart(DAY), null));
    await act(() => Promise.resolve());
    expect(waiting.result.current).toBeUndefined();
  });

  it("useTaskDetail: the task as today shows it, null when gone, undefined while waiting", async () => {
    const detail = renderHook(() => useTaskDetail(pintId, DAY));
    await waitFor(() => expect(detail.result.current?.task.name).toBe("Drink a pint"));
    expect(detail.result.current?.today?.done).toBe(true);
    expect(detail.result.current?.section?.name).toBe("Morning");
    expect(detail.result.current?.plans.map((p) => p.name)).toEqual(["Normal"]);
    expect(detail.result.current?.alsoIn.map((p) => p.name)).toEqual([
      "Bare minimum",
      "Bad day",
      "Zero energy",
    ]);
    const missing = renderHook(() => useTaskDetail("00000000-0000-4000-8000-00000000dead", DAY));
    await waitFor(() => expect(missing.result.current).toBeNull());
    const waiting = renderHook(() => useTaskDetail(pintId, null));
    await act(() => Promise.resolve());
    expect(waiting.result.current).toBeUndefined();
  });

  it("useEffectiveDayKey moves to the next day once today is closed", async () => {
    const calendar = dayKeyFor(new Date(), "00:00");
    const { result } = renderHook(() => useEffectiveDayKey());
    await waitFor(() => expect(result.current).toBe(calendar));
    await act(async () => {
      await closeDay(defaultContext(), { dayKey: calendar });
    });
    await waitFor(() => expect(result.current).not.toBe(calendar));
  });
});
