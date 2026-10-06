import "@fontsource-variable/outfit";
import "@fontsource-variable/manrope";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "@/features/shell";

export const metadata: Metadata = {
  title: { default: "Routine Raccoon", template: "%s · Routine Raccoon" },
  description:
    "A daily routine that rebuilds itself every day, with a smaller version for hard days.",
  applicationName: "Routine Raccoon",
  icons: { icon: "/icons/routine-raccoon-logo.png", apple: "/icons/routine-raccoon-logo.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#E5134A",
};

/**
 * Content-Security-Policy for production builds (TECH_SPEC §3.5). Delivered as a <meta> tag
 * because a static export has no server to send headers. 'unsafe-inline' scripts are required
 * by Next.js's inline bootstrap in a static export; everything else is locked to an allowlist.
 */
function contentSecurityPolicy(): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://i.ytimg.com",
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} https://*.ingest.sentry.io https://*.ingest.de.sentry.io`.trim(),
    "frame-src https://www.youtube-nocookie.com https://www.tiktok.com",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      <head>
        {process.env.NODE_ENV === "production" ? (
          <meta httpEquiv="Content-Security-Policy" content={contentSecurityPolicy()} />
        ) : null}
      </head>
      <body className="min-h-full bg-screen">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
