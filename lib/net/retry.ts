import { isAppError, toAppError, type AppError } from "@/lib/errors/app-error";
import type { ErrorCode } from "@/lib/errors/codes";

export interface RetryOptions {
  /** Total attempts including the first. Default 5. */
  readonly attempts?: number;
  /** Delay before the first retry, in ms. Default 500. */
  readonly baseDelayMs?: number;
  /** Upper bound for any single delay, in ms. Default 30 000. */
  readonly maxDelayMs?: number;
  /** Code used when a thrown value can't be mapped to a more specific one. */
  readonly fallback?: ErrorCode;
  /** Decides whether to retry. Default: only AppErrors flagged `retryable`. */
  readonly shouldRetry?: (error: AppError, attempt: number) => boolean;
  /** Called before each wait, e.g. to surface "retrying…" or add a breadcrumb. */
  readonly onRetry?: (error: AppError, attempt: number, delayMs: number) => void;
  readonly signal?: AbortSignal;
  /** Injected for deterministic tests. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly random?: () => number;
}

/**
 * Exponential backoff with "full jitter": delay = random(0, min(max, base × 2^(attempt-1))).
 * Full jitter spreads retries from many clients and is the AWS-recommended default; for one
 * user it mainly stops a tight retry loop from draining battery while offline.
 */
export function backoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number,
): number {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(random() * ceiling);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Runs `fn` until it succeeds, a non-retryable error occurs, attempts run out, or `signal`
 * aborts. Always rejects with an AppError, never a raw value, so callers get a code.
 *
 * @example
 * const rows = await withRetry(() => gateway.pull("tasks", cursor), { fallback: "RR-SYNC-002" });
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const fallback = options.fallback ?? "RR-NET-004";
  const shouldRetry = options.shouldRetry ?? ((error: AppError) => error.retryable);
  const wait = options.sleep ?? sleep;
  const random = options.random ?? Math.random;

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (thrown) {
      const error = isAppError(thrown) ? thrown : toAppError(thrown, fallback);
      const canRetry =
        attempt < attempts && !options.signal?.aborted && shouldRetry(error, attempt);
      if (!canRetry) throw error;
      const delay = backoffDelay(attempt, baseDelayMs, maxDelayMs, random);
      options.onRetry?.(error, attempt, delay);
      await wait(delay, options.signal);
    }
  }
}
