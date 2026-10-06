# Handoff: Routine Raccoon (daily routine app, single user)

Updated 2 October 2026. This version replaces the earlier handoff. Everything below reflects the
current prototype **plus the product decisions made at handoff**. Where those decisions differ from
what the prototype does, the spec wins. See [Prototype vs spec](#prototype-vs-spec) for the list.

## Overview

Routine Raccoon is a daily routine app for one person that rebuilds itself every day. The routine
comes back at a configurable reset time. Every task can carry its own instructions (steps, mantra,
notes, an embedded video). When capacity is low, the user switches Today to a **Survival Mode** plan:
a shorter, separate version of the day where every task runs at its smaller version.

Product reasoning lives in `source/PRD-daily-routine-app.md`. The user's feedback round is
`source/Notes-routine-raccoon.md`.

## About the design files

The files in `design/` are **design references built in HTML**: clickable prototypes that show
intended look and behaviour. Do not port them as production code. **Recreate the designs in the
target codebase** using its own patterns and libraries.

**Target codebase:** `github.com/itsmemarie/routine-raccoon` (branch `main`). It is currently a
Next.js 16 + React 19 + Tailwind 4 scaffold with Supabase wired up (`lib/supabase/*`) and a
hand-written schema `app_routine_raccoon` (`lib/supabase/database.types.ts`). The stack is
engineering's call. Note that the PRD targets Android and several P0/P1 features need device
capabilities a plain web app does not have:

| Needs | Web/PWA | Wrapped (Capacitor/TWA) or native |
|---|---|---|
| Section notifications at exact times while app is closed | Unreliable | Yes |
| Timer that keeps running in background + expiry nudge | Partial | Yes |
| Home-screen widget (P1) | No | Yes |
| Android share sheet → app (`ACTION_SEND text/plain`) | Web Share Target (installed PWA only) | Yes |
| Google sign-in via system account chooser | Browser OAuth popup | Credential Manager |

Open `design/Routine Raccoon Prototype.dc.html` in a browser (keep `support.js` beside it). The left
rail is a screen map. State is live: ticking, dragging, creating, pasting, plan switching and auth
all work. The **Reset prototype** button restores seed data.

## Fidelity

**High fidelity.** Colours, type, spacing, radii, copy and interactions are final intent. Caveats:

- The phone frame (412 × 868) is presentation only. 412dp width is the design baseline; build
  responsively.
- The Day complete image (`uploads/leo.jpg` in the design project, a film still) is a **placeholder
  and must not ship**. Replace it with owned artwork.
- In `screenshots/`, emoji render as generic glyphs because of the capture tool. On a device they
  are system emoji.

---

## Decisions made at handoff

| Topic | Decision |
|---|---|
| Name and logo | **Routine Raccoon**, `assets/routine-raccoon-logo.png`. The Zhapit name and logo are not used. |
| Paste a list | **Inline only.** Paste 2+ lines into the New task name field to open a dialog. The standalone Paste screen is out of scope. |
| Survival levels | Picking a level shows **that survival Day Plan's own sections and tasks**. Levels are **not cumulative**. |
| Shrinking | Tasks in a survival plan show their **smaller version** (`svMins`, smaller content). |
| "Also in Survival Mode" field | On save, the task is **copied** into the chosen survival plan(s). The copies are independent afterwards. |
| Extra Support | Filters Today to **hard tasks plus tasks ≥ `longAt` minutes**. The badge count uses the same rule. |
| Undo after tick | **5 seconds.** |
| Survival across days | A setting: **Keep Survival Mode on after the day resets**, default **off**. |
| Repeated identical tasks | **Separate cards** (three pints = three tasks). |
| Block-closing lead time | **Per section** (`sections.closing_lead_minutes`), default 15 min. |
| Claude-drafted smaller versions | **Phase 3.** The schema already has `consume_assist_quota`. |
| Backend | **Supabase**, already configured in the repo. |

---

## Design tokens

### Colour

| Token | Hex | Use |
|---|---|---|
| Primary | `#E5134A` | Today header, primary buttons, active chips, selected states, links |
| Primary dark | `#B8113C` | Pressed primary, text on tint |
| Primary mid | `#EC406D` | Survival badge, survival plan tag |
| Primary light | `#F2819E` | Error border on code boxes |
| Survival text | `#9C3757` | Overline and meta on the survival plan card |
| Tint | `#FFE7ED` | Extra Support row, survival plan card, subtle primary buttons |
| Tint border | `#FFD3DF` | Dividers inside survival UI |
| Amber | `#FFB226` | Second headline line, "Creating in" dot |
| Ink | `#0F0E0E` | Primary text, dark context cards, active filter chip |
| Ink muted | `#4A4446` | Body copy in cards, step text |
| Text muted | `#6B6467` | Secondary text, inactive chips, Cancel |
| Text faint | `#7A7275` | Completed task name, empty-state copy |
| Text on dark | `#B7AEB1` | Labels inside dark cards |
| Surface | `#FFFFFF` | Cards, sheets, inputs |
| Screen | `#FAF8F8` | App background |
| Canvas | `#F1ECEC` | Tertiary button fill, icon wells |
| Border | `#EFE7E9` | Card and list borders, dividers |
| Border strong | `#E0D7DA` | Dashed borders (drop targets, "+ New section") |
| Grip / checkbox | `#DED5D8` | Drag handles, unticked boxes |
| Toggle off | `#E6DFE1` | Switch track when off |
| Destructive | `#9A3412` on `#F6EAE4` | Delete buttons |
| Success | `oklch(.62 .12 150)` | "Account found" pill, password rule met |

Section colour palette (user-assignable): `oklch(.70 .15 65)` amber · `#E5134A` red ·
`oklch(.62 .13 300)` violet · `oklch(.66 .12 235)` blue · `oklch(.62 .12 150)` green.

### Typography

- **Display: Outfit** 400/500/600/700. Screen title `700 26px/1, -0.03em`. Today headline
  `700 27px/1.1, -0.03em`. Group heading (Settings, forms) `700 18px/1.1, -0.02em`. Auth title
  `700 30px/1.08, -0.035em`.
- **UI: Manrope** 400/500/600/700. Task name `600 13.5px`. Meta `500 11.5px`. Body
  `400 13.5px/1.55`. Button `700 13.5–14.5px`. Chip `600 12.5px`. Overline
  `600 10.5–11px, 0.12em, uppercase`. Badge `700 9.5–10px, 0.06–0.07em, uppercase`.
- Settings group headings use the **title scale** (option 1A in `Subheader Options.dc.html`), not
  uppercase labels.
- Bundle both fonts (Google Fonts, OFL) rather than loading at runtime.

### Spacing, radius, shadow, motion

- Screen padding 14px. Card padding 12–16px. Rows 13–15px vertical. Gaps 6–12px.
- Radii: pill `999` · chip/input `14` · card `16` · large card `18–22` · sheet top `28`.
- Shadows: mode card `0 8px 24px rgba(122,26,56,.16)` · primary button
  `0 6px 16px rgba(229,19,74,.28)` · dragged card `0 14px 30px rgba(15,14,14,.20)` + `rotate(-1.2deg)`
  · focus glow `0 0 0 4px rgba(229,19,74,.10)` · scrim `rgba(15,14,14,.32–.42)`.
- Hit targets: 44dp minimum.
- Motion: `pop` (scale .96→1 + fade, 200ms) for full screens; `up` (translateY 18px→0, 200ms) for
  sheets; ticked row animates out over 700ms. Respect `prefers-reduced-motion`.

---

## Data model (mapped to the repo's Supabase schema)

The prototype's in-memory shapes map onto `app_routine_raccoon` as follows. Follow the repo's sync
conventions: ids and timestamps are client-generated, `updated_at` is last-write-wins, rows are
soft-deleted with `deleted_at`, and `server_*` columns are server-owned.

| Prototype | Table | Notes |
|---|---|---|
| `lists[]` (Day Plan) | `day_plans` | `kind`: `primary` (exactly one) · `survival` (with `survival_level` 1–3) · `custom` (e.g. Travelling). `rank` = user order. |
| `sections[]` | `sections` + `plan_sections` | A section can belong to several plans via `plan_sections` (with its own `rank`). `start_time` "HH:MM". `recurrence` JSON (shape below). Section length override → add to `recurrence` JSON or a new column (`override_minutes`). |
| `tasks[]` | `tasks` | `minutes` 1–600 · `hard` · `never_shrink` · `steps` JSON `[{id,text}]` · `smaller_versions` JSON `{minutes, steps?, text?}` (prototype `svMins`) · `mantra` · `notes` · `video_url` · `location` · `recurrence`. |
| `task.done`, step `done`, `skips` | `task_occurrences` | One row per task per `day_key`: `status` pending/done/skipped, `checked_step_ids`, `minutes_credited`, `survival_level_at_completion`. "Skipped N days running" is derived. Subtask ticks therefore reset each day. |
| `survivalOn`, `level`, Close the day | `day_records` | Per `day_key`. |
| `log[]` | `log_entries` | See log mapping below. |
| `settings` | `user_settings.settings` JSON | `showLevel, roll, firstStep, exportArchive, resetAt, longAt, keepSurvivalOvernight (false), survivalName ("Survival Mode")`. |

`tasks.survival_level` is no longer a visibility filter under the decided model. Keep it unused, or
record which level a copied task was created for.

**Recurrence JSON** (sections and tasks), Google-Calendar-shaped:

```
{ kind: 'every day'|'every week'|'every month'|'custom',
  days: [0..6]   // 0 = Monday
  n: 1, per: 'day'|'week'|'month'|'year',
  ends: 'never'|'count'|'date', count: 10, until: 'YYYY-MM-DD' }
```

Label rules (`recLabel`): non-custom → the kind text. Custom → weekday list ("Mon, Wed, Fri", or
"every day" if all 7), then `"{n}× per {per}"` if `n>1` or `per≠week`, then
`"ends after {count}"` / `"until {date}"`, joined with " · ".

**`day_key`** is the local date of `now − resetAt`. With a 2:00 AM reset, 01:30 on 9 Sep belongs to
8 Sep.

---

## Core logic

### Which tasks show on Today

```
plan    = survivalOn ? survivalPlan(level) : selectedPlan   // selectedPlan = primary by default
section ∈ plan (ordered by plan_sections.rank), recurring today
task    ∈ section, recurring today, not archived
minutes = survivalOn && !task.never_shrink ? task.smaller.minutes ?? max(2, round(task.minutes/2))
                                            : task.minutes
filter:
  All        → everything
  Hard       → task.hard
  Under 5m   → minutes ≤ 5
  Under 15m  → minutes ≤ 15
  Extra      → task.hard || minutes ≥ settings.longAt     // Extra Support
```

- Totals sum `minutes` of **unticked visible** tasks: per section header, and the day headline.
  Recalculate on every tick, add, edit, delete, paste, plan switch and filter change.
- Headline: `"{n} tasks left,"` (white) / `"about {h}h {mm}m."` (amber). When n=0: `"All clear,"` /
  `"nothing left today."`. Duration format: `<60 → "25m"`, else `"2h 07m"` / `"2h"`.
- In Survival Mode the Hard badge is hidden. Shrunk tasks show a `SURVIVAL` badge and
  `"was {full}m"` meta.
- Card meta, max two bits joined with " · ": `was Xm` · `{n} steps` · frequency.

### Today's plan picker (replaces the old Survival toggle)

The card under the header shows the active plan. **Normal state:** overline `TODAY'S PLAN`, plan
name, meta `"{n} tasks · {duration}"`, chevron in a `#F1ECEC` well. **Survival state:** tinted
`#FFE7ED` card, overline `"{survivalName} Day"`, level name in `#B8113C`, meta
`"{n} tasks · {duration} · from {basePlan}"`.

Tapping it opens a bottom sheet with two groups:

1. **Day Plans**: every non-survival plan (Normal, Travelling…) with its task count and full
   duration. Picking one sets `planId`, turns Survival off and resets the filter to All.
2. **{survivalName}**: Bare minimum / Bad day / Zero energy, each with the count and **shrunk**
   duration of **its own plan**. Picking one sets `survivalOn=true` and `level`.
3. **+ New Day Plan** opens the name prompt.

Each pick writes a `survival` log entry. The headline total visibly drops. That drop is the point
of the control.

**Reset behaviour:** at `resetAt`, Survival turns off unless `keepSurvivalOvernight` is on. The
selected non-survival plan returns to primary.

### Tick, undo, day complete

1. Tick → strike through, grey (`#7A7275`, card opacity .5), write a `completed` log entry
   (`"{section} · {min} min estimated · hard task"`).
2. Show a snackbar for **5s**: `"Ticked {task}"` + **Undo**. Undo restores the row and writes an
   `uncompleted` entry.
3. After 700ms, animate the row out.
4. When no visible unticked tasks remain, go to **Day complete** once the undo window closes.
   Un-ticking from Task detail (Done ↔ Un-tick) works at any time.

Ticking every subtask does **not** complete the parent.

### Paste a list (inline)

In **New task**, pasting text with **2 or more** parsed lines into the name field cancels the
default paste and opens a centred dialog:

- Title `"Add {n} tasks?"`. Body: `"You pasted {lines} lines. Each line can be its own task, or the
  first line can be the task and the rest its subtasks."`. Shows the first line in a preview box.
- **Add {n} tasks** (primary) · **Add 1 task with {lines−1} subtasks** (tint) · Cancel.
- One-line pastes go into the field as normal.

Destination section and default duration come from the form's current **Section** and
**Estimated time** (default 15). On import: return to Today, toast `"Added 5 tasks"` /
`"Added 1 task with 6 subtasks"`, and write **one** `imported` log entry:
`"Pasted a list · 5 tasks · 3 subtasks → Morning"`.

**Parsing rules (implement exactly):**

- Split on newlines. Drop blank lines.
- A line is **indented** if it matches `/^(\s{2,}|\t|\s*[–·]\s)/`.
- Strip leading whitespace, then one list marker: `[ ]`, `[x]`, `[X]`, `-`, `*`, `•`, `·`, `–`,
  `1.`, `1)`.
- Trailing duration: `(15 min|mins|minutes|m)` or `- 15 min` / `– 15 min`. Remove it from the name
  and use it as the task's minutes.
- **Separate tasks:** non-indented lines → tasks. Indented lines → subtasks of the task above. An
  indented first line becomes a task.
- **One task with subtasks:** the first line is the task (with its own duration if present). All
  other lines become subtasks, ignoring indentation.
- Created task defaults: `hard:false`, frequency Every day, `smaller.minutes = max(2, round(min/2))`,
  emoji from the keyword map (below), falling back to 📋.
- **Share sheet:** shared text opens New task and runs the same dialog.

**Emoji keyword map** (first substring match wins, case-insensitive; keep editable): shower 🚿 ·
hair 💇 · teeth 🪥 · wash 🧼 · dress 👗 · make 💄 · walk 🚶 · stretch/medit 🧘 · move 🤸 · gym 🏋️ ·
run 🏃 · water/pint/drink 💧 · supplement/pill/vitamin 💊 · breakfast 🥣 · lunch 🥗 · dinner 🍲 ·
cook 🍳 · dish 🍽️ · kitchen 🧽 · tidy/laundry 🧺 · clean 🧹 · bin 🗑️ · bed 🛏️ · email 📧 ·
work 💻 · write ✍️ · journal 📓 · read 📖 · plan 🗓️ · dog 🐕 · cat 🐈 · plant 🪴 · shop 🛒 ·
flower 💐 · nail 💅 · leg 🪒 · phone 📱 · call 📞. Apply the same suggestion as the user types a task
name.

### Survival copies

The task form's survival field becomes **"Also add to {survivalName} plans"**: multi-select chips
Bare minimum / Bad day / Zero energy (default none). Hint: `"A copy goes into each plan you pick,
at about {max(2,round(min/2))} min."`. On save, for each selected plan:

- Copy the task (new id; same content and smaller version) into the section of that plan with the
  same name. If there isn't one, use the plan's first section. If the plan has no sections, create
  one named after the source section.
- Toast `"Saved · copied to Bad day"`. Write an `added` log entry per copy.
- Editing the original later does not change the copies.

### Timer

One timer at a time, started from the card's play button or from Task detail. It counts down in
place and in a pinned bar. Starting a second one asks first: **"Stop {current} and start
{new}?"**. The prototype replaces silently; follow the spec. On expiry it sends a notification and
**never auto-ticks**. It keeps running in the background. Duration = displayed minutes (shrunk in
Survival).

### Drag and drop

- **Tasks:** a 12px three-line grip on every card. A drop on any card or section header (including
  collapsed and empty ones) moves the task to that section. Dragging styles: primary border, lift
  shadow, −1.2° tilt. The target section dot gets a `0 0 0 4px rgba(229,19,74,.18)` ring. Writes
  `edited` "Moved {task}" / `"{from} → {to}, by drag"`. Within-section reorder updates
  `tasks.rank`. The prototype only moves between sections; build reorder too.
- **Sections** (Sections manager) and **Day Plans** (Settings): drag to reorder, plus ↑/↓ buttons.

### Sections

- Header row: chevron (collapse, per session) · colour dot · name · clock + start time · total
  (in the section colour) · **⋯ menu**.
- **⋯ menu:** Edit section · Duplicate · Copy to Day Plan · Move to Day Plan · Archive · Delete.
  Delete asks to confirm and removes the tasks. Archive keeps history.
- "+ Add task" row at the end of every expanded section opens New task preset to that section.
- Empty section: dashed drop box, `"Empty — drag a task in"`, or in Survival
  `"Nothing here on a {level} day"`.
- "+ New section" (dashed) at the bottom of Today, in the task form's section chips, and in the
  Sections manager.
- **Length:** the sum of its tasks by default (`"25m from tasks"`). An optional override toggle
  sets a fixed length (`"45m set"`), with chips 15m / 30m / 45m / 1h / 1h 30m.

### Day Plans (Settings)

- Exactly one primary. The primary plan cannot be deleted, archived or marked survival. Show the
  toast `"Make another Day Plan primary first"`.
- Per plan: Sections · Rename · More (Description · Make primary · Add to / Remove from
  {survivalName} · Duplicate · Archive · Delete).
- Duplicating a plan duplicates its sections.
- The survival feature name is renamable ("What to call it", default "Survival Mode"). It is used
  everywhere the name appears.

### Copy / move sheet

From the task ⋯ menu ("Copy to Day Plan or section"): **Day Plans** chips copy the task into that
plan's first section. If the plan has none, show the toast `"{plan} has no sections yet"`. **Move
to a section** chips list `"{section} · {plan}"` and move the task. Section copy and move use the
same sheet with plan chips only.

### Log

Read-only. Filters: All · Completed · Added · Edited · Survival Mode. Grouped by day
(`"Today · Tue 8 Sep"`). Task activity is the same list filtered to one task.

| UI filter | `log_entries.kind` |
|---|---|
| Completed | `completed` |
| Added | `added`, `imported` |
| Edited | `edited`, `uncompleted`, `skipped` |
| Survival Mode | `survival` |
| (All only) | `closed` |

Events that write entries: tick/untick, add/edit/delete/duplicate/copy/move task, skip today, paste
import, section add/edit/duplicate/copy/move/archive/delete, plan rename/primary/survival
membership/archive/delete/restore, plan pick, reset time change, close the day, account
created/signed in/deleted.

### Regeneration (at `resetAt`)

- A new `day_key` begins. Tasks whose recurrence includes the day get a pending occurrence.
  Unticked occurrences from yesterday are dropped. If `roll` is on, they are carried
  (`carried_from_day_key`).
- Survival resets unless `keepSurvivalOvernight` is on. The selected plan returns to primary.
- **Close the day** (Day complete) does the same thing manually: it writes `closed`
  (`"{ticked} of {total} ticked"`) and shows the toast `"Day closed. Fresh list."`.

### Notifications (per section, optional)

- **Block starts** at `start_time`: `"{section} · {first unticked task} · {min} min"`.
- **Block closing** `closing_lead_minutes` (default 15) before the next section starts: lists what
  is still unticked.

### Account (Supabase Auth)

The sign-in/sign-up flow from the previous handoff is unchanged. It is a single email-first page
that adapts in place:

- Debounced lookup (550ms) once the email is valid. The pill reads Checking… → **Account found** /
  **Google account** / **New account**.
- Password sign-in, with an error after a wrong password. After 3 tries the copy changes and a
  reset code is offered.
- Sign-up with a 6-digit code (`autocomplete=one-time-code`), auto-submits, 30s resend lock,
  10-minute expiry. Reset password reuses the code step.
- Google via the system account chooser. Creates or links by verified email.
- Signing into an existing account shows the **"Two copies of your day"** sheet: Combine them
  (recommended) / Use the saved copy / Keep this phone's.

The email lookup needs a small RPC or Edge Function (`lookup(email) → {exists, providers, name}`).
Rate-limit it. Everything else is Supabase Auth plus the repo's sync conventions. Prototype demo:
`leo@routineraccoon.app` / `raccoon123` (password account), `leo.mertens@gmail.com` (Google-only),
code `482913`.

---

## Screens

Every screen is reachable from the prototype's screen map. Screenshots are in `screenshots/`
(412 × 868 PNG).

| # | Screen | Screenshot(s) | Notes |
|---|---|---|---|
| 1 | **Today** | `01`, `02` | Header `#E5134A` (date + **Add task** only), headline, plan card, Extra Support row with count, filter chips, sections, tabs Today · Progress · Settings |
| 2 | Today's plan sheet | `03` | Plan picker, see logic above |
| 3 | Today in Survival | `04` | Tinted plan card, shrunk tasks, empty-section copy. The screenshot shows the prototype's filter model; the spec shows the survival plan's own sections |
| 4 | Extra Support active | `05` | Filter applied |
| 5 | Section ⋯ menu | `06` | |
| 6 | **Task detail** | `07`, `08` | Read mode hides empty fields. Header: back, **Edit**, ⋯. Emoji + name, tags (Hard, minutes, section, plan, location), Notes (mantra card, notes, embedded video that plays in-app), Steps (tickable, "1 of 3 done", Add subtask), info rows (Frequency, Reminder, Section, Also in, Skipped N days running), footer **Start {n} min** / **Done** |
| 7 | Task ⋯ menu | `09` | Edit task · Duplicate · Copy to Day Plan or section · Copy link to task · View activity · Skip today · Delete task |
| 8 | Copy / move sheet | `19` | |
| 9 | Delete confirm | `20` | "Delete “{name}”? The task and its steps are removed for good. You can skip it for today instead." |
| 10 | **New / Edit task** | `10`–`12`, `21` | All fields open, no accordions: Creating in (Change) · emoji + name · Estimated time 5/15/30/60/Custom · Hard toggle · Section chips + New section · Steps · Notes (mantra placeholder "One line that gets you moving", notes, video link) · Location · Frequency Every day/week/month/Custom (opens recurrence sheet) · Also add to survival plans · Delete (edit only). Mantra default for new tasks: "Done is better than perfect. I can feel embarrassed and still do this." |
| 11 | Paste dialog | `13` | |
| 12 | **Add / edit section** | `14`, `15` | Section in (plan) · Name · Description · Colour · Start time · Repeats · Length override · Also in other Day Plans |
| 13 | Custom recurrence sheet | `16` | Weekdays · n × per day/week/month/year · Ends never / after X / on date |
| 14 | **Sections manager** | `17`, `18` | Per plan. Drag or ↑↓. Tap to expand Edit · Duplicate · Copy to Day Plan · Archive · Delete |
| 15 | **Settings** | `22`–`25` | Account card · Day Plans · Survival Mode (toggle, what to call it, default level, keep on overnight) · Day (reset time, carry over, Extra Support threshold 10/15/20/30/45) · Data (Log, Archive, Export, include archive) · Help · Privacy |
| 16 | Reset time sheet | `26` | Wheel (hours, minutes in 5-min steps, AM/PM) + chips 12/2/4/6 AM |
| 17 | **Progress** | `27`–`29` | Month of days (ticked / Survival / future), counters, per-task "N of 8 days" bars, time per section, "Avoiding this" (skipped ≥ 4 days running). No points or streaks |
| 18 | Log · Task activity | `30`, `31` | |
| 19 | Archive | `32` | Day Plans and sections, Restore / Delete for good |
| 20 | **Day complete** | `33` | Full-bleed primary. Counters ticked / planned / hard. See progress · Close the day. Identical for Survival days. **Replace the image** |
| 21 | Help / Privacy | `34` | |
| 22 | Auth | `35`, `36`, `38`–`42` | Start, account found, Google-only, new account, email code, new password, Google chooser. The wrong-password and "Two copies" states are best seen live in the prototype |
| 23 | Account | `44` | Identity, provider, last backup, Sync now, Sign out, Delete account |

Not designed, still in PRD scope: **Setup wizard** (R12, five questions, one per screen) and
**widget** (R17, P1).

---

## Prototype vs spec

Build the spec column.

| Area | Prototype does | Spec |
|---|---|---|
| Survival level | Filters the current plan to tasks with `svl ≤ level` (cumulative) | Shows the survival plan's own sections and tasks, not cumulative |
| Task form survival field | "Also in Survival Mode from" single choice, used as a filter | "Also add to {survivalName} plans" multi-select, copies on save |
| Extra Support | Count = hard + long, but tap filters to Hard only | Count and filter both = hard or ≥ `longAt` |
| Undo | None | 5s snackbar |
| Repeated tasks | One card with "1 of 3 today" | Separate cards |
| Second timer | Replaces silently | Asks before stopping the first |
| Task reorder | Between sections only | Within sections too |
| Paste screen | Still in the file, unreachable | Out of scope (inline dialog only) |
| New task section chips | Every section in every plan | Sections of the active plan; Change switches plan |
| Privacy copy | "There is no account and no server copy" | Rewrite: data lives on the phone; an optional account saves a copy to the server; nothing is shared |
| Day complete image | Film still placeholder | Owned artwork |
| Settings "Survival Mode Day" toggle | Toggles with the current level | Turns Survival on at the default level |

---

## State (prototype shape, for reference)

`screen` + `stack` (navigation) · `planId` · `survivalOn` · `level` · `filter` · `collapsed{}` ·
`tasks` · `sections` · `lists` · `settings` · `draft` (task form) · `secDraft` + `recSheet` (section
form) · `pasteAsk` · `timer` · `log` · `archiveLists` · `archiveSections` · `planSheet` · `sheet` ·
`confirm` · `prompt` · `toast` · `auth*`.

Local-first. Persist everything on the device. The Supabase copy is optional and tied to the
account.

## Assets

- `assets/routine-raccoon-logo.png`: app logo (raccoon mascot on `#E5134A`, rounded square). Used
  for the launcher icon, splash, auth screen and the notification avatar.
- Fonts: Outfit and Manrope (Google Fonts, OFL).
- Icons: inline SVG at a 1.8px stroke on 20px. Substitute the codebase's icon set at the same
  weight.
- Emoji are system emoji and part of the visual system.

## Files

| Path | What it is |
|---|---|
| `design/Routine Raccoon Prototype.dc.html` | Clickable prototype, every screen, live state. Open first. |
| `design/Routine Raccoon UI Kit.dc.html` | UI kit boards (colour, type, components) and screens side by side. Predates the plan picker; the prototype wins where they differ. |
| `design/support.js` | Runtime for both HTML files. Keep beside them. |
| `screenshots/*.png` | 42 captures of every screen and key state. |
| `source/PRD-daily-routine-app.md` | PRD, updated with the handoff decisions. |
| `source/Notes-routine-raccoon.md` | The user's feedback round. |
| `assets/routine-raccoon-logo.png` | Logo. |

## Still open

1. **Copy to Day Plan for sections:** the schema can **link** a section into several plans
   (`plan_sections`), so edits show everywhere. The prototype makes an independent copy. Pick one;
   the PRD intent ("not duplicated by hand") favours linking.
2. **Migrating the 56 Todoist tasks:** the inline paste makes importing cheap. Import as-is and
   clean up in the app unless told otherwise.
3. Should a Survival day count as a "Full day" in Progress? (A setting per R7/R13; default: counts
   as Showed up, not Full day.)
