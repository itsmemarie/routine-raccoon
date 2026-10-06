-- Foundation: keep the shared public schema free of app tables.
-- Each app gets its own schema; API roles must never create objects in public.

revoke create on schema public from anon, authenticated;
-- Postgres 15+ no longer grants this to PUBLIC, but be explicit so it can't come back.
revoke create on schema public from public;
