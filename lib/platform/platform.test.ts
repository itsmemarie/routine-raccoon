// @vitest-environment jsdom
import { onAppResume } from "./lifecycle";
import { createMemoryScheduler, getNotificationScheduler } from "./notifications";
import { isNativePlatform, platformName } from "./platform";

describe("platform adapters on the web build", () => {
  it("reports the web platform", () => {
    expect(isNativePlatform()).toBe(false);
    expect(platformName()).toBe("web");
  });

  it("uses the in-memory (mocked) notification scheduler in Phase 2", async () => {
    const scheduler = getNotificationScheduler();
    expect(getNotificationScheduler()).toBe(scheduler);
    expect((await scheduler.ensurePermission()).ok).toBe(true);
  });

  it("memory scheduler records, replaces and cancels by id", async () => {
    const scheduler = createMemoryScheduler();
    const at = new Date("2026-09-08T07:00:00Z");
    await scheduler.schedule([{ id: 1, title: "Morning", body: "Drink a pint · 2 min", at }]);
    await scheduler.schedule([{ id: 1, title: "Morning", body: "Eat something · 20 min", at }]);
    expect(scheduler.scheduled.get(1)?.body).toBe("Eat something · 20 min");
    await scheduler.cancel([1]);
    expect(scheduler.scheduled.size).toBe(0);
  });

  it("fires onAppResume when the page becomes visible, until unsubscribed", () => {
    const onResume = vi.fn();
    const unsubscribe = onAppResume(onResume);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(onResume).toHaveBeenCalledTimes(1);
    unsubscribe();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
