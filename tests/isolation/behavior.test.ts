import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { runMigrations } from '../../src/platform/db/index.ts';
import {
  createDatabaseFromPool,
  type Database,
  type TenantTransaction,
} from '../../src/platform/db/with-tenant.ts';
import { createTestDatabase, errorCode, query, type TestDatabase } from '../helpers/db.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/isolation.sql', import.meta.url));
const A = '0197b3a2-7c1e-7f00-8000-00000000000a';
const B = '0197b3a2-7c1e-7f00-8000-00000000000b';
const RLS_VIOLATION = '42501';
const FK_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';
const NOT_NULL_VIOLATION = '23502';

let testDb: TestDatabase;
let pool: Pool;
let database: Database;

/** Drizzle wraps driver errors: the PostgreSQL code may be on `cause`. */
function pgCode(error: unknown): string | undefined {
  const direct = (error as { code?: string }).code;
  return direct ?? (error as { cause?: { code?: string } }).cause?.code;
}

/**
 * Returns the PostgreSQL error code and the message of the DRIVER error. Drizzle wraps it in an error
 * whose own message repeats the SQL text and the parameters: never expose that wrapper to users or logs.
 */
async function failsWith(
  promise: Promise<unknown>,
): Promise<{ code?: string; message: string; wrapperMessage: string }> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: Error }).cause;
    const wrapperMessage = (error as Error).message;
    const message = cause?.message ?? wrapperMessage;
    const code = pgCode(error);
    return code === undefined ? { message, wrapperMessage } : { code, message, wrapperMessage };
  }
  throw new Error('Expected the statement to fail, but it succeeded');
}

async function adminCount(table: string): Promise<number> {
  const rows = await query<{ n: string }>(
    testDb.adminUrl,
    `select count(*)::text as n from app.${table}`,
  );
  return Number(rows[0]?.n);
}

async function parents(tx: TenantTransaction): Promise<string[]> {
  const result = await tx.execute<{ name: string }>(
    sql`select name from app.iso_parent order by name`,
  );
  return result.rows.map((row) => row.name);
}

beforeAll(async () => {
  testDb = await createTestDatabase();
  await runMigrations(testDb.migratorUrl, MIGRATIONS);
  await query(testDb.migratorUrl, await readFile(FIXTURE, 'utf8'));
  pool = new Pool({ connectionString: testDb.rwUrl, max: 3 });
  database = createDatabaseFromPool(pool, { ownsPool: false });
});

beforeEach(async () => {
  await query(
    testDb.adminUrl,
    `truncate app.iso_child, app.iso_child_naive, app.iso_parent, app.iso_parent_naive, app.iso_tenant_like`,
  );
});

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

describe('SPEC-000-AC8 reads and writes are scoped to the tenant', () => {
  it('each tenant sees only its own rows', async () => {
    await database.withTenant(A, async (tx) => {
      await tx.execute(sql`insert into app.iso_parent (id, name) values (${randomUUID()}, 'a1')`);
      await tx.execute(sql`insert into app.iso_parent (id, name) values (${randomUUID()}, 'a2')`);
    });
    await database.withTenant(B, async (tx) => {
      await tx.execute(sql`insert into app.iso_parent (id, name) values (${randomUUID()}, 'b1')`);
    });
    expect(await database.withTenant(A, parents)).toEqual(['a1', 'a2']);
    expect(await database.withTenant(B, parents)).toEqual(['b1']);
  });

  it('UPDATE and DELETE aimed at another tenant row affect 0 rows', async () => {
    const bId = randomUUID();
    await database.withTenant(B, async (tx) => {
      await tx.execute(sql`insert into app.iso_parent (id, name) values (${bId}, 'b-secret')`);
    });
    const outcome = await database.withTenant(A, async (tx) => {
      const update = await tx.execute(
        sql`update app.iso_parent set name = 'hacked' where id = ${bId}`,
      );
      const del = await tx.execute(sql`delete from app.iso_parent where id = ${bId}`);
      return { updated: update.rowCount, deleted: del.rowCount };
    });
    expect(outcome).toEqual({ updated: 0, deleted: 0 });
    const survivors = await query<{ name: string }>(
      testDb.adminUrl,
      'select name from app.iso_parent',
    );
    expect(survivors).toEqual([{ name: 'b-secret' }]);
  });

  it('a table keyed by the tenant id exposes only the own row, and refuses another id', async () => {
    await database.withTenant(A, async (tx) => {
      await tx.execute(sql`insert into app.iso_tenant_like (id, name) values (${A}, 'A org')`);
    });
    await database.withTenant(B, async (tx) => {
      await tx.execute(sql`insert into app.iso_tenant_like (id, name) values (${B}, 'B org')`);
    });
    const seenByA = await database.withTenant(A, async (tx) => {
      const rows = await tx.execute<{ name: string }>(sql`select name from app.iso_tenant_like`);
      return rows.rows.map((row) => row.name);
    });
    expect(seenByA).toEqual(['A org']);
    const refused = await failsWith(
      database.withTenant(A, (tx) =>
        tx.execute(sql`insert into app.iso_tenant_like (id, name) values (${B}, 'forged')`),
      ),
    );
    expect(refused.code).toBe(RLS_VIOLATION);
  });
});

