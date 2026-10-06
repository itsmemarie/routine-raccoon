import { defaultSmallerMinutes, displayMinutes, formatDuration, isShrunk } from "./duration";

describe("formatDuration (handoff: <60 → 25m, else 2h 07m / 2h)", () => {
  it.each([
    [0, "0m"],
    [25, "25m"],
    [59, "59m"],
    [60, "1h"],
    [127, "2h 07m"],
    [120, "2h"],
    [147, "2h 27m"],
    [-5, "0m"],
  ])("%i → %s", (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});

describe("smaller version", () => {
  it.each([
    [1, 2],
    [3, 2],
    [5, 3],
    [20, 10],
    [60, 30],
  ])("default for %i min is %i", (minutes, expected) => {
    expect(defaultSmallerMinutes(minutes)).toBe(expected);
  });

  const base = { minutes: 20, never_shrink: false, smaller_versions: {} };

  it("shows full minutes outside Survival Mode", () => {
    expect(displayMinutes(base, false)).toBe(20);
    expect(isShrunk(base, false)).toBe(false);
  });

  it("shrinks to the default in Survival Mode", () => {
    expect(displayMinutes(base, true)).toBe(10);
    expect(isShrunk(base, true)).toBe(true);
  });

  it("prefers the task's own smaller minutes", () => {
    expect(displayMinutes({ ...base, smaller_versions: { minutes: 8 } }, true)).toBe(8);
  });

  it("never shrinks exempt tasks", () => {
    const exempt = { ...base, never_shrink: true };
    expect(displayMinutes(exempt, true)).toBe(20);
    expect(isShrunk(exempt, true)).toBe(false);
  });
});
