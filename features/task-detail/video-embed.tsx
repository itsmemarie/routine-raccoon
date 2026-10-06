"use client";

import { useEffect, useState } from "react";
import { InlineError } from "@/components/errors/inline-error";
import { parseVideoUrl } from "@/domain/video";
import { AppError } from "@/lib/errors/app-error";
import type { PageId } from "@/lib/errors/pages";

/**
 * Embedded video that plays in the app (PRD R5). Security (TECH_SPEC §3.5): the iframe URL is
 * BUILT from a parsed, allow-listed id, never the user's link; the frame is sandboxed. Offline
 * it shows RR-MED-001 instead of a blank box.
 */
export function VideoEmbed({ url, pageId }: { url: string; pageId: PageId }) {
  const embed = parseVideoUrl(url);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!embed) return <InlineError error={new AppError("RR-VAL-003")} pageId={pageId} />;
  if (!online) return <InlineError error={new AppError("RR-MED-001")} pageId={pageId} />;
  const portrait = embed.provider === "tiktok";
  return (
    <div
      className={`overflow-hidden rounded-xl bg-ink ${portrait ? "mx-auto aspect-[9/16] max-h-[560px] w-full max-w-[325px]" : "aspect-video w-full"}`}
    >
      <iframe
        src={embed.embedUrl}
        title={embed.provider === "youtube" ? "YouTube video" : "TikTok video"}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        allow="encrypted-media; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        className="size-full border-0"
      />
    </div>
  );
}
