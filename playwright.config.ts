import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the production-shaped static export (`out/`), served locally, with
 * fault injection enabled so every route's error screen can be forced (TECH_SPEC §4).
 *
 * Build first: `NEXT_PUBLIC_ENABLE_FAULTS=1 npm run build`.
 * PLAYWRIGHT_CHROMIUM_PATH lets sandboxes reuse a preinstalled Chromium.
 */
const port = Number(process.env.E2E_PORT ?? 3000);
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    timezoneId: "Europe/Berlin",
    locale: "en-GB",
  },
  projects: [
    {
      name: "android-baseline",
      use: {
        ...devices["Pixel 7"],
        // 412 × 868 is the design baseline from the handoff.
        viewport: { width: 412, height: 868 },
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  webServer: {
    command: `npx serve out --listen ${port} --no-clipboard`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
