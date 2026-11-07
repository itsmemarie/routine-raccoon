/**
 * Web links inside a note. Notes stay plain text in storage (TECH_SPEC §3.5): this only works out
 * which pieces to show as links, so nothing typed can ever turn into markup.
 *
 * Security: only http(s) addresses become links, so `javascript:` and friends stay inert text.
 */

export type TextPart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly href: string };

const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
const TRAILING_PUNCTUATION = ".,;:!?'\"’”";
const OPENERS: Readonly<Record<string, string>> = { ")": "(", "]": "[", "}": "{" };

const count = (text: string, char: string) => text.split(char).length - 1;

/** "see https://a.com/b." and "(https://a.com/b)" end at the b; a wiki's "Foo_(bar)" keeps its bracket. */
function trimTrailing(raw: string): string {
  let link = raw;
  for (;;) {
    const last = link.charAt(link.length - 1);
    const opener = OPENERS[last];
    const unmatched = opener !== undefined && count(link, last) > count(link, opener);
    if (!unmatched && !TRAILING_PUNCTUATION.includes(last)) return link;
    link = link.slice(0, -1);
  }
}

function toHref(link: string): string | null {
  try {
    return new URL(/^www\./i.test(link) ? `https://${link}` : link).href;
  } catch {
    return null; // Starts like a link but isn't one ("https://["): it stays plain text.
  }
}

/** Splits text into plain and link pieces that join back into exactly the original text. */
export function splitLinks(text: string): readonly TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(LINK)) {
    const link = trimTrailing(match[0]);
    const href = toHref(link);
    if (href === null) continue;
    if (match.index > cursor) parts.push({ kind: "text", text: text.slice(cursor, match.index) });
    parts.push({ kind: "link", text: link, href });
    cursor = match.index + link.length;
  }
  if (cursor < text.length) parts.push({ kind: "text", text: text.slice(cursor) });
  return parts;
}
