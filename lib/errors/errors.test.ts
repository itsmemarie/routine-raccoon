import {
  clearDiagnostics,
  formatDiagnostics,
  recentDiagnostics,
} from "@/lib/telemetry/diagnostics";
import { setTelemetry, noopTelemetry, type Telemetry } from "@/lib/telemetry/telemetry";
import { AppError, isAppError, toAppError } from "./app-error";
import { assertNever } from "./assert-never";
import { ALL_ERROR_CODES, ERROR_CODES, isErrorCode, messageFor } from "./codes";
import { ALL_PAGE_IDS, codesForPage, COMMON_CODES, PAGES } from "./pages";
import { newErrorId, reportError } from "./report";
import { err, ok, tryAsync, unwrap } from "./result";

describe("error-code registry integrity", () => {
  it("every key matches RR-<AREA>-<NNN> and its area", () => {
    for (const code of ALL_ERROR_CODES) {
      expect(code).toMatch(/^RR-[A-Z]+-\d{3}$/);
      expect(code.split("-")[1]).toBe(ERROR_CODES[code].area);
    }
  });

  it("every code has user copy, a title and a dev hint", () => {
    for (const code of ALL_ERROR_CODES) {
      const def = ERROR_CODES[code];
      expect(def.title.length).toBeGreaterThan(0);
      expect(def.userMessage.length).toBeGreaterThan(0);
      expect(def.devHint.length).toBeGreaterThan(0);
    }
  });

  it("every page references only registered codes, and the common set is registered", () => {
    for (const pageId of ALL_PAGE_IDS) {
      for (const code of codesForPage(pageId)) expect(isErrorCode(code)).toBe(true);
    }
    expect(COMMON_CODES.every(isErrorCode)).toBe(true);
  });

  it("page ids are P00…P15 and routes are unique", () => {
    expect(ALL_PAGE_IDS).toEqual(
      Array.from({ length: 16 }, (_, i) => `P${String(i).padStart(2, "0")}`),
    );
    const routes = Object.values(PAGES)
      .map((p) => p.route)
      .filter((r) => r !== null);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("isErrorCode narrows only registered codes", () => {
    expect(isErrorCode("RR-DB-001")).toBe(true);
    expect(isErrorCode("RR-DB-999")).toBe(false);
    expect(isErrorCode("render")).toBe(false);
  });

  it("messageFor fills placeholders and leaves unknown ones", () => {
    expect(messageFor("RR-VAL-006", { plan: "Travelling" })).toBe(
      "Travelling has no sections yet.",
    );
    expect(messageFor("RR-VAL-006")).toBe("{plan} has no sections yet.");
  });
});

describe("AppError", () => {
  it("carries registry metadata and filled copy", () => {
    const error = new AppError("RR-VAL-006", {
      params: { plan: "Travelling" },
      context: { planId: "x" },
    });
    expect(error.code).toBe("RR-VAL-006");
    expect(error.title).toBe("Plan has no sections");
    expect(error.userMessage).toBe("Travelling has no sections yet.");
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("RR-VAL-006");
    expect(isAppError(error)).toBe(true);
    expect(isAppError(new Error("x"))).toBe(false);
  });

  it("can override retryable per occurrence", () => {
    expect(new AppError("RR-NET-004", { retryable: false }).retryable).toBe(false);
  });
});

describe("toAppError maps platform errors to codes", () => {
  const named = (name: string, message = name) => Object.assign(new Error(message), { name });

  it.each([
    [named("QuotaExceededError"), "RR-DB-003"],
    [named("UpgradeError"), "RR-DB-004"],
    [named("OpenFailedError"), "RR-DB-001"],
    [named("MissingAPIError"), "RR-DB-001"],
    [named("ZodError"), "RR-DB-006"],
    [named("ChunkLoadError"), "RR-APP-005"],
    [new Error("Loading chunk 42 failed."), "RR-APP-005"],
    [named("TimeoutError"), "RR-NET-002"],
    [new TypeError("Failed to fetch"), "RR-NET-001"],
    [{ status: 401, message: "JWT expired" }, "RR-AUTH-004"],
    [{ status: 504 }, "RR-NET-002"],
    [{ status: 429 }, "RR-NET-003"],
    [{ status: 503 }, "RR-NET-004"],
    [{ code: "42501", message: "rls" }, "RR-AUTH-004"],
    [{ code: "23514", message: "check" }, "RR-SYNC-003"],
    [{ code: "22023", message: "bad param" }, "RR-SYNC-003"],
    [new Error("RR-APP-006: invalid environment"), "RR-APP-006"],
    ["a string", "RR-APP-001"],
  ] as const)("%o → %s", (input, code) => {
    expect(toAppError(input).code).toBe(code);
  });

  it("uses the caller's fallback when nothing matches", () => {
    expect(toAppError(new Error("boom"), "RR-DB-002").code).toBe("RR-DB-002");
  });

  it("passes AppErrors through untouched", () => {
    const original = new AppError("RR-IMP-001");
    expect(toAppError(original)).toBe(original);
  });
});

describe("Result helpers", () => {
  it("ok / err / unwrap", () => {
    expect(unwrap(ok(3))).toBe(3);
    expect(() => unwrap(err(new AppError("RR-DB-005")))).toThrow(AppError);
  });

  it("tryAsync captures throws with the fallback code", async () => {
    await expect(tryAsync(() => Promise.resolve(1), "RR-DB-002")).resolves.toEqual({
      ok: true,
      value: 1,
    });
    const failed = await tryAsync(() => Promise.reject(new Error("nope")), "RR-DB-002");
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error.code).toBe("RR-DB-002");
  });
});

describe("assertNever", () => {
  it("throws with the label", () => {
    expect(() => assertNever("x" as never, "filter")).toThrow("Unhandled filter");
  });
});

describe("reportError", () => {
  afterEach(() => {
    setTelemetry(noopTelemetry);
    clearDiagnostics();
  });

  it("records diagnostics, sends telemetry with code + page, and returns an error id", () => {
    const captured: Parameters<Telemetry["captureError"]>[] = [];
    setTelemetry({ captureError: (...args) => captured.push(args) });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const reported = reportError(new TypeError("Failed to fetch"), {
      pageId: "P01",
      now: new Date("2026-09-08T09:41:00Z"),
    });

    expect(reported.error.code).toBe("RR-NET-001");
    expect(reported.errorId).toMatch(/^[0-9a-f]{8}$/);
    expect(captured[0]?.[1]).toEqual({ pageId: "P01", errorId: reported.errorId });
    expect(recentDiagnostics()).toEqual([
      {
        at: "2026-09-08T09:41:00.000Z",
        code: "RR-NET-001",
        pageId: "P01",
        errorId: reported.errorId,
      },
    ]);
    expect(
      formatDiagnostics({ version: "1.0.0", env: "test", now: new Date("2026-09-08T10:00:00Z") }),
    ).toContain("RR-NET-001  P01");
  });

  it("never throws even if telemetry does", () => {
    setTelemetry({
      captureError() {
        throw new Error("sentry down");
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => reportError(new Error("x"))).not.toThrow();
  });

  it("diagnostics say so when empty, and keep at most 50 entries", () => {
    expect(formatDiagnostics({ version: "1", env: "test", now: new Date(0) })).toContain(
      "No errors recorded",
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (let i = 0; i < 60; i++) reportError(new Error("x"));
    expect(recentDiagnostics()).toHaveLength(50);
  });

  it("error ids are short hex", () => {
    expect(newErrorId()).toMatch(/^[0-9a-f]{8}$/);
  });
});
