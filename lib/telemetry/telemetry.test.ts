// @vitest-environment jsdom
import { AppError } from "@/lib/errors/app-error";
import { installGlobalErrorHandlers } from "@/lib/errors/global-handlers";
import type { ReportedError } from "@/lib/errors/report";
import { getTelemetry, initTelemetry, noopTelemetry, setTelemetry } from "./telemetry";

const sentry = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn() }));
vi.mock("@sentry/react", () => sentry);

describe("telemetry", () => {
  afterEach(() => setTelemetry(noopTelemetry));

  it("stays a no-op without a DSN", async () => {
    await initTelemetry({ dsn: undefined, environment: "local", release: "1" });
    expect(sentry.init).not.toHaveBeenCalled();
    expect(getTelemetry()).toBe(noopTelemetry);
    expect(() =>
      noopTelemetry.captureError(new AppError("RR-APP-001"), { pageId: null, errorId: "x" }),
    ).not.toThrow();
  });

  it("initialises Sentry with privacy defaults and tags every event with code and page", async () => {
    await initTelemetry({
      dsn: "https://k@o.ingest.sentry.io/1",
      environment: "staging",
      release: "1.0.0",
    });
    const options = sentry.init.mock.calls[0]?.[0] as Record<string, unknown> & {
      beforeBreadcrumb: (c: { category: string }) => unknown;
      beforeSend: (e: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(options).toMatchObject({
      environment: "staging",
      enhanceFetchErrorMessages: "report-only",
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        urlQueryParams: false,
      },
    });
    expect(options.beforeBreadcrumb({ category: "console" })).toBeNull();
    expect(options.beforeBreadcrumb({ category: "navigation" })).toEqual({
      category: "navigation",
    });
    expect(options.beforeSend({ user: { email: "x" }, request: {}, message: "m" })).toEqual({
      message: "m",
    });

    getTelemetry().captureError(new AppError("RR-DB-002", { context: { table: "tasks" } }), {
      pageId: "P01",
      errorId: "abcd1234",
    });
    expect(sentry.captureException).toHaveBeenCalledWith(expect.any(AppError), {
      tags: { "error.code": "RR-DB-002", "page.id": "P01", "error.id": "abcd1234" },
      extra: { table: "tasks" },
      level: "error",
    });
    getTelemetry().captureError(new AppError("RR-APP-001"), { pageId: null, errorId: "b" });
    getTelemetry().captureError(new AppError("RR-NET-001"), { pageId: null, errorId: "c" });
    expect(
      sentry.captureException.mock.calls.map((c) => (c[1] as { level: string }).level),
    ).toEqual(["error", "fatal", "warning"]);
  });
});

describe("global error handlers", () => {
  it("report uncaught errors and rejections as RR-APP-002 (or a more specific code)", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reported: ReportedError[] = [];
    const uninstall = installGlobalErrorHandlers((r) => reported.push(r));

    window.dispatchEvent(new ErrorEvent("error", { error: new Error("boom"), message: "boom" }));
    const rejection = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(rejection, "reason", { value: new TypeError("Failed to fetch") });
    window.dispatchEvent(rejection);

    expect(reported.map((r) => r.error.code)).toEqual(["RR-APP-002", "RR-NET-001"]);
    uninstall();
    window.dispatchEvent(new ErrorEvent("error", { message: "after" }));
    expect(reported).toHaveLength(2);
  });
});
