"use client";

import "./globals.css";
import { RouteError, type RouteErrorProps } from "@/components/errors/route-error";

/**
 * Last-resort boundary for errors in the root layout itself (page P00). It replaces the whole
 * document, so it renders its own <html>/<body> and imports the global styles (Next.js 16 docs).
 */
export default function GlobalError(props: RouteErrorProps) {
  return (
    <html lang="en-GB">
      <body className="bg-screen">
        <title>Something went wrong · Routine Raccoon</title>
        <RouteError {...props} pageId="P00" />
      </body>
    </html>
  );
}
