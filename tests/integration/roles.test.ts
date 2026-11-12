import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../../src/platform/db/index.ts';
import { createTestDatabase, errorCode, query, type TestDatabase } from '../helpers/db.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));
const INSUFFICIENT_PRIVILEGE = '42501';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  await runMigrations(db.migratorUrl, MIGRATIONS);
});

afterAll(async () => {
  await db.drop();
});

describe('database roles (ADR-0002)', () => {
  it('SPEC-000-AC12 app_rw and app_migrator are not superuser nor BYPASSRLS', async () => {
    const roles = await query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolreplication: boolean;
    }>(
      db.adminUrl,
      `select rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication
       from pg_roles where rolname in ('app_rw', 'app_migrator') order by rolname`,
    );
    expect(roles.map((role) => role.rolname)).toEqual(['app_migrator', 'app_rw']);
    for (const role of roles) {
      expect(role, role.rolname).toMatchObject({
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolreplication: false,
      });
    }
  });

  it('SPEC-000-AC12 app_rw owns no relation, function or schema', async () => {
    const owned = await query<{ n: string }>(
      db.adminUrl,
      `select (
         (select count(*) from pg_class c join pg_roles r on r.oid = c.relowner where r.rolname = 'app_rw') +
         (select count(*) from pg_proc p join pg_roles r on r.oid = p.proowner where r.rolname = 'app_rw') +
         (select count(*) from pg_namespace n join pg_roles r on r.oid = n.nspowner where r.rolname = 'app_rw')
       )::text as n`,
    );
    expect(owned[0]?.n).toBe('0');
  });

  it('SPEC-000-AC12 app_rw cannot create objects anywhere', async () => {
    expect(await errorCode(db.rwUrl, 'create table app.x (id int)')).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await errorCode(db.rwUrl, 'create table public.x (id int)')).toBe(
      INSUFFICIENT_PRIVILEGE,
    );
    expect(await errorCode(db.rwUrl, 'create schema rogue')).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('SPEC-000-AC12 app_rw cannot alter or drop what the migrator owns', async () => {
    expect(await errorCode(db.rwUrl, 'drop function app.current_tenant_id()')).toBe('42501');
    expect(await errorCode(db.rwUrl, 'drop schema app cascade')).toBe('42501');
  });

  it('app_rw cannot read or write the migration bookkeeping', async () => {
    expect(await errorCode(db.rwUrl, 'select * from meta.schema_migrations')).toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it('tables created by the migrator get SELECT/INSERT/UPDATE/DELETE for app_rw, nothing more', async () => {
    await query(db.migratorUrl, 'create table app.probe_privileges (id int primary key)');
    expect(await errorCode(db.rwUrl, 'insert into app.probe_privileges values (1)')).toBeNull();
    expect(await errorCode(db.rwUrl, 'select * from app.probe_privileges')).toBeNull();
    expect(await errorCode(db.rwUrl, 'delete from app.probe_privileges')).toBeNull();
    expect(await errorCode(db.rwUrl, 'truncate app.probe_privileges')).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await errorCode(db.rwUrl, 'alter table app.probe_privileges add column x int')).toBe(
      '42501',
    );
  });

  it('PUBLIC has no access to the application schemas', async () => {
    const outsider = await query<{ can_use: boolean }>(
      db.adminUrl,
      `select has_schema_privilege('public', 'app', 'usage') as can_use`,
    );
    expect(outsider[0]?.can_use).toBe(false);
  });

  it('app_rw gets safe session defaults', async () => {
    const settings = await query<{ statement_timeout: string; search_path: string }>(
      db.rwUrl,
      `select current_setting('statement_timeout') as statement_timeout,
              current_setting('search_path') as search_path`,
    );
    expect(settings[0]).toEqual({ statement_timeout: '15s', search_path: 'app, pg_catalog' });
  });

  it('app.current_tenant_id() fails closed (NULL) when no tenant is set', async () => {
    const unset = await query<{ tenant: string | null }>(
      db.rwUrl,
      'select app.current_tenant_id() as tenant',
    );
    expect(unset[0]?.tenant).toBeNull();
  });

  it('app.current_tenant_id() returns the tenant set for the session', async () => {
    const tenant = '0197b3a2-7c1e-7f00-8000-000000000001';
    const rows = await query<{ tenant: string }>(
      db.rwUrl,
      `select set_config('app.tenant_id', $1, false) as _set, app.current_tenant_id()::text as tenant`,
      [tenant],
    );
    expect(rows[0]?.tenant).toBe(tenant);
  });
});
