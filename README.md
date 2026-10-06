# Routine Raccoon

A daily routine app for one person that rebuilds itself every day. It has instructions inside each task and a smaller **Survival Mode** version of the day for low-capacity days.

- **Product:** [`docs/handoff/source/PRD-daily-routine-app.md`](docs/handoff/source/PRD-daily-routine-app.md) · **Behaviour and design:** [`docs/handoff/README.md`](docs/handoff/README.md) (open `docs/handoff/design/Routine Raccoon Prototype.dc.html` in a browser)
- **Engineering blueprint:** [`TECH_SPEC.md`](TECH_SPEC.md) · **Error codes:** [`docs/ERROR_CODES.md`](docs/ERROR_CODES.md) · **Agent rules:** [`AGENTS.md`](AGENTS.md)

## Stack

The app is local-first: the phone is the source of truth, and an optional Supabase account keeps a backup copy.

- Next.js 16 as a static export inside a Capacitor 8 Android shell.
- React 19, TypeScript (strict) and Tailwind 4.
- Dexie (IndexedDB) for on-device data and Zod for validation.
- Supabase for the backup copy and Sentry for error monitoring.

## Status

- **Built (web, Phase 2):** every screen in the handoff: Today, task detail and form, sections, Day Plans, Survival Mode, timer, Log, Progress, Archive, Day complete, setup questions, export, account sign-in and sync.
- **Waiting on approval:** two database migrations in `supabase/migrations/` (hardening, and the account RPCs). Until they are applied, the section length override and the day's picked plan stay on the phone, and the email check / delete account show `RR-AUTH-006` / `RR-AUTH-007`.
- **Phase 3 (Android):** the Capacitor shell, exact-time notifications, share target, Google via Credential Manager, Keystore sessions, widget, Claude assist.

## Getting started

```bash
nvm use                      # Node 22
npm ci
cp .env.example .env         # works as-is: no Supabase needed for local-first use
npm run dev                  # http://localhost:3000, seeded with the prototype's demo routine
```

Optional: `npm run setup:env` asks for the Supabase URL and publishable key.

## Scripts

| Command                           | What it does                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                     | Dev server                                                                                                      |
| `npm run verify`                  | Typecheck, lint, format check, error-code docs check, tests with coverage gates, production build               |
| `npm test` / `npm run test:watch` | Vitest: unit, component, integration, architecture                                                              |
| `npm run e2e`                     | Playwright against `out/`. Build first with `NEXT_PUBLIC_ENABLE_FAULTS=1 NEXT_PUBLIC_SEED_DEMO=1 npm run build` |
| `npm run errors:doc`              | Regenerate `docs/ERROR_CODES.md` from the registry                                                              |
| `npm run preview`                 | Serve the static export on :3000                                                                                |
| `npm run cap:sync`                | Build and copy into the Android shell (Phase 3, after `npx cap add android`)                                    |

## Error codes

Every failure the user can see shows a code and the page it happened on, for example `RR-DB-002 · P01 · #d17e46bc`.

- The code says what went wrong.
- The page ID says which screen it was on.
- The `#id` matches the Sentry event.

The full list is in-app under **Settings → Help**, and in [`docs/ERROR_CODES.md`](docs/ERROR_CODES.md).

## Layout

```
app/         routes only (page.tsx + error.tsx per screen)
features/    screens and feature UI
domain/      pure business rules (tested to ≥95%)
data/        Dexie schema, commands (writes), hooks (reads), sync engine
components/  design-system primitives and error UI
lib/         errors, retry, telemetry, env, platform adapters, Supabase client
supabase/    migrations, pgTAP tests
tests/       Playwright E2E, factories, architecture tests
```
