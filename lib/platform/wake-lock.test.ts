// @vitest-environment jsdom
import { keepScreenOn } from "./wake-lock";

const flush = () => new Promise((resolve) => setTimeout(resolve));

function installWakeLock(request: () => Promise<{ release: () => Promise<void> }>) {
  Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request } });
}

function comeBackToTheApp() {
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("keepScreenOn", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "wakeLock");
  });

  it("holds a screen lock until told to let go", async () => {
    const release = vi.fn(() => Promise.resolve());
    const request = vi.fn(() => Promise.resolve({ release }));
    installWakeLock(request);

    const letGo = keepScreenOn();
    await flush();
    expect(request).toHaveBeenCalledWith("screen");
    expect(release).not.toHaveBeenCalled();

    letGo();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("takes the lock again on return, because the browser drops it when the app is hidden", async () => {
    const request = vi.fn(() => Promise.resolve({ release: () => Promise.resolve() }));
    installWakeLock(request);

    const letGo = keepScreenOn();
    await flush();
    comeBackToTheApp();
    await flush();
    expect(request).toHaveBeenCalledTimes(2);

    letGo();
    comeBackToTheApp();
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("gives back a lock that arrives after the timer already stopped", async () => {
    const release = vi.fn(() => Promise.resolve());
    let grant = () => undefined as void;
    const granted = new Promise<void>((resolve) => {
      grant = resolve;
    });
    installWakeLock(async () => {
      await granted;
      return { release };
    });

    const letGo = keepScreenOn();
    letGo();
    expect(release).not.toHaveBeenCalled();
    grant();
    await flush();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("carries on when the phone refuses (battery saver) or has no wake lock", async () => {
    installWakeLock(() => Promise.reject(new Error("NotAllowedError")));
    const letGo = keepScreenOn();
    await flush();
    expect(letGo).not.toThrow();

    Reflect.deleteProperty(navigator, "wakeLock");
    expect(keepScreenOn()).not.toThrow();
  });
});
