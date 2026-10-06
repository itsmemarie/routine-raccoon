import { EVERY_DAY, recurrenceLabel, recursOn } from "./recurrence";
import type { Recurrence } from "./types";

const custom = (overrides: Partial<Recurrence>): Recurrence => ({
  kind: "custom",
  days: [],
  n: 1,
  per: "week",
  ends: "never",
  ...overrides,
});

// 2026-09-07 is a Monday.
const MON = "2026-09-07";

describe("recursOn", () => {
  it("null and 'every day' recur daily from the anchor", () => {
    expect(recursOn(null, "2020-01-01", MON)).toBe(true);
    expect(recursOn(EVERY_DAY, "2026-09-09", MON)).toBe(true);
  });

  it("never recurs before the start", () => {
    expect(recursOn(EVERY_DAY, "2026-09-06", MON)).toBe(false);
    expect(recursOn({ ...EVERY_DAY, start: "2026-09-10" }, "2026-09-09", MON)).toBe(false);
  });

  it("'every week' without a day list repeats on the anchor's weekday", () => {
    const rec: Recurrence = { ...EVERY_DAY, kind: "every week", days: [] };
    expect(recursOn(rec, "2026-09-14", MON)).toBe(true);
    expect(recursOn(rec, "2026-09-15", MON)).toBe(false);
  });

  it("'every week' with a partial day list uses those weekdays", () => {
    const rec: Recurrence = { ...EVERY_DAY, kind: "every week", days: [1, 3] };
    expect(recursOn(rec, "2026-09-08", MON)).toBe(true); // Tue
    expect(recursOn(rec, "2026-09-09", MON)).toBe(false); // Wed
  });

  it("'every month' repeats on the anchor's day, clamped to short months", () => {
    const rec: Recurrence = { ...EVERY_DAY, kind: "every month" };
    expect(recursOn(rec, "2026-10-07", MON)).toBe(true);
    expect(recursOn(rec, "2026-10-08", MON)).toBe(false);
    expect(recursOn(rec, "2027-02-28", "2027-01-31")).toBe(true);
  });

  it("custom every 2 days", () => {
    const rec = custom({ per: "day", n: 2 });
    expect(recursOn(rec, "2026-09-09", MON)).toBe(true);
    expect(recursOn(rec, "2026-09-10", MON)).toBe(false);
  });

  it("custom every 2 weeks on Mon, Wed, Fri (prototype seed)", () => {
    const rec = custom({ per: "week", n: 2, days: [0, 2, 4] });
    expect(recursOn(rec, "2026-09-09", MON)).toBe(true); // Wed, week 0
    expect(recursOn(rec, "2026-09-16", MON)).toBe(false); // Wed, week 1
    expect(recursOn(rec, "2026-09-23", MON)).toBe(true); // Wed, week 2
    expect(recursOn(rec, "2026-09-22", MON)).toBe(false); // Tue
  });

  it("custom weekly with no days falls back to the anchor weekday", () => {
    const rec = custom({ per: "week", n: 1, days: [] });
    expect(recursOn(rec, "2026-09-14", MON)).toBe(true);
    expect(recursOn(rec, "2026-09-15", MON)).toBe(false);
  });

  it("custom every 3 months and yearly", () => {
    expect(recursOn(custom({ per: "month", n: 3 }), "2026-12-07", MON)).toBe(true);
    expect(recursOn(custom({ per: "month", n: 3 }), "2026-11-07", MON)).toBe(false);
    expect(recursOn(custom({ per: "year", n: 1 }), "2027-09-07", MON)).toBe(true);
    expect(recursOn(custom({ per: "year", n: 1 }), "2027-09-08", MON)).toBe(false);
    expect(recursOn(custom({ per: "year", n: 2 }), "2027-09-07", MON)).toBe(false);
  });

  it("ends on a date (inclusive)", () => {
    const rec: Recurrence = { ...EVERY_DAY, ends: "date", until: "2026-09-10" };
    expect(recursOn(rec, "2026-09-10", MON)).toBe(true);
    expect(recursOn(rec, "2026-09-11", MON)).toBe(false);
  });

  it("ends after a count of occurrences", () => {
    const rec = custom({ per: "day", n: 2, ends: "count", count: 3 });
    expect(recursOn(rec, "2026-09-07", MON)).toBe(true); // 1
    expect(recursOn(rec, "2026-09-11", MON)).toBe(true); // 3
    expect(recursOn(rec, "2026-09-13", MON)).toBe(false); // would be 4
  });
});

describe("recurrenceLabel", () => {
  it("uses the kind text for non-custom", () => {
    expect(recurrenceLabel(null)).toBe("every day");
    expect(recurrenceLabel(EVERY_DAY)).toBe("every day");
    expect(recurrenceLabel({ ...EVERY_DAY, kind: "every month" })).toBe("every month");
  });

  it("lists weekdays, interval and end", () => {
    expect(recurrenceLabel(custom({ days: [4, 0, 2] }))).toBe("Mon, Wed, Fri");
    expect(recurrenceLabel(custom({ days: [0, 2, 4], n: 2 }))).toBe(
      "Mon, Wed, Fri · every 2 weeks",
    );
    expect(recurrenceLabel(custom({ days: [0, 1, 2, 3, 4, 5, 6] }))).toBe("every day");
    expect(recurrenceLabel(custom({ per: "month" }))).toBe("every month");
    expect(recurrenceLabel(custom({ days: [0], ends: "count", count: 10 }))).toBe(
      "Mon · ends after 10",
    );
    expect(recurrenceLabel(custom({ days: [0], ends: "date", until: "2026-12-31" }))).toBe(
      "Mon · until 2026-12-31",
    );
  });

  it("falls back to 'custom' when nothing describes it", () => {
    expect(recurrenceLabel(custom({}))).toBe("custom");
  });
});

describe("frequency presets", () => {
  it("maps chips to stored recurrences and back", async () => {
    const { customDraft, frequencyOf, presetRecurrence } = await import("./recurrence");
    expect(presetRecurrence("every day", "2026-09-08")).toBeNull();
    expect(frequencyOf(null)).toBe("every day");
    const weekly = presetRecurrence("every week", "2026-09-08");
    expect(weekly).toMatchObject({ kind: "every week", start: "2026-09-08" });
    expect(frequencyOf(weekly)).toBe("every week");
    expect(presetRecurrence("every month", "2026-09-08")).toMatchObject({
      kind: "every month",
      per: "month",
    });
    expect(customDraft(null, "2026-09-08")).toMatchObject({
      kind: "custom",
      days: [1],
      per: "week",
    });
    const custom = {
      kind: "custom" as const,
      days: [0, 2],
      n: 2,
      per: "week" as const,
      ends: "never" as const,
    };
    expect(customDraft(custom, "2026-09-08")).toEqual(custom);
    expect(customDraft(custom, "2026-09-08").days).not.toBe(custom.days);
  });
});
