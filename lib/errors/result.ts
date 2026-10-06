import { toAppError, type AppError } from "./app-error";
import type { ErrorCode } from "./codes";

/**
 * Result type for EXPECTED failures (a command that can fail, a network call).
 * Throw only for the unexpected; error boundaries catch those.
 */
export type Result<T, E = AppError> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Runs an async function and captures any throw as `err(AppError)` with the given fallback code. */
export async function tryAsync<T>(
  fn: () => Promise<T>,
  fallback: ErrorCode,
): Promise<Result<T, AppError>> {
  try {
    return ok(await fn());
  } catch (error) {
    return err(toAppError(error, fallback));
  }
}

/** Returns the value or throws the AppError, for call sites inside an error boundary. */
export function unwrap<T>(result: Result<T, AppError>): T {
  if (result.ok) return result.value;
  throw result.error;
}
