import type { NextConfig } from "next";

/**
 * Routine Raccoon ships as a static export (TECH_SPEC D2). The `out/` folder is the whole app:
 * Capacitor copies it into the Android shell, and CI serves it for E2E tests and web previews.
 *
 * Static export rules out proxy.ts, Server Actions, cookies, rewrites, headers and dynamic
 * route segments. Entity IDs therefore travel as query params (`/task?id=…`).
 */

const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? "local";
const faultsEnabled = process.env.NEXT_PUBLIC_ENABLE_FAULTS === "1";

// Guardrail: fault injection must never reach a production build (TECH_SPEC §1.5 rule 10).
if (appEnv === "production" && faultsEnabled) {
  throw new Error(
    "RR-APP-006: NEXT_PUBLIC_ENABLE_FAULTS=1 is not allowed when NEXT_PUBLIC_APP_ENV=production.",
  );
}

const nextConfig: NextConfig = {
  output: "export",
  // Capacitor and static hosts resolve `/task/` to `task/index.html`.
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
