import { EMOJI_KEYWORDS, FALLBACK_EMOJI, matchEmoji, suggestEmoji } from "./emoji";

describe("emoji suggestion", () => {
  it.each([
    ["Shower", "🚿"],
    ["Brush teeth", "🪥"],
    ["Morning stretch", "🧘"],
    ["Meditate", "🧘"],
    ["Drink a pint", "💧"],
    ["Take vitamins", "💊"],
    ["Reply to EMAIL", "📧"],
    ["Water the plants", "💧"], // "water" is listed before "plant": first match wins
  ])("%s → %s", (name, emoji) => {
    expect(suggestEmoji(name)).toBe(emoji);
  });

  it("first entry in list order wins, even when a later keyword fits better", () => {
    // Spec rule, not a bug: "make" precedes "dinner".
    expect(suggestEmoji("Make dinner")).toBe("💄");
  });

  it("falls back to 📋", () => {
    expect(matchEmoji("Sort the garage")).toBeNull();
    expect(suggestEmoji("Sort the garage")).toBe(FALLBACK_EMOJI);
  });

  it("keeps every keyword lowercase so matching stays case-insensitive", () => {
    for (const [keywords] of EMOJI_KEYWORDS) {
      for (const keyword of keywords) expect(keyword).toBe(keyword.toLowerCase());
    }
  });
});
