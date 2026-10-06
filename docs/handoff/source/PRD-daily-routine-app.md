# PRD: Routine Raccoon

**Platform:** Android
**Users:** One (the author)
**Status:** Ready for engineering (handoff 2 Oct 2026). See `../README.md` and `../design/`
**Deliverable:** Implementation in `itsmemarie/routine-raccoon` (Next.js + Supabase scaffold; stack is engineering's call)

> Updated to match the shipped design. Changes since the first draft are marked **[revised]** where a
> decision replaced an earlier one, so the reasoning trail stays readable.

---

## 1. Problem Statement

I run my daily routine out of a Todoist project called Daily Routines. It holds 56 tasks across five
sections, but **only 2 of those 56 actually recur**. Every other task is a static line I tick once and
it stays ticked forever, so the list decays within days and I rebuild it by hand.

Two deeper problems sit under that:

1. **The list tells me what, never how.** One task already links out to an external artifact for its
   instructions. When I'm low, "5 minute straighten your back exercise" is not enough information to
   act on, and the friction of remembering the how is what stops me.
2. **The list has one setting: full.** On a bad day the whole routine is unachievable, so I abandon it
   entirely rather than do a smaller version. And bad days are exactly when the self-care items matter
   most.

No existing app solves both. HabitNow has scheduling, timers, stats and widgets but no embedded how.
Todoist has descriptions but no energy model and no daily regeneration for this use case.

---

## 2. Goals

1. **The list rebuilds itself.** Every task returns at the day reset time on its rhythm with zero
   manual effort. Nothing rolls over.
2. **Every task can answer "how."** Instructions live inside the task, written once during setup, one
   tap away — including an embedded video where one exists, so I never leave the app.
3. **A bad day has a version I can actually do.** Instead of abandoning the routine, Survival Mode
   shrinks it and I still count as having shown up.
4. **Self-care escalates when I need it, not when I have energy.** Feeling worse should surface *more*
   self-care, not less.
5. **Getting a list in is never retyping.** Anything I already have written down — a Todoist export, a
   note, a message — comes in as one task or as many, in a few taps. **[revised — new goal]**
6. **Opening the app is not required to get started.** A widget and a section notification put the next
   physical action in front of me before I open anything.

---

## 3. Non-Goals

| Not building | Why |
|---|---|
| Calendar or month view as a planner | Fights the disappearing-list philosophy. The day is the only unit. (Progress shows a month of ticked days; it is a record, not a planner.) |
| Daily notes / journalling as a feature | Journalling is a task on the ladder, not app infrastructure. |
| Pomodoro, intervals, break cycles | One countdown per task is enough. |
| Themes, icon packs, custom fonts | Colour and emoji are already the visual system. |
| One-off tasks | Explicitly rejected. This is a routine app, not a to-do app. |
| Multi-user, sharing, sync between people | Single user by design. Sign-in exists only to save my own copy. |
| Rollover of missed tasks | Off by default. Available as a setting; missed is otherwise gone. |

**[revised]** Task history is no longer a non-goal. A read-only **Log** ships, plus per-task activity,
because the Log costs nothing to keep and answers "did I actually do that" without reintroducing a
completed-tasks list on Today.

---

## 4. Core Concepts

### 4.1 Two axes, not one

| | **Capacity** | **Need** |
|---|---|---|
| Question | How much can I do today? | How bad do I feel today? |
| Mechanism | Survival Mode toggle | Level 1–3 |
| Effect | Routine **shrinks** | Self-care list **grows** |

A bad day is usually both. **One control does both:** the Today's plan picker. Choosing a Survival
level switches Today to that level's own Day Plan and shrinks every task to its smaller version.
**[revised at handoff]** The single toggle became a plan picker. Levels are separate plans, not
cumulative filters.

**[revised]** The feature is called **Survival Mode**, not Nope Day, and the levels are named for what
they describe rather than graded as moods:

- **Level 1 — Bare minimum** (No time today)
- **Level 2 — Bad day** (Not feeling today)
- **Level 3 — Zero energy** (Zero energy)

**[revised at handoff]** Levels are not cumulative. Each level shows only its own Day Plan.

### 4.2 The smaller version

Every task can carry a smaller version of itself, defined at setup: its own duration (`svMins`,
defaulting to half the full estimate, floor 2 min) and its own content. Default behaviour is the first
two steps of the full instructions with the rest greyed out; overridable with entirely custom text
where the smaller version is genuinely a different job.

**[revised]** "60%" is gone as a label. The shrink amount is a setting, and the user-facing word is
just *smaller version* — a percentage in the UI invited arithmetic about a number that was a guess.

**[revised]** Where a smaller version is empty, the app can offer to draft one from the full version:
task name and fields written to reduce avoidance, which I then edit. Opt-in, with a visible review
step, never silent.

### 4.3 Day Plans and levels

**[revised]** The self-care ladder is generalised. A **Day Plan** is a named set of sections and tasks;
one is primary (**Normal**) and three are the survival plans (**Bare minimum**, **Bad day**,
**Zero energy**). A task belongs to a section, and a section can appear in more than one Day Plan, so
the same real-world activity does not have to be duplicated by hand. Sections and whole Day Plans can
be duplicated, copied between plans, archived and restored.

**[revised at handoff]** A task can be copied into one or more survival plans from the task form
("Also add to Survival Mode plans"). The copies are independent once saved.

### 4.4 Sections

User-created, user-ordered, each with its own colour, start time and recurrence. Order is manual
because the sequence carries the habit stack. **Add a section is reachable from Today, from the task
form and from Settings** — not buried. **[revised]**

Recurrence is Google-Calendar-shaped: every day / week / month, or custom with an interval, weekdays,
and an end condition (never / after N / on a date). **[revised]**

### 4.5 Difficulty

A single **Hard** label. It does not sort the list, it only marks the card and feeds Extra Support.
**[revised]** The cap of three per day is dropped — as many as are true.

### 4.6 Extra Support

**[revised — new concept]** A button on Today that filters the day to the tasks that need help: hard
tasks plus tasks at or over a threshold length. The badge shows the same count. The threshold is a
setting (default 20 min). **[revised at handoff]** It is a filter on Today, not a separate page.

---

## 5. User Stories

**Daily use**

- As someone with a routine, I want the list to be full again every morning without me rebuilding it.
- As someone mid-task, I want to tap a task and see the steps — and the video, in the app.
- As someone with low energy, I want one toggle that shrinks the day.
- As someone feeling bad, I want that same toggle to offer me self-care.
- As someone starting a task, I want to hit play and see a countdown without leaving the list.
- As someone who mis-taps, I want to undo a tick immediately.
- As someone with limited time, I want to filter the day by difficulty or by "everything under 15
  minutes". **[revised]**
- As someone with a long list, I want to collapse sections I am not in yet. **[revised]**
- As someone who finishes a block, I want something satisfying to happen.

**Getting things in**

- As someone with a list already written somewhere, I want to paste it in and choose whether it becomes
  one task with subtasks or many tasks. **[revised — new]**
- As someone editing, I want to tap a field on the page and change it, not open a sub-screen.
  **[revised]**
- As someone defining a task, I want every field visible on one page. **[revised]**
- As someone naming a task, I want an emoji suggested.

**Before opening the app**

- As someone still in bed, I want the notification to name the next physical action.
- As someone whose block is nearly over, I want a wind-down warning listing what's unticked.

---

## 6. Requirements

### P0 — Must have

**R1. Daily regeneration**
- Every task regenerates on its rhythm at the **day reset time**, set in Settings via a wheel picker
  with common-time chips; default 12:00 AM. **[revised — was hardcoded 00:00]**
- Default rhythm is daily; changeable to weekdays, an interval, or a custom recurrence.
- Unticked tasks do not roll over. Carry-over is available as an explicit setting, off by default.

**R2. Sections and Day Plans**
- Create, rename, reorder, recolour, retime, duplicate, archive and delete sections.
- Tasks belong to exactly one section; sections can appear in several Day Plans.
- Section order is manual and is the display order.
- Drag and drop moves tasks within and between sections. Every card has a dedicated grip and section
  headers accept drops. **[revised — the first pass was clunky]**

**R3. Time totals**
- Section headers show the summed duration of their unticked tasks; the day headline shows the total.
- Totals recalculate on every tick, add, edit, delete, paste and Survival Mode toggle.
- In Survival Mode totals reflect the smaller durations. Watching the total drop is the clearest
  demonstration of what the toggle does.
- Phrased as an estimate ("about 2h 27m").
- Once the day is cleared, the header shows time spent rather than time remaining.

**R4. Task card and tick behaviour**
- Card shows: grip, tick box, emoji, name, section colour, Hard and Survival badges, meta, play button.
- Instructions are hidden until the task is opened.
- On tick: strike through, grey, animate out, write a Log entry, offer undo for a short window.

**R5. Instructions**
- A description, a one-line mantra, an ordered list of subtasks, an optional location, and an optional
  video link that plays **embedded** — YouTube or TikTok. **[revised]**
- The mantra's default first line: *"Done is better than perfect. I can feel embarrassed and still do
  this."* **[revised]**
- Subtasks are individually tickable; ticking them all does not auto-complete the parent.
- Empty fields are hidden in read mode and appear in edit mode only. **[revised]**

**R6. The smaller version**
- Per task: smaller duration, smaller content, and the level it appears from.
- Default: first two steps, remainder greyed. Override with custom text, subtasks and duration.
- Tasks can be exempted so they never shrink.

**R7. Survival Mode**
- The Today's plan picker lists the regular Day Plans and the three survival levels. Picking a level
  shows that survival plan's own sections and tasks, each at its smaller version. **[revised at handoff]**
- Levels are not cumulative.
- Resets at the day reset time unless "Keep Survival Mode on after the day resets" is on (default off).
- The undo window after a tick is 5 seconds.
- Settings holds: level picker opens automatically · default level · shrink amount · whether a Survival
  Mode day counts as a full day · tasks that never shrink · whether the toggle resets overnight.

**R8. Paste a list [revised — new requirement]**
- **[revised at handoff]** Inline only: pasting 2+ lines into the New task name field opens a dialog
  to choose **Separate tasks** or **One task with subtasks**. There is no standalone Paste screen.
  Section and default duration come from the form.
- Parsing: strip `-`, `*`, `•`, `·`, `–`, `1.`, `1)`, `[ ]`, `[x]`; drop blank lines; treat lines
  indented by two spaces, a tab or `– ` as subtasks of the line above; read and remove a trailing
  `(15 min)` / `- 15 min`.
- Choose the destination section and a default duration for lines without one; suggest an emoji per
  task.
- Live count on each choice in the dialog.
- One Log entry per import, and a toast naming what was added.
- On device: shared text from Android's share sheet opens New task and runs the same dialog.

**R9. Filters and collapse [revised — new requirement]**
- Filter Today by All · Hard · Under 5m · Under 15m.
- Collapse and expand sections.
- Extra Support filters to the long and hard tasks, threshold set in Settings.

**R10. Timers**
- Countdown from a per-task duration, default 5 minutes, started from the card.
- A persistent bar shows the running timer. One timer at a time; starting a second prompts to stop the
  first.
- On expiry: a nudge notification. It never auto-ticks. Keeps running when backgrounded.

**R11. Section notifications** (block-closing lead time is per section, default 15 min)
- **Block starts:** fires at the section's start time, naming the section and the first unticked task
  with its duration.
- **Block closing:** fires a set interval before the next section, listing what's unticked.
- Both per-section optional. No per-task reminders in v1.

**R12. Setup wizard**
- Runs on first launch, re-runnable from Settings. Built on the five questions:
  1. What am I avoiding? 2. What feeling or thought makes me avoid it? 3. What's the smaller version?
  4. What's the first physical action? 5. Can I do just 5–10 minutes?
- Q1/Q2 pick the hard tasks, Q3 populates the smaller version, Q4 becomes the first subtask, Q5 sets
  the timer duration.

**R13. Progress, kept not scored**
- **Showed up** (any cleared day) and **Full days** (cleared without Survival Mode), whether a Survival
  Mode day counts being a setting.
- A month of ticked days, time per section, and an "avoiding this" list for tasks skipped four or more
  days running. No points, no streaks. **[revised]**

**R14. Log and export**
- Read-only history, one entry per event, filterable: All · Completed · Added · Edited · Survival Mode.
  Per-task activity is the same list filtered to one task.
- Export all data, optionally including the archive.

**R15. Rewards**
- A small celebration when a section hits zero, a larger one when the day does. Identical for Survival
  Mode days — the app never signals that a small day was a lesser day.

**R16. Emoji suggestions**
- When naming a task, and on every task created by pasting, suggest an emoji from the name.

### P1 — Should have

**R17. Home screen widget.** Next unticked task with emoji, duration and a tick control.
**R18. Day-complete state.** Something worth looking at for the rest of the evening. *(Designed.)*
**R19. Manual reset today.** Regenerate the day without waiting for the reset time.
**R20. Backup and export.** Local export of task definitions. *(Designed.)*
**R21. Account.** Optional email or Google sign-in that saves a copy; the day works fully offline
without one. **[revised — new]**

### P2 — Future

**R22. Sub-grouping within sections.** The data model allows a parent grouping later.
**R23. Separate treatment for care-of-others tasks.**
**R24. Photo or voice instructions.** Text and video only for now.

---

## 7. Screens

| Screen | Contents |
|---|---|
| **Today** | Date, Paste list and Add task, day headline, Survival Mode toggle, Extra Support, level picker, filters, sections with totals, task cards, tabs |
| **Paste a list** | Textarea, one-task-or-many choice with live counts, section, default duration, preview **[new]** |
| **Task detail** | Instructions, mantra, embedded video, tickable subtasks, timer, menu |
| **Add / edit task** | Every field on one page: name, emoji, time, hard, section, subtasks, notes, video, location, frequency, survival level |
| **Add / edit section** | Name, description, colour, start time, recurrence, which Day Plans |
| **Sections manager** | Per Day Plan: reorder, edit, duplicate, copy, archive, delete |
| **Setup wizard** | The five questions, one per screen |
| **Progress** | Counters, month of ticked days, time per section, what I'm avoiding |
| **Log / Task activity** | Read-only history **[new]** |
| **Archive** | Day Plans and sections, with restore **[new]** |
| **Day complete** | The evening state |
| **Settings** | Day Plans, Survival Mode defaults, day reset time, carry-over, Extra Support threshold, Log, Archive, export, help, privacy, account |
| **Widget** | Next task + tick (P1) |

---

## 8. Success Metrics

Single-user product, so these are honest self-observation rather than analytics.

**Leading (first 2 weeks)**
- Days the list is cleared, either mode. Target: 5 of 7.
- Survival Mode used at least once instead of abandoning a day. The primary hypothesis.
- Instruction panel opened on at least one task per day.
- Timer started rather than ignored.
- A list pasted in rather than typed out at least once. **[new]**

**Lagging (2–3 months)**
- Showed-up counter never resets.
- The Todoist Daily Routines project fully abandoned. The real success condition.
- Manual list rebuilding drops to zero.

---

## 9. Open Questions

**Settled**
- Product name: **Routine Raccoon**.
- Level 1 contents: defined as the **Bare minimum** Day Plan (water, food, bed).
- Hard task cap: removed.
- Undo window: 5 seconds.
- Survival across days: a setting, default reset.
- Repeated identical tasks: separate cards.
- Block-closing lead time: per section, default 15 min.
- Claude-drafted smaller versions: Phase 3.
- Backend: Supabase.

**Still open**
- The existing 56 tasks: import as-is and clean up in the app (default), or clean during import?
- Section "Copy to Day Plan": link (edits show everywhere) or independent copy?

---

## 10. Phasing

**Phase 1 — Design.** Complete. UI kit, every screen, and a clickable prototype with live state.
**Phase 2 — Build.** Sections and Day Plans, tasks, tick-and-disappear, undo, timers, smaller versions,
Survival Mode, paste a list, filters, collapse, Log, regeneration, counters. Notifications mocked.
**Phase 3 — Real device.** Android notification scheduling, widget, share-sheet intake, backup, account,
Claude-drafted smaller versions.

Data migration runs before Phase 2 so the build uses the real 56 tasks rather than placeholders.
