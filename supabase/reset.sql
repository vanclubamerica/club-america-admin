-- =============================================================================
-- DESTRUCTIVE — wipes all application data. Read before running.
--
-- This drops and recreates the `public` schema: every table, function, policy,
-- and row this project created, including audit history.
--
-- It does NOT touch:
--   - your Supabase Auth users (they live in the `auth` schema)
--   - uploaded files in Storage (they live in the `storage` schema)
--   - the public website (that is in GitHub and completely separate)
--
-- WHEN TO USE THIS
--   - A migration failed partway through and you want a clean slate.
--   - You are setting up a fresh environment and something is inconsistent.
--
-- WHY IT IS SOMETIMES NECESSARY
--   The migrations use `create table if not exists`, which makes re-running
--   safe — but only for tables that do not exist yet. If an earlier run
--   created a table with an older definition, `if not exists` will silently
--   skip it and you will be missing columns. Resetting avoids that ambiguity.
--
-- DO NOT run this on a live installation that officers are using. Once the
-- club is depending on this system, audit history and content are not
-- recoverable from here — restore from a Supabase backup instead.
-- =============================================================================

drop schema if exists public cascade;
create schema public;

alter schema public owner to postgres;

grant usage on schema public to postgres, anon, authenticated, service_role;

grant all privileges on all tables    in schema public to postgres, anon, authenticated, service_role;
grant all privileges on all functions in schema public to postgres, anon, authenticated, service_role;
grant all privileges on all sequences in schema public to postgres, anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;

-- After running this, run the migrations again in order:
--   0001_init.sql -> 0002_audit_immutability.sql -> 0003_storage.sql -> 0004_seed.sql