describe('SPEC-000-AC9 no tenant context means no access (fail closed)', () => {
  it('SELECT outside withTenant returns 0 rows even though rows exist', async () => {
    await database.withTenant(A, async (tx) => {
      await tx.execute(sql`insert into app.iso_parent (id, name) values (${randomUUID()}, 'a1')`);
    });
    expect(await adminCount('iso_parent')).toBe(1);
    const visible = await pool.query('select * from app.iso_parent');
    expect(visible.rowCount).toBe(0);
  });

  it('INSERT outside withTenant is refused', async () => {
    const refused = await failsWith(
      pool.query(`insert into app.iso_parent (tenant_id, id, name) values ($1, $2, 'x')`, [
        A,
        randomUUID(),
      ]),
    );
    expect(refused.code).toBe(RLS_VIOLATION);
  });

  it('the table owner (app_migrator) is subject to the policy too (FORCE)', async () => {
    await database.withTenant(A, async (tx) => {
      await tx.execute(sql`insert into app.iso_parent (id, name) values (${randomUUID()}, 'a1')`);
    });
    const rows = await query(testDb.migratorUrl, 'select * from app.iso_parent');
    expect(rows).toHaveLength(0);
  });
});

describe('SPEC-000-AC10 a row cannot be written for another tenant', () => {
  it('INSERT with another tenant_id is refused, without echoing data', async () => {
    const refused = await failsWith(
      database.withTenant(A, (tx) =>
        tx.execute(
          sql`insert into app.iso_parent (tenant_id, id, name) values (${B}, ${randomUUID()}, 'forged')`,
        ),
      ),
    );
    expect(refused.code).toBe(RLS_VIOLATION);
    // The PostgreSQL message names the table only. (Drizzle's wrapper message, by contrast, repeats the
    // SQL and its parameters: see wrapperMessage, and keep it out of user-facing errors and logs.)
    expect(refused.message).not.toContain('forged');
    expect(refused.message).not.toContain(B);
    expect(refused.wrapperMessage).toContain('Failed query');
  });

  it('INSERT with the own tenant_id explicitly is accepted', async () => {
    await database.withTenant(A, (tx) =>
      tx.execute(
        sql`insert into app.iso_parent (tenant_id, id, name) values (${A}, ${randomUUID()}, 'ok')`,
      ),
    );
    expect(await adminCount('iso_parent')).toBe(1);
  });

  it('UPDATE moving a row to another tenant is refused', async () => {
    const id = randomUUID();
    await database.withTenant(A, (tx) =>
      tx.execute(sql`insert into app.iso_parent (id, name) values (${id}, 'mine')`),
    );
    const refused = await failsWith(
      database.withTenant(A, (tx) =>
        tx.execute(sql`update app.iso_parent set tenant_id = ${B} where id = ${id}`),
      ),
    );
    expect(refused.code).toBe(RLS_VIOLATION);
  });

  it('tenant_id defaults to the current tenant, and fails without context', async () => {
    await database.withTenant(A, (tx) =>
      tx.execute(sql`insert into app.iso_parent (id, name) values (${randomUUID()}, 'defaulted')`),
    );
    const rows = await query<{ tenant_id: string }>(
      testDb.adminUrl,
      'select tenant_id from app.iso_parent',
    );
    expect(rows[0]?.tenant_id).toBe(A);
    const refused = await failsWith(
      pool.query(`insert into app.iso_parent (id, name) values ($1, 'orphan')`, [randomUUID()]),
    );
    expect([NOT_NULL_VIOLATION, RLS_VIOLATION]).toContain(refused.code);
  });

  it('uniqueness is per tenant: the same name in two tenants does not collide', async () => {
    const insert = (name: string) => (tx: TenantTransaction) =>
      tx.execute(sql`insert into app.iso_parent (id, name) values (${randomUUID()}, ${name})`);
    await database.withTenant(A, insert('shared-name'));
    await database.withTenant(B, insert('shared-name'));
    const duplicate = await failsWith(database.withTenant(A, insert('shared-name')));
    expect(duplicate.code).toBe(UNIQUE_VIOLATION);
  });
});

