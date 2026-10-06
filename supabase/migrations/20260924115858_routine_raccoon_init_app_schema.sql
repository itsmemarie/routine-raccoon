-- Routine Raccoon schema, as applied to production on 24 Sep 2026 (copied from the remote
-- migration history on 3 Oct 2026 so the schema is source-controlled). Do not edit: add a new
-- migration instead.

create schema if not exists app_routine_raccoon;
create schema if not exists app_routine_raccoon_private;

-- PostgREST resolves the exposed schema as anon/authenticated; table-level grants
-- and RLS below are what actually protect the rows.
grant usage on schema app_routine_raccoon to anon, authenticated, service_role;
-- Internals are unreachable from the API by construction.
revoke all on schema app_routine_raccoon_private from public, anon, authenticated;

-- Monotonic cursor for incremental pulls: "give me everything with server_seq > N".
create sequence app_routine_raccoon_private.sync_seq;

-- Last-write-wins by the client's updated_at. A stale write is silently discarded at row
-- level, so an offline device coming back with old edits can never overwrite newer ones.
create or replace function app_routine_raccoon_private.enforce_lww_and_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

-- Applies the standard columns, trigger, RLS and owner-only policies to a table.
create or replace function app_routine_raccoon_private.make_synced(tbl regclass, allow_update boolean default true)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t text := tbl::text;
begin
  execute format('alter table %s enable row level security', t);
  execute format('alter table %s force row level security', t);
  execute format(
    'create trigger stamp before insert or update on %s for each row execute function app_routine_raccoon_private.enforce_lww_and_stamp()', t);
  execute format('create index on %s (user_id, server_seq)', t);
  execute format(
    'create policy owner_select on %s for select to authenticated using (user_id = (select auth.uid()))', t);
  execute format(
    'create policy owner_insert on %s for insert to authenticated with check (user_id = (select auth.uid()))', t);
  if allow_update then
    execute format(
      'create policy owner_update on %s for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end if;
  execute format('revoke all on %s from anon', t);
  execute format('grant select, insert%s on %s to authenticated', case when allow_update then ', update' else '' end, t);
end;
$$;

create table app_routine_raccoon.day_plans (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 4000),
  kind text not null check (kind in ('primary', 'survival', 'custom')),
  survival_level smallint check (survival_level between 1 and 3),
  rank text not null,
  archived_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  constraint survival_level_matches_kind check ((kind = 'survival') = (survival_level is not null))
);
create unique index day_plans_one_primary on app_routine_raccoon.day_plans (user_id) where kind = 'primary' and deleted_at is null;

create table app_routine_raccoon.sections (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 4000),
  color text not null check (char_length(color) <= 40),
  start_time text check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  recurrence jsonb check (recurrence is null or jsonb_typeof(recurrence) = 'object'),
  notify_on_start boolean not null default true,
  notify_before_close boolean not null default true,
  closing_lead_minutes smallint check (closing_lead_minutes between 0 and 240),
  archived_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  server_updated_at timestamptz not null default now()
);

create table app_routine_raccoon.plan_sections (
  plan_id uuid not null references app_routine_raccoon.day_plans (id) on delete cascade deferrable initially deferred,
  section_id uuid not null references app_routine_raccoon.sections (id) on delete cascade deferrable initially deferred,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rank text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  primary key (plan_id, section_id)
);

create table app_routine_raccoon.tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  section_id uuid not null references app_routine_raccoon.sections (id) on delete cascade deferrable initially deferred,
  rank text not null,
  name text not null check (char_length(name) between 1 and 80),
  emoji text not null check (char_length(emoji) between 1 and 16),
  minutes smallint not null check (minutes between 1 and 600),
  hard boolean not null default false,
  never_shrink boolean not null default false,
  survival_level smallint check (survival_level between 1 and 3),
  recurrence jsonb check (recurrence is null or jsonb_typeof(recurrence) = 'object'),
  mantra text not null default '' check (char_length(mantra) <= 300),
  notes text not null default '' check (char_length(notes) <= 4000),
  video_url text not null default '' check (char_length(video_url) <= 500),
  location text not null default '' check (char_length(location) <= 120),
  steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array'),
  smaller_versions jsonb not null default '{}' check (jsonb_typeof(smaller_versions) = 'object'),
  archived_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  server_updated_at timestamptz not null default now()
);
create index tasks_section on app_routine_raccoon.tasks (section_id);

create table app_routine_raccoon.task_occurrences (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references app_routine_raccoon.tasks (id) on delete cascade deferrable initially deferred,
  day_key date not null,
  status text not null check (status in ('pending', 'done', 'skipped')),
  completed_at timestamptz,
  checked_step_ids jsonb not null default '[]' check (jsonb_typeof(checked_step_ids) = 'array'),
  minutes_credited smallint check (minutes_credited >= 0),
  survival_level_at_completion smallint check (survival_level_at_completion between 1 and 3),
  carried_from_day_key date,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  constraint one_occurrence_per_task_per_day unique (task_id, day_key)
);
create index task_occurrences_user_day on app_routine_raccoon.task_occurrences (user_id, day_key);

create table app_routine_raccoon.day_records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day_key date not null,
  survival_on boolean not null default false,
  survival_level smallint not null default 2 check (survival_level between 1 and 3),
  closed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, day_key)
);

create table app_routine_raccoon.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_seq bigint not null default 0,
  server_updated_at timestamptz not null default now()
);

create table app_routine_raccoon.log_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  at timestamptz not null,
  day_key date not null,
  kind text not null check (kind in ('completed', 'uncompleted', 'skipped', 'added', 'edited', 'imported', 'survival', 'closed')),
  title text not null check (char_length(title) <= 200),
  meta text not null default '' check (char_length(meta) <= 300),
  task_id uuid,
  section_id uuid,
  updated_at timestamptz not null default now(),
  server_seq bigint not null default 0,
  server_updated_at timestamptz not null default now()
);
create index log_entries_user_at on app_routine_raccoon.log_entries (user_id, at desc);

select app_routine_raccoon_private.make_synced('app_routine_raccoon.day_plans');
select app_routine_raccoon_private.make_synced('app_routine_raccoon.sections');
select app_routine_raccoon_private.make_synced('app_routine_raccoon.plan_sections');
select app_routine_raccoon_private.make_synced('app_routine_raccoon.tasks');
select app_routine_raccoon_private.make_synced('app_routine_raccoon.task_occurrences');
select app_routine_raccoon_private.make_synced('app_routine_raccoon.day_records');
select app_routine_raccoon_private.make_synced('app_routine_raccoon.user_settings');
select app_routine_raccoon_private.make_synced('app_routine_raccoon.log_entries', allow_update => false);

create table app_routine_raccoon_private.assist_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  calls integer not null default 0,
  primary key (user_id, day)
);

create or replace function app_routine_raccoon.consume_assist_quota(daily_limit integer default 30)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  used integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if daily_limit < 1 or daily_limit > 200 then
    raise exception 'daily_limit out of range' using errcode = '22023';
  end if;
  insert into app_routine_raccoon_private.assist_usage as u (user_id, day, calls)
  values (uid, current_date, 1)
  on conflict (user_id, day) do update set calls = u.calls + 1
  returning calls into used;
  return used <= daily_limit;
end;
$$;

revoke all on function app_routine_raccoon.consume_assist_quota(integer) from public, anon;
grant execute on function app_routine_raccoon.consume_assist_quota(integer) to authenticated;
revoke all on function app_routine_raccoon_private.enforce_lww_and_stamp() from public;
revoke all on function app_routine_raccoon_private.make_synced(regclass, boolean) from public;
