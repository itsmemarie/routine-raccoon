-- Account RPCs (migration 20261004120000). Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'a@example.test', 'authenticated', 'authenticated', '{"first_name":"Ada"}'),
  ('22222222-2222-4222-8222-222222222222', 'b@example.test', 'authenticated', 'authenticated', '{}');
insert into auth.identities (id, user_id, provider, provider_id, identity_data)
values
  (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'email', 'a@example.test', '{}'),
  (gen_random_uuid(), '22222222-2222-4222-8222-222222222222', 'google', 'g-2', '{}');

-- ── lookup_account (anon) ─────────────────────────────────────────────────────────────
set local role anon;
set local request.headers = '{"x-forwarded-for":"203.0.113.7"}';

select is(
  app_routine_raccoon.lookup_account('A@Example.test'),
  '{"exists": true, "providers": ["email"], "first_name": "Ada"}'::jsonb,
  'finds an email account case-insensitively, with its first name'
);
select is(
  app_routine_raccoon.lookup_account('b@example.test') -> 'providers',
  '["google"]'::jsonb,
  'reports a Google-only account'
);
select is(
  app_routine_raccoon.lookup_account('nobody@example.test'),
  '{"exists": false, "providers": [], "first_name": null}'::jsonb,
  'says no for an unknown email'
);
select throws_ok(
  $$ select app_routine_raccoon.lookup_account('not an email') $$,
  '22023', null, 'rejects malformed input'
);

-- Per-email limit: 5 a minute (two used above for a@, so three more pass, the next fails).
select app_routine_raccoon.lookup_account('a@example.test');
select app_routine_raccoon.lookup_account('a@example.test');
select app_routine_raccoon.lookup_account('a@example.test');
select throws_ok(
  $$ select app_routine_raccoon.lookup_account('a@example.test') $$,
  'PT429', null, 'rate limited per email'
);

-- ── delete_my_data ────────────────────────────────────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
insert into app_routine_raccoon.day_plans (id, name, kind, rank, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'Normal', 'primary', 'a0', now(), now());
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
insert into app_routine_raccoon.day_plans (id, name, kind, rank, created_at, updated_at)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'Normal', 'primary', 'a0', now(), now());

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$ select app_routine_raccoon.delete_my_data() $$, 'a user can delete their saved copy');
select is((select count(*)::int from app_routine_raccoon.day_plans), 0, 'their rows are gone');
select throws_ok(
  $$ delete from app_routine_raccoon.day_plans $$,
  '42501', null, 'clients still cannot hard-delete directly'
);

reset role;
select is(
  (select count(*)::int from app_routine_raccoon.day_plans where user_id = '22222222-2222-4222-8222-222222222222'),
  1,
  'another user''s rows are untouched'
);

select * from finish();
rollback;
