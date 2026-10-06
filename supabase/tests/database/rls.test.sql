-- Database guarantees the app relies on (TECH_SPEC §3.2, §4 "Database").
-- Run with `supabase test db` against the local stack (CI: .github/workflows/db.yml).
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- Two users. Inserted as the test superuser before switching to the API role.
insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-4111-8111-111111111111', 'a@example.test', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'b@example.test', 'authenticated', 'authenticated');

-- ── As user A ──────────────────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

insert into app_routine_raccoon.day_plans (id, name, kind, rank, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'Normal', 'primary', 'a0',
        '2026-09-08T08:00:00Z', '2026-09-08T08:00:00Z');

select is(
  (select user_id from app_routine_raccoon.day_plans where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'user_id defaults to auth.uid()'
);

select ok(
  (select server_seq > 0 from app_routine_raccoon.day_plans where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'server_seq is stamped by the trigger'
);

-- Last-write-wins: an older updated_at is silently dropped.
update app_routine_raccoon.day_plans
set name = 'Stale', updated_at = '2026-09-01T00:00:00Z'
where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select is(
  (select name from app_routine_raccoon.day_plans where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'Normal',
  'a stale write does not overwrite a newer row'
);

-- Hardening migration: a far-future updated_at is clamped, so it can't freeze the row.
update app_routine_raccoon.day_plans
set name = 'Future', updated_at = '2099-01-01T00:00:00Z'
where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select ok(
  (select updated_at <= now() + interval '5 minutes' from app_routine_raccoon.day_plans
   where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'client timestamps are clamped to now() + 5 minutes'
);

select throws_ok(
  $$ insert into app_routine_raccoon.day_plans (id, name, kind, rank, created_at, updated_at)
     values ('aaaaaaaa-0000-4000-8000-000000000002', 'Second', 'primary', 'a1', now(), now()) $$,
  '23505',
  null,
  'only one live primary plan per user'
);

select throws_ok(
  $$ delete from app_routine_raccoon.day_plans $$,
  '42501',
  null,
  'clients cannot hard-delete (soft delete only)'
);

select throws_ok(
  $$ update app_routine_raccoon.day_plans set user_id = '22222222-2222-4222-8222-222222222222' $$,
  null,
  null,
  'user_id cannot be changed'
);

-- ── As user B ──────────────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from app_routine_raccoon.day_plans),
  0,
  'RLS: user B cannot read user A''s rows'
);

update app_routine_raccoon.day_plans set name = 'Hijacked';
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select isnt(
  (select name from app_routine_raccoon.day_plans where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'Hijacked',
  'RLS: user B cannot modify user A''s rows'
);

-- ── As anon ────────────────────────────────────────────────────────────────────────────
reset role;
set local role anon;
select throws_ok(
  $$ select * from app_routine_raccoon.tasks $$,
  '42501',
  null,
  'anon has no access to app tables'
);

select * from finish();
rollback;
