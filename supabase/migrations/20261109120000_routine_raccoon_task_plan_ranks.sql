-- ════════════════════════════════════════════════════════════════════════════════════════
-- Each Day Plan keeps its own task order in a section it shares with other plans.
-- Expand-only: one new column with a default. No row is rewritten and no trigger fires, so
-- `updated_at` / `server_seq` stay put and clients running the old build are unaffected.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- `rank` stays the shared order. A plan whose order differs stores its own fractional key here,
-- keyed by plan id: { "<plan uuid>": "<rank>" }. Reading falls back to `rank` (domain/task-order.ts).
alter table app_routine_raccoon.tasks
  add column if not exists plan_ranks jsonb not null default '{}'
  check (jsonb_typeof(plan_ranks) = 'object');
