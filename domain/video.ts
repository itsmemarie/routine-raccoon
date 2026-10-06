/**
 * Embedded video links (PRD R5: "plays embedded, so I never leave the app").
 *
 * Security (TECH_SPEC §3.5): we never put a user-supplied URL into an iframe. We parse it, check
 * the host against an allowlist, extract the video id, and BUILD the embed URL ourselves.
 */

export interface VideoEmbed {
  readonly provider: "youtube" | "tiktok";
  readonly id: string;
  readonly embedUrl: string;
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);
const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const TIKTOK_ID = /^\d{8,25}$/;

/** Returns the safe embed for a supported link, or `null` (caller shows RR-VAL-003). */
export function parseVideoUrl(input: string): VideoEmbed | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null; // Not a URL at all: the form shows RR-VAL-003.
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) {
    let id: string | null = null;
    if (host.endsWith("youtu.be")) id = url.pathname.slice(1).split("/")[0] ?? null;
    else if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const match = /^\/(?:shorts|embed|live)\/([^/?#]+)/.exec(url.pathname);
      id = match?.[1] ?? null;
    }
    return id && YOUTUBE_ID.test(id)
      ? { provider: "youtube", id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}` }
      : null;
  }

  if (TIKTOK_HOSTS.has(host)) {
    const match = /\/video\/(\d+)/.exec(url.pathname);
    const id = match?.[1] ?? null;
    return id && TIKTOK_ID.test(id)
      ? { provider: "tiktok", id, embedUrl: `https://www.tiktok.com/embed/v2/${id}` }
      : null;
  }

  return null;
}
