-- Account RPCs (migration 20261004120000). Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

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

-- Per-email limit: 5 a minute. One was used above for a@ (any case), so four more pass and
-- the sixth fails. The IP has used 7 of its 10 by then, so it's the email limit that bites.
select app_routine_raccoon.lookup_account('a@example.test');
select app_routine_raccoon.lookup_account('a@example.test');
select app_routine_raccoon.lookup_account('a@example.test');
select app_routine_raccoon.lookup_account('a@example.test');
select throws_ok(
  $$ select app_routine_raccoon.lookup_account('a@example.test') $$,
  'PT429', null, 'rate limited per email'
);

-- Per-IP limit: 10 a minute. 7 used so far (the refused call above rolled back), so three
-- new emails pass and the fourth is refused.
select app_routine_raccoon.lookup_account('c1@example.test');
select app_routine_raccoon.lookup_account('c2@example.test');
select app_routine_raccoon.lookup_account('c3@example.test');
select throws_ok(
  $$ select app_routine_raccoon.lookup_account('c4@example.test') $$,
  'PT429', null, 'rate limited per IP'
);
select throws_ok(
  $$ select app_routine_raccoon.delete_my_account() $$,
  '42501', null, 'anon cannot delete an account'
);

-- ── delete_my_account ─────────────────────────────────────────────────────────────────
reset role;
-- User A has an old session and a fresh one; B has a fresh one.
insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('a0000000-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', now() - interval '11 minutes', now()),
  ('a0000000-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111', now(), now()),
  ('b0000000-0000-4000-8000-00000000000b', '22222222-2222-4222-8222-222222222222', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
insert into app_routine_raccoon.day_plans (id, name, kind, rank, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'Normal', 'primary', 'a0', now(), now());
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
insert into app_routine_raccoon.day_plans (id, name, kind, rank, created_at, updated_at)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'Normal', 'primary', 'a0', now(), now());

-- No session id in the token (e.g. an old token format): refused.
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select app_routine_raccoon.delete_my_account() $$,
  'PT403', 'RR-AUTH-012: sign in again to delete your account',
  'needs a session'
);
-- Signed in 11 minutes ago: refused, nothing deleted.
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"a0000000-0000-4000-8000-00000000000a"}';
select throws_ok(
  $$ select app_routine_raccoon.delete_my_account() $$,
  'PT403', 'RR-AUTH-012: sign in again to delete your account',
  'needs a fresh sign-in'
);
-- Someone else's fresh session id doesn't count.
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"b0000000-0000-4000-8000-00000000000b"}';
select throws_ok(
  $$ select app_routine_raccoon.delete_my_account() $$,
  'PT403', 'RR-AUTH-012: sign in again to delete your account',
  'another user''s session is not a fresh sign-in'
);
select is((select count(*)::int from app_routine_raccoon.day_plans), 1, 'refusals delete nothing');

-- Fresh session: everything goes.
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"a0000000-0000-4000-8000-00000000000b"}';
select lives_ok($$ select app_routine_raccoon.delete_my_account() $$, 'a fresh sign-in can delete the account');
select is((select count(*)::int from app_routine_raccoon.day_plans), 0, 'their rows are gone');
select throws_ok(
  $$ delete from app_routine_raccoon.day_plans $$,
  '42501', null, 'clients still cannot hard-delete directly'
);

reset role;
select is(
  (select count(*)::int from auth.users where id = '11111111-1111-4111-8111-111111111111'),
  0,
  'the login is deleted'
);
select is(
  (select count(*)::int from auth.sessions where user_id = '11111111-1111-4111-8111-111111111111')
    + (select count(*)::int from auth.identities where user_id = '11111111-1111-4111-8111-111111111111'),
  0,
  'its sessions and identities go with it'
);
select is(
  (select count(*)::int from app_routine_raccoon.day_plans where user_id = '22222222-2222-4222-8222-222222222222')
    + (select count(*)::int from auth.users where id = '22222222-2222-4222-8222-222222222222'),
  2,
  'another user''s rows and login are untouched'
);

select * from finish();
rollback;