describe('SPEC-000-AC14 composite foreign keys forbid cross-tenant references', () => {
  it('a child of tenant A cannot reference a parent of tenant B', async () => {
    const parentB = randomUUID();
    await database.withTenant(B, (tx) =>
      tx.execute(sql`insert into app.iso_parent (id, name) values (${parentB}, 'b-parent')`),
    );
    const refused = await failsWith(
      database.withTenant(A, (tx) =>
        tx.execute(
          sql`insert into app.iso_child (id, parent_id) values (${randomUUID()}, ${parentB})`,
        ),
      ),
    );
    expect(refused.code).toBe(FK_VIOLATION);
  });

  it('a child can reference a parent of its own tenant', async () => {
    const parentA = randomUUID();
    await database.withTenant(A, async (tx) => {
      await tx.execute(sql`insert into app.iso_parent (id, name) values (${parentA}, 'a-parent')`);
      await tx.execute(
        sql`insert into app.iso_child (id, parent_id) values (${randomUUID()}, ${parentA})`,
      );
    });
    expect(await adminCount('iso_child')).toBe(1);
  });

  it('NEGATIVE CONTROL: a single-column FK DOES allow the cross-tenant reference', async () => {
    const parentB = randomUUID();
    await database.withTenant(B, (tx) =>
      tx.execute(sql`insert into app.iso_parent_naive (id) values (${parentB})`),
    );
    await database.withTenant(A, (tx) =>
      tx.execute(
        sql`insert into app.iso_child_naive (id, parent_id) values (${randomUUID()}, ${parentB})`,
      ),
    );
    const crossing = await query<{ n: string }>(
      testDb.adminUrl,
      `select count(*)::text as n
         from app.iso_child_naive c join app.iso_parent_naive p on p.id = c.parent_id
        where c.tenant_id <> p.tenant_id`,
    );
    // This is the hole composite FKs close. If this ever reads 0, the control no longer proves anything.
    expect(crossing[0]?.n).toBe('1');
  });
});

describe('app.enable_tenant_isolation', () => {
  const fixtureTables = [
    'iso_tenant_like',
    'iso_parent',
    'iso_child',
    'iso_parent_naive',
    'iso_child_naive',
  ];

  it('enables and FORCES row level security with one policy on every protected table', async () => {
    const rows = await query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      policies: string;
    }>(
      testDb.adminUrl,
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity,
              (select count(*)::text from pg_policies p
                where p.schemaname = 'app' and p.tablename = c.relname and p.policyname = 'tenant_isolation') as policies
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app' and c.relname = any($1) order by c.relname`,
      [fixtureTables],
    );
    expect(rows).toHaveLength(fixtureTables.length);
    for (const row of rows) {
      expect(row, row.relname).toMatchObject({
        relrowsecurity: true,
        relforcerowsecurity: true,
        policies: '1',
      });
    }
  });

  it('is idempotent', async () => {
    await query(testDb.migratorUrl, `select app.enable_tenant_isolation('app.iso_parent')`);
    await query(testDb.migratorUrl, `select app.enable_tenant_isolation('app.iso_parent')`);
    const policies = await query<{ n: string }>(
      testDb.adminUrl,
      `select count(*)::text as n from pg_policies where tablename = 'iso_parent'`,
    );
    expect(policies[0]?.n).toBe('1');
  });

  it('rejects a table without the tenant column, or with a wrong column definition', async () => {
    await query(
      testDb.migratorUrl,
      `create table app.iso_nocol (id uuid);
       create table app.iso_texty (tenant_id text not null);
       create table app.iso_nullable (tenant_id uuid);`,
    );
    const call = (table: string) =>
      failsWith(query(testDb.migratorUrl, `select app.enable_tenant_isolation('app.${table}')`));
    expect((await call('iso_nocol')).message).toMatch(/has no column/);
    expect((await call('iso_texty')).message).toMatch(/must be uuid NOT NULL/);
    expect((await call('iso_nullable')).message).toMatch(/must be uuid NOT NULL/);
    await query(testDb.migratorUrl, 'drop table app.iso_nocol, app.iso_texty, app.iso_nullable');
  });

  it('cannot be executed, nor undone, by app_rw', async () => {
    expect(
      await errorCode(testDb.rwUrl, `select app.enable_tenant_isolation('app.iso_parent')`),
    ).toBe(RLS_VIOLATION);
    expect(
      await errorCode(testDb.rwUrl, 'alter table app.iso_parent disable row level security'),
    ).toBe(RLS_VIOLATION);
    expect(
      await errorCode(testDb.rwUrl, 'alter table app.iso_parent no force row level security'),
    ).toBe(RLS_VIOLATION);
    expect(await errorCode(testDb.rwUrl, 'drop policy tenant_isolation on app.iso_parent')).toBe(
      RLS_VIOLATION,
    );
  });
});
