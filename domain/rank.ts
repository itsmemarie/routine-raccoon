import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/**
 * Ordering keys for the `rank` text columns. Fractional indexing lets a drag-and-drop reorder
 * write ONE row (the moved item) instead of renumbering its siblings, which keeps sync
 * conflicts small. Keys compare with plain string comparison (`a < b`).
 *
 * Real data is not always tidy: two phones appending offline produce EQUAL keys, and rows from
 * older app versions may hold keys this library rejects. Every helper here therefore tolerates
 * duplicate and invalid keys, and `rankForPosition` falls back to renumbering the siblings.
 */

export interface Ranked {
  readonly rank: string;
  readonly id?: string;
  readonly section_id?: string;
}

function generateOrNull(before: string | null, after: string | null): string | null {
  try {
    return generateKeyBetween(before, after);
  } catch {
    // Equal or out-of-order neighbours, or a key in a format this library doesn't produce.
    // Callers rebalance instead; nothing is lost.
    return null;
  }
}

/** A key strictly between `before` and `after` (either may be null for the ends of the list). */
export function rankBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

/** A key after the last item, for appends. */
export function rankAfter(last: string | null): string {
  return generateOrNull(last, null) ?? generateKeyBetween(null, null);
}

/** `count` evenly spread keys after `last`, for bulk inserts such as a pasted list. */
export function ranksAfter(last: string | null, count: number): string[] {
  try {
    return generateNKeysBetween(last, null, count);
  } catch {
    return generateNKeysBetween(null, null, count);
  }
}

/**
 * Sort comparator: rank first, then a stable tiebreaker (id, else section_id) so items with
 * equal keys always appear in the same order on every device.
 */
export function compareRank(a: Ranked, b: Ranked): number {
  if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
  const ta = a.id ?? a.section_id ?? "";
  const tb = b.id ?? b.section_id ?? "";
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

export interface PositionedRank {
  /** Key for the item being placed. */
  readonly rank: string;
  /**
   * Null when only the placed item needs a key (the normal case). Otherwise new keys for EVERY
   * sibling, in the same order as the `siblings` argument: the neighbours were equal or invalid,
   * so the list is renumbered.
   */
  readonly siblingRanks: readonly string[] | null;
}

/**
 * The key that puts an item at `index` among `siblings` (sorted, NOT containing the item).
 * `index` is clamped to 0…siblings.length.
 */
export function rankForPosition(siblings: readonly Ranked[], index: number): PositionedRank {
  const at = Math.max(0, Math.min(siblings.length, Math.trunc(index)));
  const before = at > 0 ? (siblings[at - 1]?.rank ?? null) : null;
  const after = at < siblings.length ? (siblings[at]?.rank ?? null) : null;
  const key = generateOrNull(before, after);
  if (key !== null) return { rank: key, siblingRanks: null };
  const keys = generateNKeysBetween(null, null, siblings.length + 1);
  const siblingRanks = keys.filter((_, i) => i !== at);
  return { rank: keys[at] ?? keys[keys.length - 1] ?? "a0", siblingRanks };
}
