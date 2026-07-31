-- =============================================================================
-- Audit log immutability
--
-- The spec requires "permanent uneditable logs" that users cannot delete or
-- modify. Enforcing that only in application code would be a false promise —
-- anyone with the service role key could rewrite history.
--
-- So it is enforced at three layers in the database itself:
--   1. RLS grants `authenticated` SELECT only (see 0001_init.sql).
--   2. Table privileges revoke UPDATE/DELETE from every role.
--   3. A trigger raises an exception on UPDATE/DELETE regardless of who is
--      asking — including postgres, service_role, and table owners.
--
-- Layer 3 is what makes this real: triggers fire for superusers too, so even
-- a leaked service role key cannot quietly erase evidence of its own misuse.
-- =============================================================================

-- --- Layer 2: privileges -----------------------------------------------------
revoke update, delete, truncate on public.audit_logs from public;
revoke update, delete, truncate on public.audit_logs from anon;
revoke update, delete, truncate on public.audit_logs from authenticated;
revoke update, delete, truncate on public.audit_logs from service_role;

grant select on public.audit_logs to authenticated;
grant select, insert on public.audit_logs to service_role;

-- --- Layer 3: trigger --------------------------------------------------------
create or replace function public.reject_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'audit_logs is append-only: % is not permitted on this table', tg_op
    using errcode = 'insufficient_privilege',
          hint = 'Audit history is permanent by design and cannot be altered.';
end;
$$;

drop trigger if exists audit_logs_no_update on public.audit_logs;
create trigger audit_logs_no_update
  before update on public.audit_logs
  for each row execute function public.reject_audit_mutation();

drop trigger if exists audit_logs_no_delete on public.audit_logs;
create trigger audit_logs_no_delete
  before delete on public.audit_logs
  for each row execute function public.reject_audit_mutation();

-- TRUNCATE bypasses row-level triggers, so it needs its own statement-level one.
drop trigger if exists audit_logs_no_truncate on public.audit_logs;
create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.reject_audit_mutation();

-- =============================================================================
-- The same protection for archived leadership history and version snapshots.
-- These are the institutional memory that survives leadership turnover, so a
-- new officer should not be able to erase a predecessor's record by accident.
-- Versions may be created, never rewritten.
-- =============================================================================
drop trigger if exists content_versions_no_update on public.content_versions;
create trigger content_versions_no_update
  before update on public.content_versions
  for each row execute function public.reject_audit_mutation();

drop trigger if exists leadership_terms_no_delete on public.leadership_terms;
create trigger leadership_terms_no_delete
  before delete on public.leadership_terms
  for each row execute function public.reject_audit_mutation();

-- =============================================================================
-- Convenience view: audit log with a human-friendly local timestamp.
-- =============================================================================
create or replace view public.audit_log_feed as
select
  id,
  actor_name,
  actor_role,
  action,
  section,
  summary,
  entity_type,
  entity_id,
  previous_value,
  new_value,
  created_at,
  (created_at at time zone 'America/Chicago') as created_at_local
from public.audit_logs;
