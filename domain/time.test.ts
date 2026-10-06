import {
  addDays,
  dayKeyFor,
  daysBetween,
  daysInMonth,
  formatDayHeading,
  formatDayShort,
  formatHHMM,
  formatHHMM12,
  formatLogDay,
  localDayKey,
  nextResetAt,
  parseHHMM,
  partsOf,
  weekdayOf,
} from "./time";

// TZ is pinned to Europe/Berlin in vitest.config.ts.

describe("parseHHMM / formatHHMM", () => {
  it.each([
    ["00:00", 0],
    ["07:30", 450],
    ["23:59", 1439],
  ])("parses %s", (input, expected) => {
    expect(parseHHMM(input)).toBe(expected);
  });

  it.each(["24:00", "7:30", "07:60", "", "ab:cd"])("rejects %s", (input) => {
    expect(parseHHMM(input)).toBeNull();
  });

  it("formats and wraps around midnight", () => {
    expect(formatHHMM(450)).toBe("07:30");
    expect(formatHHMM(1440 + 5)).toBe("00:05");
    expect(formatHHMM(-10)).toBe("23:50");
  });

  it.each([
    ["00:00", "12:00 AM"],
    ["02:05", "2:05 AM"],
    ["12:00", "12:00 PM"],
    ["18:30", "6:30 PM"],
  ])("formats %s as 12h %s", (input, expected) => {
    expect(formatHHMM12(input)).toBe(expected);
  });
});

describe("dayKeyFor (handoff: local date of now − resetAt)", () => {
  it("01:30 on 9 Sep belongs to 8 Sep with a 02:00 reset", () => {
    expect(dayKeyFor(new Date(2026, 8, 9, 1, 30), "02:00")).toBe("2026-09-08");
  });

  it("02:00 exactly starts the new day", () => {
    expect(dayKeyFor(new Date(2026, 8, 9, 2, 0), "02:00")).toBe("2026-09-09");
  });

  it("midnight reset uses the calendar date", () => {
    expect(dayKeyFor(new Date(2026, 8, 9, 0, 0), "00:00")).toBe("2026-09-09");
  });

  it("falls back to midnight for an invalid reset time", () => {
    expect(dayKeyFor(new Date(2026, 8, 9, 0, 30), "bad")).toBe("2026-09-09");
  });

  it("is DST-safe on the spring-forward night (Europe/Berlin, 29 Mar 2026)", () => {
    // 02:00 → 03:00 jump. 01:59 belongs to the previous day with a 02:00 reset; 03:00 to the new one.
    expect(dayKeyFor(new Date(2026, 2, 29, 1, 59), "02:00")).toBe("2026-03-28");
    expect(dayKeyFor(new Date(2026, 2, 29, 3, 0), "02:00")).toBe("2026-03-29");
  });

  it("is DST-safe on the fall-back night (Europe/Berlin, 25 Oct 2026)", () => {
    expect(dayKeyFor(new Date(2026, 9, 25, 2, 30), "04:00")).toBe("2026-10-24");
    expect(dayKeyFor(new Date(2026, 9, 25, 4, 0), "04:00")).toBe("2026-10-25");
  });
});

describe("nextResetAt", () => {
  it("returns today's reset when it is still ahead", () => {
    const next = nextResetAt(new Date(2026, 8, 9, 1, 0), "02:00");
    expect(next).toEqual(new Date(2026, 8, 9, 2, 0));
  });

  it("returns tomorrow's reset when today's has passed", () => {
    const next = nextResetAt(new Date(2026, 8, 9, 2, 0), "02:00");
    expect(next).toEqual(new Date(2026, 8, 10, 2, 0));
  });

  it("treats an invalid reset as midnight", () => {
    expect(nextResetAt(new Date(2026, 8, 9, 13, 0), "nope")).toEqual(new Date(2026, 8, 10, 0, 0));
  });
});

describe("calendar arithmetic", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts days between, signed", () => {
    expect(daysBetween("2026-09-01", "2026-09-08")).toBe(7);
    expect(daysBetween("2026-09-08", "2026-09-01")).toBe(-7);
    // Across the DST change the count is still whole days.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("weekday is 0 = Monday", () => {
    expect(weekdayOf("2026-09-07")).toBe(0); // Monday
    expect(weekdayOf("2026-09-13")).toBe(6); // Sunday
  });

  it("knows month lengths", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(partsOf("2026-09-08")).toEqual({ year: 2026, month: 9, day: 8 });
  });

  it("local day key uses the wall clock", () => {
    expect(localDayKey(new Date(2026, 8, 8, 23, 59))).toBe("2026-09-08");
  });
});

describe("formatting", () => {
  it("formats the Today heading", () => {
    expect(formatDayHeading("2026-09-08")).toBe("Tuesday 8 September");
  });

  it("formats short days and log headings", () => {
    expect(formatDayShort("2026-09-08")).toBe("Tue 8 Sep");
    expect(formatLogDay("2026-09-08", "2026-09-08")).toBe("Today · Tue 8 Sep");
    expect(formatLogDay("2026-09-07", "2026-09-08")).toBe("Yesterday · Mon 7 Sep");
    expect(formatLogDay("2026-09-06", "2026-09-08")).toBe("Sun 6 Sep");
  });
});

describe("12-hour clock conversion", () => {
  it.each([
    ["00:00", 12, 0, "AM", "12:00 AM"],
    ["02:00", 2, 0, "AM", "2:00 AM"],
    ["12:30", 12, 30, "PM", "12:30 PM"],
    ["23:55", 11, 55, "PM", "11:55 PM"],
  ] as const)("%s ↔ %i:%i %s", async (hhmm, hour, minute, period, label) => {
    const { formatHHMM12, fromClock12, toClock12 } = await import("./time");
    expect(toClock12(hhmm)).toEqual({ hour, minute, period });
    expect(fromClock12({ hour, minute, period })).toBe(hhmm);
    expect(formatHHMM12(hhmm)).toBe(label);
  });

  it("clamps out-of-range wheel values", async () => {
    const { fromClock12 } = await import("./time");
    expect(fromClock12({ hour: 13, minute: 75, period: "AM" })).toBe("00:59");
  });
});

describe("formatRelative", () => {
  it.each([
    ["2026-09-08T09:59:40Z", "just now"],
    ["2026-09-08T09:55:00Z", "5 min ago"],
    ["2026-09-08T07:00:00Z", "3 h ago"],
    ["2026-09-07T09:00:00Z", "yesterday"],
    ["2026-09-04T10:00:00Z", "4 days ago"],
    ["nonsense", "a while ago"],
  ])("%s → %s", async (from, label) => {
    const { formatRelative } = await import("./time");
    expect(formatRelative(from, new Date("2026-09-08T10:00:00Z"))).toBe(label);
  });
});
