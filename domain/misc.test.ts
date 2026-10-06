import { occurrenceId } from "./ids";
import {
  closedCopy,
  completedCopy,
  importedCopy,
  movedCopy,
  planPickedCopy,
  skippedCopy,
  uncompletedCopy,
} from "./log";
import { compareRank, rankAfter, rankBetween, ranksAfter } from "./rank";
import { DayRecordSchema, RecurrenceSchema, SettingsSchema, TaskSchema } from "./schemas";
import { isActive, isLive } from "./types";
import { parseVideoUrl } from "./video";

describe("occurrenceId", () => {
  it("is deterministic per task and day, and differs across days", () => {
    const a = occurrenceId("11111111-1111-4111-8111-111111111111", "2026-09-08");
    expect(occurrenceId("11111111-1111-4111-8111-111111111111", "2026-09-08")).toBe(a);
    expect(occurrenceId("11111111-1111-4111-8111-111111111111", "2026-09-09")).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("rank", () => {
  it("generates keys that sort between neighbours", () => {
    const first = rankAfter(null);
    const last = rankAfter(first);
    const middle = rankBetween(first, last);
    expect([last, middle, first].map((rank) => ({ rank })).sort(compareRank)).toEqual([
      { rank: first },
      { rank: middle },
      { rank: last },
    ]);
    expect(compareRank({ rank: "a0" }, { rank: "a0" })).toBe(0);
  });

  it("generates ascending bulk keys", () => {
    const keys = ranksAfter("a0", 3);
    expect(keys).toHaveLength(3);
    expect([...keys].sort()).toEqual(keys);
    expect(keys.every((k) => k > "a0")).toBe(true);
  });
});

describe("log copy", () => {
  it("completed meta per handoff", () => {
    expect(completedCopy({ name: "Book the dentist", hard: true }, "Smash it", 15)).toEqual({
      kind: "completed",
      title: "Completed Book the dentist",
      meta: "Smash it · 15 min estimated · hard task",
    });
    expect(completedCopy({ name: "Eat", hard: false }, "Morning", 20).meta).toBe(
      "Morning · 20 min estimated",
    );
  });

  it("other entries", () => {
    expect(uncompletedCopy({ name: "Eat" }, "Morning")).toMatchObject({
      kind: "uncompleted",
      title: "Un-ticked Eat",
    });
    expect(skippedCopy({ name: "Eat" }, "Morning").meta).toBe("Morning · today only");
    expect(movedCopy({ name: "Stretch" }, "Smash it", "Evening").meta).toBe(
      "Smash it → Evening, by drag",
    );
    expect(planPickedCopy("Bad day", { survival: true, survivalName: "Survival Mode" }).title).toBe(
      "Survival Mode: Bad day",
    );
    expect(planPickedCopy("Normal", { survival: false, survivalName: "Survival Mode" }).meta).toBe(
      "Survival Mode off",
    );
    expect(closedCopy(16, 18).meta).toBe("16 of 18 ticked");
    expect(importedCopy("5 tasks → Morning")).toMatchObject({
      kind: "imported",
      title: "Pasted a list",
    });
  });
});

describe("schemas", () => {
  it("settings fall back to defaults for missing or invalid keys", () => {
    expect(SettingsSchema.parse({})).toMatchObject({
      resetAt: "00:00",
      longAt: 20,
      keepSurvivalOvernight: false,
      survivalName: "Survival Mode",
      defaultLevel: 2,
    });
    expect(SettingsSchema.parse({ longAt: "lots", resetAt: "25:00", unknownKey: 1 })).toMatchObject(
      {
        longAt: 20,
        resetAt: "00:00",
      },
    );
  });

  it("recurrence fills defaults and rejects bad weekdays", () => {
    expect(RecurrenceSchema.parse({ kind: "every day" })).toMatchObject({
      n: 1,
      per: "week",
      ends: "never",
      days: [],
    });
    expect(RecurrenceSchema.safeParse({ kind: "custom", days: [7] }).success).toBe(false);
  });

  it("day records default plan_id to null (column pending migration)", () => {
    const record = DayRecordSchema.parse({
      day_key: "2026-09-08",
      survival_on: false,
      survival_level: 2,
      closed_at: null,
      created_at: "x",
      updated_at: "x",
      deleted_at: null,
    });
    expect(record.plan_id).toBeNull();
  });

  it("tasks enforce the 1–600 minute range", () => {
    expect(TaskSchema.shape.minutes.safeParse(0).success).toBe(false);
    expect(TaskSchema.shape.minutes.safeParse(600).success).toBe(true);
  });

  it("isLive / isActive", () => {
    expect(isLive({ deleted_at: null })).toBe(true);
    expect(isActive({ deleted_at: null, archived_at: "x" })).toBe(false);
  });
});

describe("parseVideoUrl (allowlist, we build the embed URL)", () => {
  it.each([
    [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    ],
    ["https://youtu.be/dQw4w9WgXcQ?t=10", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    [
      "https://m.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    ],
    [
      "https://www.tiktok.com/@someone/video/7234567890123456789",
      "https://www.tiktok.com/embed/v2/7234567890123456789",
    ],
  ])("%s", (input, embed) => {
    expect(parseVideoUrl(input)?.embedUrl).toBe(embed);
  });

  it.each([
    "not a url",
    "javascript:alert(1)",
    "https://evil.example.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/channel/abc",
    "https://www.tiktok.com/@someone",
    "ftp://youtube.com/watch?v=dQw4w9WgXcQ",
  ])("rejects %s", (input) => {
    expect(parseVideoUrl(input)).toBeNull();
  });
});
