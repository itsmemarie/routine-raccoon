// @vitest-environment jsdom
import { resetEnvCache } from "@/lib/env";
import { pickupFeedback } from "./haptics";
import { registerServiceWorker, shouldRegisterServiceWorker } from "./service-worker";

describe("offline app shell (service worker)", () => {
  const register = vi.fn(() => Promise.resolve({}));

  beforeEach(() => {
    register.mockClear();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  it("registers /sw.js on the web production build only", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    resetEnvCache();
    expect(shouldRegisterServiceWorker()).toBe(true);
    await registerServiceWorker();
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("stays off in staging and E2E builds", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
    resetEnvCache();
    expect(shouldRegisterServiceWorker()).toBe(false);
    await registerServiceWorker();
    expect(register).not.toHaveBeenCalled();
  });

  it("a failed registration is not a user-facing failure", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    resetEnvCache();
    register.mockRejectedValueOnce(new Error("SecurityError"));
    await expect(registerServiceWorker()).resolves.toBeUndefined();
  });
});

describe("haptics", () => {
  it("vibrates briefly where the browser can, and is a no-op otherwise", () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    pickupFeedback();
    expect(vibrate).toHaveBeenCalledWith(10);
    Reflect.deleteProperty(navigator, "vibrate");
    expect(() => pickupFeedback()).not.toThrow();
  });
});
