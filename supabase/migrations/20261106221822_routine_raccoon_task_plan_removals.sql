-- ════════════════════════════════════════════════════════════════════════════════════════
-- Delete a task from one Day Plan only (handoff "Deleting a task that's in several plans").
-- Applied to production 6 Nov 2026 with the owner's approval; this file carries the version the
-- database recorded.
-- Expand-only: one new column with a default. No row is rewritten and no trigger fires, so
-- `updated_at` / `server_seq` stay put and clients running the old build are unaffected.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- Tasks live in a section and a section can sit in several plans, so a plan can't lose one task
-- by unlinking anything. These are the plans this task was removed from while its section stays
-- there. Plan ids in a JSON array, like `task_occurrences.checked_step_ids`.
alter table app_routine_raccoon.tasks
  add column if not exists excluded_plan_ids jsonb not null default '[]'
  check (jsonb_typeof(excluded_plan_ids) = 'array');
