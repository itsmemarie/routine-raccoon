## What and why

<!-- Link the handoff section / PRD requirement this implements. -->

## Definition of done (TECH_SPEC §4)

- [ ] `npm run verify` is green locally
- [ ] New failure paths have a code in `lib/errors/codes.ts`, the page→codes table is updated, `npm run errors:doc` committed
- [ ] New screens: route folder with `page.tsx` + `error.tsx`, page ID in `lib/errors/pages.ts`, `<ScreenRoot pageId>`, E2E smoke + fault test
- [ ] Writes go through `data/commands`, reads through `data/hooks`
- [ ] Bug fixes include a test that failed before the fix
- [ ] TECH_SPEC.md updated if a decision changed
- [ ] No secrets, real user data, or the prototype's placeholder film still
