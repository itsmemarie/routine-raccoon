import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit, component and integration tests (TECH_SPEC §4).
 * - TZ is pinned so day_key / DST tests are deterministic.
 * - fake-indexeddb gives Dexie a real IndexedDB implementation in Node.
 */
process.env.TZ = "Europe/Berlin";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "tests/e2e/**", "out/**", ".next/**", "android/**"],
    setupFiles: ["./tests/setup.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["domain/**", "lib/**", "data/**", "components/**"],
      exclude: [
        "**/*.test.*",
        "**/index.ts",
        "lib/supabase/database.types.ts",
        "data/db/seed-demo.ts",
      ],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
        "domain/**": { lines: 95, branches: 95, functions: 95, statements: 95 },
      },
    },
  },
});
