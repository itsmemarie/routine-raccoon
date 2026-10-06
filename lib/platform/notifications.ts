import { LocalNotifications } from "@capacitor/local-notifications";
import { AppError } from "@/lib/errors/app-error";
import { err, ok, type Result } from "@/lib/errors/result";
import { isNativePlatform } from "./platform";

/** One notification to fire at an exact time (timer expiry, block starts, block closing). */
export interface ScheduledNotification {
  /** Stable numeric id so rescheduling replaces rather than duplicates. */
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly at: Date;
}

export interface NotificationScheduler {
  ensurePermission(): Promise<Result<void, AppError>>;
  schedule(items: readonly ScheduledNotification[]): Promise<Result<void, AppError>>;
  cancel(ids: readonly number[]): Promise<Result<void, AppError>>;
}

/** Android: exact-time local notifications via Capacitor (Phase 3 wires permissions UI). */
const nativeScheduler: NotificationScheduler = {
  async ensurePermission() {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === "granted") return ok(undefined);
    const requested = await LocalNotifications.requestPermissions();
    return requested.display === "granted" ? ok(undefined) : err(new AppError("RR-NTF-001"));
  },
  async schedule(items) {
    try {
      await LocalNotifications.schedule({
        notifications: items.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          schedule: { at: n.at, allowWhileIdle: true },
        })),
      });
      return ok(undefined);
    } catch (cause) {
      return err(new AppError("RR-NTF-002", { cause, context: { count: items.length } }));
    }
  },
  async cancel(ids) {
    try {
      await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
      return ok(undefined);
    } catch (cause) {
      return err(new AppError("RR-NTF-002", { cause }));
    }
  },
};

/**
 * Web / Phase 2: notifications are mocked (PRD §10). Scheduling is recorded so tests and the
 * dev console can assert on it, but nothing is shown.
 */
export function createMemoryScheduler(): NotificationScheduler & {
  readonly scheduled: Map<number, ScheduledNotification>;
} {
  const scheduled = new Map<number, ScheduledNotification>();
  return {
    scheduled,
    ensurePermission: () => Promise.resolve(ok(undefined)),
    schedule(items) {
      for (const item of items) scheduled.set(item.id, item);
      return Promise.resolve(ok(undefined));
    },
    cancel(ids) {
      for (const id of ids) scheduled.delete(id);
      return Promise.resolve(ok(undefined));
    },
  };
}

let scheduler: NotificationScheduler | undefined;

export function getNotificationScheduler(): NotificationScheduler {
  scheduler ??= isNativePlatform() ? nativeScheduler : createMemoryScheduler();
  return scheduler;
}
