-- ════════════════════════════════════════════════════════════════════════════════════════
-- Routine Raccoon account RPCs (TECH_SPEC §2.7). PROPOSED: not yet applied to production.
-- Replaces the planned Edge Functions `auth-lookup` and `account-delete`: two SQL functions
-- need no deployment, no service-role key and no CORS setup.
-- After applying: nothing to flip in the app (it already calls these RPCs and falls back
-- gracefully while they are missing: RR-AUTH-006 / RR-AUTH-007).
-- Expand-only: new private table, new functions, new delete policies (clients still have no
-- DELETE privilege, so they still cannot hard-delete).
-- ════════════════════════════════════════════════════════════════════════════════════════

-- Rate-limit buckets for the email lookup (hashes only; never raw emails or IPs).
create table if not exists app_routine_raccoon_private.lookup_hits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);
revoke all on app_routine_raccoon_private.lookup_hits from public, anon, authenticated;

-- One hit in the current minute for `p_bucket`; false once over `p_limit`.
create or replace function app_routine_raccoon_private.take_lookup_hit(p_bucket text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
begin
  insert into app_routine_raccoon_private.lookup_hits as h (bucket, window_start, hits)
  values (p_bucket, date_trunc('minute', now()), 1)
  on conflict (bucket, window_start) do update set hits = h.hits + 1
  returning hits into used;
  delete from app_routine_raccoon_private.lookup_hits where window_start < now() - interval '10 minutes';
  return used <= p_limit;
end;
$$;
revoke all on function app_routine_raccoon_private.take_lookup_hit(text, integer) from public, anon, authenticated;

-- Email-first sign-in hint (handoff "Account found" / "Google account" / "New account").
-- Accepted account-enumeration trade-off (TECH_SPEC §3.1, Q5), with the mitigations:
--   * 10 lookups / minute per IP and 5 / minute per email (hashed), else HTTP 429 (PT429);
--   * minimal answer: exists, provider names, first name;
--   * roughly uniform timing for hits and misses.
-- Note: auth.users is shared by every app in this project, so an account made in another app
-- also reads as "Account found" (and can sign in here).
create or replace function app_routine_raccoon.lookup_account(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_ip text := coalesce(nullif(trim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''), 'unknown');
  v_user record;
  v_providers text[];
  v_first text;
begin
  if char_length(v_email) > 320 or v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if not app_routine_raccoon_private.take_lookup_hit('ip:' || encode(sha256(convert_to(v_ip, 'UTF8')), 'hex'), 10)
     or not app_routine_raccoon_private.take_lookup_hit('email:' || encode(sha256(convert_to(v_email, 'UTF8')), 'hex'), 5) then
    raise exception 'too many lookups' using errcode = 'PT429';
  end if;

  select u.id, u.raw_user_meta_data into v_user
  from auth.users u
  where lower(u.email) = v_email
    and u.deleted_at is null
    and coalesce(u.is_anonymous, false) = false
  limit 1;

  perform pg_sleep(0.08 + random() * 0.04);
  if v_user.id is null then
    return jsonb_build_object('exists', false, 'providers', '[]'::jsonb, 'first_name', null);
  end if;

  select array_agg(distinct i.provider order by i.provider) into v_providers
  from auth.identities i
  where i.user_id = v_user.id;

  v_first := nullif(coalesce(
    v_user.raw_user_meta_data ->> 'first_name',
    v_user.raw_user_meta_data ->> 'given_name',
    split_part(coalesce(v_user.raw_user_meta_data ->> 'full_name', v_user.raw_user_meta_data ->> 'name', ''), ' ', 1)
  ), '');

  return jsonb_build_object(
    'exists', true,
    'providers', to_jsonb(coalesce(v_providers, '{}'::text[])),
    'first_name', left(v_first, 40)
  );
end;
$$;
revoke all on function app_routine_raccoon.lookup_account(text) from public;
grant execute on function app_routine_raccoon.lookup_account(text) to anon, authenticated;

-- "Delete account" = remove the saved copy (GDPR erasure for this app). The auth user is NOT
-- deleted: auth.users is shared with the owner's other apps in this project, and deleting it
-- would cascade into their data. Rows are removed only for the calling user.
do $$
declare
  t text;
begin
  foreach t in array array[
    'day_plans', 'sections', 'plan_sections', 'tasks', 'task_occurrences',
    'day_records', 'user_settings', 'log_entries'
  ] loop
    -- FORCE RLS applies to the table owner too, so the definer function needs a policy. Clients
    -- still have no DELETE privilege on these tables, so this does not let them delete.
    execute format(
      'create policy owner_delete on app_routine_raccoon.%I for delete using (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

create or replace function app_routine_raccoon.delete_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from app_routine_raccoon.log_entries where user_id = uid;
  delete from app_routine_raccoon.task_occurrences where user_id = uid;
  delete from app_routine_raccoon.day_records where user_id = uid;
  delete from app_routine_raccoon.tasks where user_id = uid;
  delete from app_routine_raccoon.plan_sections where user_id = uid;
  delete from app_routine_raccoon.sections where user_id = uid;
  delete from app_routine_raccoon.day_plans where user_id = uid;
  delete from app_routine_raccoon.user_settings where user_id = uid;
  delete from app_routine_raccoon_private.assist_usage where user_id = uid;
end;
$$;
revoke all on function app_routine_raccoon.delete_my_data() from public, anon;
grant execute on function app_routine_raccoon.delete_my_data() to authenticated;
