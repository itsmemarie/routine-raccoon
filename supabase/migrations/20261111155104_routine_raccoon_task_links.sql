-- Coupled task copies (docs/handoff/README.md "Coupling"): copies that share a link_id share edits
-- (name, steps, notes, minutes...); each keeps its own ticks. Null = not coupled. No backfill: the
-- owner chose to start clean, so existing look-alikes stay independent.
-- Nullable, no default: the stamp trigger, RLS and grants on tasks are unchanged.
alter table app_routine_raccoon.tasks add column if not exists link_id uuid null;

create index if not exists tasks_link_id_idx
  on app_routine_raccoon.tasks (user_id, link_id)
  where link_id is not null;
