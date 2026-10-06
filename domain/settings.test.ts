import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";

describe("normalizeSettings", () => {
  it("maps the retired app's key names so a user's choices survive the first sync", () => {
    // Shape found in the live cloud copy on 3 Oct 2026 (values synthetic).
    const legacy = {
      resetAt: "02:00",
      showLevelPicker: false,
      carryOverUnfinished: true,
      exportIncludesArchive: false,
      extraSupportThresholdMinutes: 30,
      defaultSurvivalLevel: 1,
      survivalDayCountsAsFullDay: true,
      smallerVersionRatio: 0.5,
      undoWindowSeconds: 5,
      avoidanceThresholdDays: 4,
      blockClosingLeadMinutes: 15,
      survivalShowsWholeSharedSections: false,
    };
    expect(normalizeSettings(legacy)).toEqual({
      ...DEFAULT_SETTINGS,
      resetAt: "02:00",
      showLevel: false,
      roll: true,
      exportArchive: false,
      longAt: 30,
      defaultLevel: 1,
      survivalCountsAsFullDay: true,
    });
  });

  it("prefers a current key over its legacy twin", () => {
    expect(normalizeSettings({ longAt: 15, extraSupportThresholdMinutes: 45 }).longAt).toBe(15);
  });

  it("falls back to defaults for missing, invalid or non-object input", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("x")).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ defaultSurvivalLevel: 9 }).defaultLevel).toBe(2);
  });

  it("drops keys it doesn't know", () => {
    expect(normalizeSettings({ undoWindowSeconds: 9 })).not.toHaveProperty("undoWindowSeconds");
  });
});
