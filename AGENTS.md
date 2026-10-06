<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Routine Raccoon: rules for coding agents

**Read `TECH_SPEC.md` first.** It is the engineering blueprint. Product behaviour lives in
`docs/handoff/README.md` (the design handoff) and `docs/handoff/source/PRD-daily-routine-app.md`.
If they disagree: behaviour → the handoff wins; technical decisions → TECH_SPEC wins.

## Where things go

| You are adding…                               | Put it in                                                                | Rule                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| A business rule (totals, recurrence, parsing) | `domain/`                                                                | Pure functions, no React/Dexie/Supabase, `now` passed in. JSDoc `@see` the handoff rule. ≥95% coverage. |
| A write (tick, edit, import)                  | `data/commands/`                                                         | One `runCommand` transaction: rows + log entry + `_dirty=1`. Returns `Result`.                          |
| A read for the UI                             | `data/hooks/`                                                            | `useLiveQuery`; throw `toAppError(e, "RR-DB-001")` on failure.                                          |
| A screen                                      | `features/<feature>/` + `app/<route>/page.tsx` + `app/<route>/error.tsx` | Route files stay thin. Screen renders inside `<ScreenRoot pageId>`.                                     |
| A UI primitive                                | `components/ui/`                                                         | No business logic, design tokens only (no raw hex).                                                     |
| Native capability                             | `lib/platform/`                                                          | Interface + web fallback.                                                                               |

## Non-negotiables

1. **Every page carries error codes.** New failure path → add a code to `lib/errors/codes.ts`, list it for its page in `lib/errors/pages.ts`, run `npm run errors:doc`. New route → `page.tsx` + `error.tsx` rendering `<RouteError pageId="Pxx">` + an entry in `PAGES`. `tests/architecture.test.ts` enforces this.
2. **No silent failures.** Never `catch {}` without a comment explaining why it's safe. Otherwise rethrow an `AppError`, return `err(...)`, or `reportError(...)` and show it (toast/panel) with its code.
3. **Strict types.** No `any`, no `!`, no `as` on external data (parse with Zod). Exhaustive switches.
4. **Components never import Dexie or Supabase** (lint-enforced). Only `data/sync` and `data/remote` talk to Supabase.
5. **Static export.** No Server Actions, no `proxy.ts`, no cookies, no dynamic route segments: entity ids go in query params.
6. **Never** commit secrets, real user data, or the prototype's placeholder film still.

## Commands

`npm run verify` (everything CI runs except E2E) · `npm run e2e` (needs `NEXT_PUBLIC_ENABLE_FAULTS=1 NEXT_PUBLIC_SEED_DEMO=1 npm run build` first) · `npm run errors:doc`
