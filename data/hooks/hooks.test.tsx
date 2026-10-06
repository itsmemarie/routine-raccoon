// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { bootstrapDatabase } from "@/data/bootstrap";
import { openDb } from "@/data/db/client";
import { RoutineDb } from "@/data/db/schema";
import { useDayKey } from "./use-day-key";
import { useSettings, useTodaySnapshot } from "./use-today-snapshot";

describe("data hooks", () => {
  beforeAll(async () => {
    const result = await bootstrapDatabase({ seedDemo: true });
    expect(result.ok).toBe(true);
  });

  it("useSettings returns parsed settings with defaults", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current?.resetAt).toBe("00:00"));
  });

  it("useTodaySnapshot reads one consistent snapshot for the day", async () => {
    const { result } = renderHook(() => useTodaySnapshot("2026-09-08"));
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current?.plans.some((p) => p.kind === "primary")).toBe(true);
    expect(result.current?.tasks.length).toBeGreaterThan(10);
    expect(result.current?.dayRecord).toBeNull();
  });

  it("useTodaySnapshot waits for a day key", async () => {
    const { result } = renderHook(() => useTodaySnapshot(null));
    await act(() => Promise.resolve());
    expect(result.current).toBeUndefined();
  });

  it("useDayKey derives the logical day after mount and on resume", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 9, 1, 30));
    const { result } = renderHook(() => useDayKey("02:00"));
    await waitFor(() => expect(result.current).toBe("2026-09-08"));
    vi.setSystemTime(new Date(2026, 8, 9, 2, 1));
    act(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(result.current).toBe("2026-09-09"));
    vi.useRealTimers();
  });

  it("useDayKey returns null until settings are known", () => {
    const { result } = renderHook(() => useDayKey(undefined));
    expect(result.current).toBeNull();
  });
});

describe("openDb", () => {
  it("returns RR-DB-001 when storage can't open", async () => {
    const db = new RoutineDb("broken");
    vi.spyOn(db, "open").mockRejectedValue(
      Object.assign(new Error("blocked"), { name: "OpenFailedError" }),
    );
    const result = await openDb(db);
    expect(result.ok ? null : result.error.code).toBe("RR-DB-001");
  });

  it("asks for persistent storage and tolerates it failing", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("nope"));
    Object.defineProperty(navigator, "storage", { value: { persist }, configurable: true });
    const db = new RoutineDb(`persist-${crypto.randomUUID()}`);
    const result = await openDb(db);
    expect(result.ok).toBe(true);
    expect(persist).toHaveBeenCalled();
    db.close();
  });
});
