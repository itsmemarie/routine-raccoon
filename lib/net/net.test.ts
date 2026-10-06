import { AppError } from "@/lib/errors/app-error";
import { backoffDelay, sleep, withRetry } from "./retry";
import { withTimeout } from "./timeout";

const instantSleep = () => Promise.resolve();

describe("backoffDelay (full jitter)", () => {
  it("grows exponentially up to the cap", () => {
    const max = () => 0.999999;
    expect(backoffDelay(1, 500, 30_000, max)).toBe(499);
    expect(backoffDelay(3, 500, 30_000, max)).toBe(1999);
    expect(backoffDelay(10, 500, 30_000, max)).toBe(29_999);
    expect(backoffDelay(4, 500, 30_000, () => 0)).toBe(0);
  });
});

describe("withRetry", () => {
  it("returns the first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { sleep: instantSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries retryable errors with backoff, then succeeds", async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new AppError("RR-NET-003"))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, { sleep: instantSleep, random: () => 0.5, onRetry })).resolves.toBe(
      "ok",
    );
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry.mock.calls.map((c) => [(c[0] as AppError).code, c[1], c[2]])).toEqual([
      ["RR-NET-001", 1, 250],
      ["RR-NET-003", 2, 500],
    ]);
  });

  it("does not retry non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new AppError("RR-SYNC-003"));
    await expect(withRetry(fn, { sleep: instantSleep })).rejects.toMatchObject({
      code: "RR-SYNC-003",
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempt budget with the last AppError", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("5xx-ish"));
    await expect(
      withRetry(fn, { attempts: 3, sleep: instantSleep, fallback: "RR-NET-004" }),
    ).rejects.toMatchObject({ code: "RR-NET-004" });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops when the signal is aborted", async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new AppError("RR-NET-001"));
    });
    await expect(
      withRetry(fn, { signal: controller.signal, sleep: instantSleep }),
    ).rejects.toMatchObject({
      code: "RR-NET-001",
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("honours a custom shouldRetry", async () => {
    const fn = vi.fn().mockRejectedValue(new AppError("RR-NET-001"));
    await expect(
      withRetry(fn, { sleep: instantSleep, shouldRetry: () => false }),
    ).rejects.toBeInstanceOf(AppError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses the real sleep by default", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValueOnce(new AppError("RR-NET-001")).mockResolvedValue("ok");
    const promise = withRetry(fn, { baseDelayMs: 100, random: () => 0.5 });
    await vi.advanceTimersByTimeAsync(50);
    await expect(promise).resolves.toBe("ok");
    vi.useRealTimers();
  });
});

describe("sleep", () => {
  it("rejects immediately on an aborted signal and on abort", async () => {
    const aborted = AbortSignal.abort(new Error("stop"));
    await expect(sleep(1000, aborted)).rejects.toThrow("stop");

    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = sleep(1000, controller.signal);
    controller.abort(new Error("later"));
    await expect(pending).rejects.toThrow("later");
    vi.useRealTimers();
  });
});

describe("withTimeout", () => {
  it("resolves when fast enough", async () => {
    await expect(withTimeout(() => Promise.resolve(7), 1000)).resolves.toBe(7);
  });

  it("rejects with RR-NET-002 when too slow and aborts the signal", async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    const promise = withTimeout((signal) => {
      seen = signal;
      return new Promise(() => undefined);
    }, 100);
    const assertion = expect(promise).rejects.toMatchObject({
      code: "RR-NET-002",
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(seen?.aborted).toBe(true);
    vi.useRealTimers();
  });

  it("follows a parent abort", async () => {
    const parent = new AbortController();
    const promise = withTimeout(() => new Promise(() => undefined), 10_000, parent.signal);
    parent.abort(new Error("cancelled"));
    await expect(promise).rejects.toThrow("cancelled");
  });
});
