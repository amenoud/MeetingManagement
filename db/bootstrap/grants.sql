-- Idempotent privilege setup, run by the administrator role (see src/platform/db/bootstrap.ts).
-- Roles app_migrator and app_rw already exist when this file runs.
-- ADR-0002: app_rw is never an owner, never superuser, never BYPASSRLS.

do $$
begin
  execute format('revoke all on database %I from public', current_database());
  execute format('grant connect on database %I to app_rw, app_migrator', current_database());
end
$$;

-- Nothing for PUBLIC in the default schema: the application uses its own schemas.
revoke all on schema public from public;

-- app: business tables (owned by app_migrator, usable by app_rw).
-- meta: migration bookkeeping, deliberately NOT accessible to app_rw.
create schema if not exists app authorization app_migrator;
create schema if not exists meta authorization app_migrator;
revoke all on schema app from public;
revoke all on schema meta from public;
grant usage on schema app to app_rw;

-- Objects created later by app_migrator in schema app become usable by app_rw.
-- TRUNCATE, REFERENCES, TRIGGER are never granted by default.
alter default privileges for role app_migrator in schema app
  grant select, insert, update, delete on tables to app_rw;
alter default privileges for role app_migrator in schema app
  grant usage, select on sequences to app_rw;
-- Functions are not executable by PUBLIC: grant explicitly in migrations.
alter default privileges for role app_migrator
  revoke execute on functions from public;

-- Safe defaults per role (new sessions).
alter role app_rw set search_path = app, pg_catalog;
alter role app_rw set statement_timeout = '15s';
alter role app_rw set idle_in_transaction_session_timeout = '30s';
alter role app_migrator set search_path = app, meta, pg_catalog;
