import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

/**
 * Lint rules double as architecture guardrails (TECH_SPEC §1.2 and §7).
 * Type-aware rules catch the async mistakes that become silent failures.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "android/**",
    "playwright-report/**",
    "test-results/**",
    "supabase/functions/**",
    "docs/handoff/**",
    "next-env.d.ts",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "react/no-danger": "error",
      eqeqeq: ["error", "always"],
    },
  },
  // Playwright fixtures call `use()`, which is not a React hook.
  {
    files: ["tests/e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  // domain/ is pure: no React, no storage, no network, no platform (TECH_SPEC §1.2).
  {
    files: ["domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "next", "next/*"],
              message: "domain/ must stay framework-free.",
            },
            { group: ["dexie", "dexie-*", "@supabase/*"], message: "domain/ must not do I/O." },
            {
              group: ["@/data/*", "@/features/*", "@/components/*", "@/lib/platform/*"],
              message: "domain/ depends on nothing but itself.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "localStorage", message: "domain/ must not do I/O." },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Date",
          property: "now",
          message: "Pass `now` in as a parameter so rules stay testable.",
        },
      ],
    },
  },
  // UI never touches storage or the network directly: writes go through commands, reads through hooks.
  {
    files: ["components/**/*.{ts,tsx}", "features/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["dexie"], message: "Use data/hooks (reads) and data/commands (writes)." },
            {
              group: ["@supabase/*", "@/lib/supabase/*"],
              message: "Only data/sync and data/remote talk to Supabase.",
            },
            {
              group: ["@/data/db/*"],
              message: "Use data/hooks (reads) and data/commands (writes).",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
