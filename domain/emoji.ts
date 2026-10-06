/**
 * Emoji suggestion from a task name (PRD R16).
 *
 * Rule: case-insensitive substring match; the FIRST entry in list order wins; no match → 📋.
 * Order matters and is product-owned ("keep editable"), so it lives in one ordered array.
 *
 * @see docs/handoff/README.md "Emoji keyword map"
 */
export const EMOJI_KEYWORDS: ReadonlyArray<readonly [keywords: readonly string[], emoji: string]> =
  [
    [["shower"], "🚿"],
    [["hair"], "💇"],
    [["teeth"], "🪥"],
    [["wash"], "🧼"],
    [["dress"], "👗"],
    [["make"], "💄"],
    [["walk"], "🚶"],
    [["stretch", "medit"], "🧘"],
    [["move"], "🤸"],
    [["gym"], "🏋️"],
    [["run"], "🏃"],
    [["water", "pint", "drink"], "💧"],
    [["supplement", "pill", "vitamin"], "💊"],
    [["breakfast"], "🥣"],
    [["lunch"], "🥗"],
    [["dinner"], "🍲"],
    [["cook"], "🍳"],
    [["dish"], "🍽️"],
    [["kitchen"], "🧽"],
    [["tidy", "laundry"], "🧺"],
    [["clean"], "🧹"],
    [["bin"], "🗑️"],
    [["bed"], "🛏️"],
    [["email"], "📧"],
    [["work"], "💻"],
    [["write"], "✍️"],
    [["journal"], "📓"],
    [["read"], "📖"],
    [["plan"], "🗓️"],
    [["dog"], "🐕"],
    [["cat"], "🐈"],
    [["plant"], "🪴"],
    [["shop"], "🛒"],
    [["flower"], "💐"],
    [["nail"], "💅"],
    [["leg"], "🪒"],
    [["phone"], "📱"],
    [["call"], "📞"],
  ];

export const FALLBACK_EMOJI = "📋";

/** Returns the suggested emoji, or `null` when nothing matches (callers decide the fallback). */
export function matchEmoji(name: string): string | null {
  const haystack = name.toLowerCase();
  for (const [keywords, emoji] of EMOJI_KEYWORDS) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return emoji;
  }
  return null;
}

/** Suggested emoji with the 📋 fallback, as used for pasted tasks. */
export function suggestEmoji(name: string): string {
  return matchEmoji(name) ?? FALLBACK_EMOJI;
}
