// Native (Android) branches, with Capacitor's plugins mocked.
const appListeners: ((state: { isActive: boolean }) => void)[] = [];
const removeListener = vi.fn();
const notifications = {
  display: "prompt",
  requestResult: "granted",
  scheduleError: null as Error | null,
  cancelError: null as Error | null,
  schedule: vi.fn(),
  cancel: vi.fn(),
};

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (_event: string, cb: (state: { isActive: boolean }) => void) => {
      appListeners.push(cb);
      return Promise.resolve({ remove: removeListener });
    },
  },
}));
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    checkPermissions: () => Promise.resolve({ display: notifications.display }),
    requestPermissions: () => Promise.resolve({ display: notifications.requestResult }),
    schedule: (arg: unknown) => {
      notifications.schedule(arg);
      return notifications.scheduleError
        ? Promise.reject(notifications.scheduleError)
        : Promise.resolve();
    },
    cancel: (arg: unknown) => {
      notifications.cancel(arg);
      return notifications.cancelError
        ? Promise.reject(notifications.cancelError)
        : Promise.resolve();
    },
  },
}));

import { onAppResume } from "./lifecycle";
import { getNotificationScheduler } from "./notifications";
import { isNativePlatform, platformName } from "./platform";

describe("platform adapters on Android", () => {
  it("reports the native platform", () => {
    expect(isNativePlatform()).toBe(true);
    expect(platformName()).toBe("android");
  });

  it("onAppResume fires only when the app becomes active, and removes its listener", async () => {
    const onResume = vi.fn();
    const unsubscribe = onAppResume(onResume);
    appListeners.forEach((cb) => cb({ isActive: false }));
    expect(onResume).not.toHaveBeenCalled();
    appListeners.forEach((cb) => cb({ isActive: true }));
    expect(onResume).toHaveBeenCalledTimes(1);
    unsubscribe();
    await Promise.resolve();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  it("asks for notification permission once, and reports RR-NTF-001 when refused", async () => {
    const scheduler = getNotificationScheduler();
    notifications.display = "granted";
    expect((await scheduler.ensurePermission()).ok).toBe(true);
    notifications.display = "prompt";
    notifications.requestResult = "granted";
    expect((await scheduler.ensurePermission()).ok).toBe(true);
    notifications.requestResult = "denied";
    const refused = await scheduler.ensurePermission();
    expect(refused.ok ? null : refused.error.code).toBe("RR-NTF-001");
  });

  it("schedules at exact times and cancels by id; plugin failures are RR-NTF-002", async () => {
    const scheduler = getNotificationScheduler();
    const at = new Date("2026-09-08T07:00:00Z");
    expect((await scheduler.schedule([{ id: 7, title: "Morning", body: "2 min", at }])).ok).toBe(
      true,
    );
    expect(notifications.schedule).toHaveBeenCalledWith({
      notifications: [
        { id: 7, title: "Morning", body: "2 min", schedule: { at, allowWhileIdle: true } },
      ],
    });
    expect((await scheduler.cancel([7])).ok).toBe(true);
    expect(notifications.cancel).toHaveBeenCalledWith({ notifications: [{ id: 7 }] });

    notifications.scheduleError = new Error("exact alarms off");
    notifications.cancelError = new Error("plugin gone");
    const failed = await scheduler.schedule([{ id: 8, title: "x", body: "y", at }]);
    expect(failed.ok ? null : failed.error.code).toBe("RR-NTF-002");
    const cancelFailed = await scheduler.cancel([8]);
    expect(cancelFailed.ok ? null : cancelFailed.error.code).toBe("RR-NTF-002");
  });
});
