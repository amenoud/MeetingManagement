-- The one way to protect a table with row-level security (ADR-0002, PLAN-DB-02).
-- Usage in a migration, right after creating the table:
--   select app.enable_tenant_isolation('app.my_table');                -- column tenant_id
--   select app.enable_tenant_isolation('app.tenant', 'id');            -- a table keyed by the tenant itself
-- Runs with the privileges of the caller (app_migrator, the table owner). NOT executable by app_rw.
-- Idempotent. FORCE makes the policy apply to the owner too.

create function app.enable_tenant_isolation(target regclass, tenant_column name default 'tenant_id')
  returns void
  language plpgsql
  set search_path = app, pg_catalog
  as $$
declare
  col record;
begin
  select format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as not_null
    into col
    from pg_attribute a
   where a.attrelid = target and a.attname = tenant_column and not a.attisdropped;

  if not found then
    raise exception 'Table % has no column %', target, tenant_column;
  end if;
  if col.type <> 'uuid' or not col.not_null then
    raise exception 'Column %.% must be uuid NOT NULL', target, tenant_column;
  end if;

  execute format('alter table %s enable row level security', target);
  execute format('alter table %s force row level security', target);
  execute format('drop policy if exists tenant_isolation on %s', target);
  execute format(
    'create policy tenant_isolation on %s using (%I = app.current_tenant_id()) with check (%I = app.current_tenant_id())',
    target, tenant_column, tenant_column
  );
end
$$;

revoke all on function app.enable_tenant_isolation(regclass, name) from public;
