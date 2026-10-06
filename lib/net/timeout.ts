import { AppError } from "@/lib/errors/app-error";

/**
 * Runs `fn` with an AbortSignal that fires after `ms`. On timeout rejects with RR-NET-002,
 * which is retryable, so it composes with withRetry(). A parent signal still cancels early.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms = 15_000,
  parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timeoutError = new AppError("RR-NET-002", { context: { timeoutMs: ms } });
  const timer = setTimeout(() => controller.abort(timeoutError), ms);
  const onParentAbort = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", onParentAbort, { once: true });
  try {
    return await Promise.race([
      fn(controller.signal),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(controller.signal.reason), {
          once: true,
        });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  }
}
