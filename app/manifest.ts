import type { MetadataRoute } from "next";

// Static in the export: written once to out/manifest.webmanifest.
export const dynamic = "force-static";

/**
 * Web app manifest: lets Chrome install Routine Raccoon to the home screen with its own icon
 * and open it full screen. Icons come from scripts/make-icons.mjs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Routine Raccoon",
    short_name: "Raccoon",
    description:
      "A daily routine that rebuilds itself every day, with a smaller version for hard days.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Design tokens --color-screen and --color-primary (app/globals.css).
    background_color: "#faf8f8",
    theme_color: "#e5134a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
