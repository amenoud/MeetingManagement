-- Baseline: helper used by every row-level-security policy (see ADR-0002).
-- Returns the tenant set by withTenant() for the current transaction, or NULL when unset (fail closed).
-- Do not add BEGIN/COMMIT here: the runner wraps each migration in a transaction.

create function app.current_tenant_id() returns uuid
  language sql
  stable
  as $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;

grant execute on function app.current_tenant_id() to app_rw;
