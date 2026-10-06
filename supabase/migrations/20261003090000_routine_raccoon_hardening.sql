-- ════════════════════════════════════════════════════════════════════════════════════════
-- Routine Raccoon hardening (TECH_SPEC §2.1, §3.6). PROPOSED: not yet applied to production.
-- Applied by db.yml only after the GitHub "production" environment approval.
-- After applying: add `plan_id` to REMOTE_COLUMNS.day_records (data/sync/mapping.ts) and
-- `length_override_minutes` / `plan_id` to lib/supabase/database.types.ts.
-- Expand-only: every change is additive or a drop-in replacement; no data is rewritten.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- S2 · Clock-skew row freeze. A client clock far in the future would win every later
-- last-write-wins comparison and freeze the row. Clamp client timestamps to now() + 5 min.
create or replace function app_routine_raccoon_private.enforce_lww_and_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.updated_at > now() + interval '5 minutes' then
    new.updated_at := now() + interval '5 minutes';
  end if;
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then
      raise exception 'user_id is immutable' using errcode = '42501';
    end if;
    if new.updated_at < old.updated_at then
      return null;
    end if;
  end if;
  new.server_seq := nextval('app_routine_raccoon_private.sync_seq');
  new.server_updated_at := now();
  return new;
end;
$$;

-- S1 · The client could choose its own daily assist limit (up to 200). The limit is now
-- server-owned. Calling it still only burns the caller's own quota.
drop function if exists app_routine_raccoon.consume_assist_quota(integer);

create or replace function app_routine_raccoon.consume_assist_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  daily_limit constant integer := 30;
  uid uuid := auth.uid();
  used integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  insert into app_routine_raccoon_private.assist_usage as u (user_id, day, calls)
  values (uid, current_date, 1)
  on conflict (user_id, day) do update set calls = u.calls + 1
  returning calls into used;
  return used <= daily_limit;
end;
$$;

revoke all on function app_routine_raccoon.consume_assist_quota() from public, anon;
grant execute on function app_routine_raccoon.consume_assist_quota() to authenticated;

-- Section length override (handoff "Sections → Length"): null = sum of its tasks.
alter table app_routine_raccoon.sections
  add column if not exists length_override_minutes smallint
  check (length_override_minutes between 1 and 600);

-- The non-survival Day Plan picked for a day (null = primary), so a "Travelling" pick syncs
-- and resets with the day like Survival Mode does.
alter table app_routine_raccoon.day_records
  add column if not exists plan_id uuid
  references app_routine_raccoon.day_plans (id) on delete set null deferrable initially deferred;
