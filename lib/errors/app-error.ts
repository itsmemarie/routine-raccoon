import { ERROR_CODES, isErrorCode, messageFor, type ErrorCode, type ErrorSeverity } from "./codes";

/**
 * The one error type that crosses module boundaries. Anything else (DOMException, PostgREST
 * errors, Zod errors) is converted with `toAppError()` at the boundary where it is caught.
 */
export class AppError extends Error {
  override readonly name = "AppError";
  readonly code: ErrorCode;
  readonly severity: ErrorSeverity;
  readonly retryable: boolean;
  /** Non-PII context for engineers (ids, counts, table names). Never task names or emails. */
  readonly context: Readonly<Record<string, string | number | boolean | null>>;
  /** Values for `{param}` placeholders in the user message (may be shown on screen, not sent to telemetry). */
  readonly params: Readonly<Record<string, string>>;

  constructor(
    code: ErrorCode,
    options: {
      cause?: unknown;
      context?: Record<string, string | number | boolean | null>;
      params?: Record<string, string>;
      /** Override the registry's retryable flag for this occurrence (e.g. a 4xx that is final). */
      retryable?: boolean;
    } = {},
  ) {
    super(`${code}: ${ERROR_CODES[code].devHint}`, { cause: options.cause });
    this.code = code;
    this.severity = ERROR_CODES[code].severity;
    this.retryable = options.retryable ?? ERROR_CODES[code].retryable;
    this.context = options.context ?? {};
    this.params = options.params ?? {};
  }

  /** The copy to show the user, with placeholders filled. */
  get userMessage(): string {
    return messageFor(this.code, this.params);
  }

  get title(): string {
    return ERROR_CODES[this.code].title;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

function hasName(value: unknown, name: string): boolean {
  return typeof value === "object" && value !== null && "name" in value && value.name === name;
}

function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "object" && value !== null && "message" in value) {
    return String(value.message);
  }
  return String(value);
}

/** Pulls an HTTP status or Postgres SQLSTATE out of supabase-js / fetch-shaped errors. */
function statusOf(value: unknown): { status?: number; sqlState?: string } {
  if (typeof value !== "object" || value === null) return {};
  const status = "status" in value && typeof value.status === "number" ? value.status : undefined;
  const code = "code" in value && typeof value.code === "string" ? value.code : undefined;
  const sqlState = code && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
  return { ...(status !== undefined ? { status } : {}), ...(sqlState ? { sqlState } : {}) };
}

/**
 * Normalises anything thrown into an AppError with the most specific code we can infer.
 * `fallback` is used when nothing more specific matches: callers know their context best
 * (a command passes RR-DB-002, the sync push passes RR-SYNC-001, a screen passes RR-APP-001).
 */
export function toAppError(value: unknown, fallback: ErrorCode = "RR-APP-001"): AppError {
  if (isAppError(value)) return value;

  // An error message that already carries a registered code (e.g. thrown by next.config guards).
  const embedded = /RR-[A-Z]+-\d{3}/.exec(messageOf(value))?.[0];
  if (embedded && isErrorCode(embedded)) return new AppError(embedded, { cause: value });

  // Storage
  if (hasName(value, "QuotaExceededError")) return new AppError("RR-DB-003", { cause: value });
  if (hasName(value, "UpgradeError")) return new AppError("RR-DB-004", { cause: value });
  if (
    hasName(value, "OpenFailedError") ||
    hasName(value, "DatabaseClosedError") ||
    hasName(value, "MissingAPIError") ||
    hasName(value, "InvalidStateError")
  ) {
    return new AppError("RR-DB-001", { cause: value });
  }
  if (hasName(value, "ZodError")) return new AppError("RR-DB-006", { cause: value });

  // Bundles
  if (hasName(value, "ChunkLoadError") || /Loading chunk [\w-]+ failed/i.test(messageOf(value))) {
    return new AppError("RR-APP-005", { cause: value });
  }

  // Network / timeouts
  if (hasName(value, "TimeoutError")) return new AppError("RR-NET-002", { cause: value });
  if (value instanceof TypeError && /fetch|network|load failed/i.test(value.message)) {
    return new AppError("RR-NET-001", { cause: value });
  }

  // HTTP / Postgres (supabase-js error objects)
  const { status, sqlState } = statusOf(value);
  if (status === 401) return new AppError("RR-AUTH-004", { cause: value });
  if (status === 408 || status === 504) return new AppError("RR-NET-002", { cause: value });
  if (status === 429) return new AppError("RR-NET-003", { cause: value });
  if (status !== undefined && status >= 500) return new AppError("RR-NET-004", { cause: value });
  if (sqlState === "42501") return new AppError("RR-AUTH-004", { cause: value });
  if (sqlState?.startsWith("23") || sqlState?.startsWith("22")) {
    return new AppError("RR-SYNC-003", { cause: value, context: { sqlState } });
  }

  return new AppError(fallback, { cause: value });
}
