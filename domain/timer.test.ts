import {
  formatCountdown,
  isTimerExpired,
  timerEndsAt,
  timerRemainingMs,
  TimerStateSchema,
} from "./timer";

describe("timer", () => {
  const start = new Date("2026-09-08T09:00:00.000Z");
  const endsAt = timerEndsAt(start, 5).toISOString();

  it("derives the remaining time from the clock, so it survives the app being closed", () => {
    expect(endsAt).toBe("2026-09-08T09:05:00.000Z");
    expect(timerRemainingMs({ endsAt }, new Date("2026-09-08T09:01:30.000Z"))).toBe(210_000);
    expect(timerRemainingMs({ endsAt }, new Date("2026-09-08T10:00:00.000Z"))).toBe(0);
    expect(isTimerExpired({ endsAt }, new Date("2026-09-08T09:05:00.000Z"))).toBe(true);
    expect(isTimerExpired({ endsAt }, start)).toBe(false);
  });

  it("treats an unreadable end time as finished", () => {
    expect(timerRemainingMs({ endsAt: "garbage" }, start)).toBe(0);
  });

  it.each([
    [300_000, "5:00"],
    [299_001, "5:00"],
    [65_000, "1:05"],
    [0, "0:00"],
    [-5, "0:00"],
    [3_725_000, "1:02:05"],
  ])("formats %i ms as %s", (ms, text) => {
    expect(formatCountdown(ms)).toBe(text);
  });

  it("validates stored state", () => {
    expect(TimerStateSchema.safeParse({ taskId: "t" }).success).toBe(false);
  });
});
