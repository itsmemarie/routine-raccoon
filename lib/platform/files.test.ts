// @vitest-environment jsdom
import { copyText, saveTextFile } from "./files";

const FILE = {
  fileName: "routine-raccoon-2026-09-08.json",
  mimeType: "application/json",
  content: "{}",
};

describe("saveTextFile", () => {
  let clicked: HTMLAnchorElement[];
  beforeEach(() => {
    vi.useFakeTimers();
    clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
    URL.createObjectURL = vi.fn(() => "blob:export");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, "canShare");
    Reflect.deleteProperty(navigator, "share");
  });

  function stubShare(canShare: boolean, share: () => Promise<void>) {
    Object.defineProperty(navigator, "canShare", { value: () => canShare, configurable: true });
    Object.defineProperty(navigator, "share", { value: vi.fn(share), configurable: true });
  }

  it("downloads when the platform can't share files, then frees the blob", async () => {
    const result = await saveTextFile(FILE);
    expect(result).toEqual({ ok: true, value: "downloaded" });
    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toBe(FILE.fileName);
    expect(clicked[0]?.isConnected).toBe(false);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:export");
  });

  it("offers the share sheet first where files can be shared", async () => {
    stubShare(true, () => Promise.resolve());
    expect(await saveTextFile(FILE)).toEqual({ ok: true, value: "shared" });
    expect(clicked).toHaveLength(0);
  });

  it("treats closing the share sheet as cancelled, not as an error", async () => {
    stubShare(true, () => Promise.reject(new DOMException("closed", "AbortError")));
    expect(await saveTextFile(FILE)).toEqual({ ok: true, value: "cancelled" });
    expect(clicked).toHaveLength(0);
  });

  it("falls back to a download when sharing is refused for another reason", async () => {
    stubShare(true, () => Promise.reject(new DOMException("no", "NotAllowedError")));
    expect(await saveTextFile(FILE)).toEqual({ ok: true, value: "downloaded" });
    expect(clicked).toHaveLength(1);
  });

  it("reports RR-EXP-001 when the file can't be made", async () => {
    URL.createObjectURL = vi.fn(() => {
      throw new Error("blocked");
    });
    const result = await saveTextFile(FILE);
    expect(result.ok ? null : result.error.code).toBe("RR-EXP-001");
  });
});

describe("copyText", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("returns true when copied, false when the clipboard is refused", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await copyText("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
      configurable: true,
    });
    expect(await copyText("hello")).toBe(false);
  });
});
