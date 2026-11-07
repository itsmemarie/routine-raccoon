// @vitest-environment jsdom

interface Note {
  readonly type: string;
  readonly frequency: number;
  readonly startsAt: number;
  readonly stopsAt: number;
}

/** A stand-in for the browser's AudioContext that records the notes it is asked to play. */
function installAudio(state: "running" | "suspended", resume = () => Promise.resolve()) {
  const notes: Note[] = [];
  const peaks: number[] = [];
  const created = vi.fn();
  const resumed = vi.fn();

  class FakeAudioContext {
    state = state;
    currentTime = 10;
    destination = {};
    constructor() {
      created();
    }
    async resume() {
      resumed();
      await resume();
      this.state = "running";
    }
    createOscillator() {
      const note = { type: "", frequency: 0, startsAt: 0, stopsAt: 0 };
      return {
        set type(value: string) {
          note.type = value;
        },
        frequency: {
          set value(hz: number) {
            note.frequency = hz;
          },
        },
        connect: (node: unknown) => node,
        start: (at: number) => {
          note.startsAt = at;
        },
        stop: (at: number) => {
          note.stopsAt = at;
          notes.push(note);
        },
      };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: () => undefined,
          linearRampToValueAtTime: (value: number) => peaks.push(value),
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: (node: unknown) => node,
      };
    }
  }

  vi.stubGlobal("AudioContext", FakeAudioContext);
  return { notes, peaks, created, resumed };
}

/** A fresh copy of the module each time: it keeps one shared AudioContext. */
const loadChime = async () => {
  vi.resetModules();
  return import("./chime");
};

describe("timer ping", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plays two soft sine notes, one after the other", async () => {
    const audio = installAudio("running");
    const { playChime } = await loadChime();
    await playChime();

    expect(audio.notes.map((note) => note.frequency)).toEqual([880, 1318.5]);
    expect(audio.notes.every((note) => note.type === "sine")).toBe(true);
    const [first, second] = audio.notes;
    expect(second?.startsAt).toBeGreaterThan(first?.startsAt ?? Infinity);
    expect(audio.peaks.every((peak) => peak <= 0.25)).toBe(true);
    // Short enough to be discreet: over in about a second.
    expect((second?.stopsAt ?? Infinity) - 10).toBeLessThan(1);
  });

  it("is unlocked by the tap, then reuses the same audio at expiry", async () => {
    const audio = installAudio("suspended");
    const { primeChime, playChime } = await loadChime();
    await primeChime();
    expect(audio.resumed).toHaveBeenCalledTimes(1);
    expect(audio.notes).toHaveLength(0);

    await playChime();
    expect(audio.created).toHaveBeenCalledTimes(1);
    expect(audio.resumed).toHaveBeenCalledTimes(1);
    expect(audio.notes).toHaveLength(2);
  });

  it("wakes suspended audio to ring when the browser allows it straight away", async () => {
    const audio = installAudio("suspended");
    const { playChime } = await loadChime();
    await playChime();
    expect(audio.notes).toHaveLength(2);
  });

  it("stays quiet if sound is only allowed much later, so it never lands on a random tap", async () => {
    let allowSound = () => undefined as void;
    const blocked = new Promise<void>((resolve) => {
      allowSound = resolve;
    });
    const audio = installAudio("suspended", () => blocked);
    const { playChime } = await loadChime();

    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const pending = playChime();
    now.mockReturnValue(61_000);
    allowSound();
    await pending;

    expect(audio.notes).toHaveLength(0);
  });

  it("never fails the timer when there is no audio", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const { primeChime, playChime } = await loadChime();
    await expect(primeChime()).resolves.toBeUndefined();
    await expect(playChime()).resolves.toBeUndefined();
  });

  it("never fails the timer when the browser refuses audio", async () => {
    const audio = installAudio("suspended", () => Promise.reject(new Error("NotAllowedError")));
    const { primeChime, playChime } = await loadChime();
    await expect(primeChime()).resolves.toBeUndefined();
    await expect(playChime()).resolves.toBeUndefined();
    expect(audio.notes).toHaveLength(0);

    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("NotSupportedError");
        }
      },
    );
    const fresh = await loadChime();
    await expect(fresh.playChime()).resolves.toBeUndefined();
  });
});
