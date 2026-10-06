// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { resetEnvCache } from "@/lib/env";
import { useFaultInjection } from "./fault-injection";

const params = vi.hoisted(() => ({ value: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => params.value }));

describe("useFaultInjection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  function withFaults(enabled: boolean, query: string) {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_FAULTS", enabled ? "1" : "0");
    resetEnvCache();
    params.value = new URLSearchParams(query);
  }

  it("does nothing when faults are disabled", () => {
    withFaults(false, "__fault=RR-DB-001");
    expect(() => renderHook(() => useFaultInjection("P01"))).not.toThrow();
  });

  it("does nothing without the param", () => {
    withFaults(true, "");
    expect(() => renderHook(() => useFaultInjection("P01"))).not.toThrow();
  });

  it("throws the requested registered code", () => {
    withFaults(true, "__fault=RR-DB-001");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useFaultInjection("P01"))).toThrow(/RR-DB-001/);
  });

  it("throws RR-APP-001 for 'render' or an unknown code", () => {
    withFaults(true, "__fault=render");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useFaultInjection("P05"))).toThrow(/RR-APP-001/);
  });
});
