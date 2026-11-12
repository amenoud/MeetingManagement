import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { runMigrations } from '../../src/platform/db/index.ts';
import {
  createDatabaseFromPool,
  parseTenantId,
  type Database,
  type TenantTransaction,
} from '../../src/platform/db/with-tenant.ts';
import { createTestDatabase, type TestDatabase } from './helpers.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));
const TENANT_A = '0197b3a2-7c1e-7f00-8000-00000000000a';
const TENANT_B = '0197b3a2-7c1e-7f00-8000-00000000000b';
const TENANT_C = '0197b3a2-7c1e-7f00-8000-00000000000c';

let testDb: TestDatabase;
const pools: Pool[] = [];

function newDatabase(max: number): { pool: Pool; database: Database } {
  const pool = new Pool({ connectionString: testDb.rwUrl, max });
  pools.push(pool);
  return { pool, database: createDatabaseFromPool(pool, { ownsPool: false }) };
}

async function currentTenant(tx: TenantTransaction): Promise<string | null> {
  const result = await tx.execute<{ tenant: string | null }>(
    sql`select app.current_tenant_id()::text as tenant`,
  );
  return result.rows[0]?.tenant ?? null;
}

async function rawSetting(pool: Pool): Promise<string | null> {
  const result = await pool.query<{ value: string | null }>(
    `select current_setting('app.tenant_id', true) as value`,
  );
  return result.rows[0]?.value ?? null;
}

beforeAll(async () => {
  testDb = await createTestDatabase();
  await runMigrations(testDb.migratorUrl, MIGRATIONS);
});

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

afterAll(async () => {
  await testDb.drop();
});

describe('withTenant: context', () => {
  it('SPEC-000-AC9 sets the tenant inside the call and nothing outside', async () => {
    const { pool, database } = newDatabase(1);
    expect(await rawSetting(pool)).toBeNull();
    const inside = await database.withTenant(TENANT_A, currentTenant);
    expect(inside).toBe(TENANT_A);
    const after = await rawSetting(pool);
    expect(after === null || after === '').toBe(true);
  });

  it('normalizes the tenant id to lowercase', async () => {
    const { database } = newDatabase(1);
    expect(await database.withTenant(TENANT_A.toUpperCase(), currentTenant)).toBe(TENANT_A);
  });

  it('returns the callback value and runs everything in a single transaction', async () => {
    const { database } = newDatabase(1);
    const ids = await database.withTenant(TENANT_A, async (tx) => {
      const first = await tx.execute<{ id: string }>(sql`select txid_current()::text as id`);
      const second = await tx.execute<{ id: string }>(sql`select txid_current()::text as id`);
      return [first.rows[0]?.id, second.rows[0]?.id];
    });
    expect(ids[0]).toBeDefined();
    expect(ids[0]).toBe(ids[1]);
  });
});

describe('withTenant: pooled connection reuse', () => {
  it('SPEC-000-AC11 leaves no residue on a reused connection (pool of 1)', async () => {
    const { pool, database } = newDatabase(1);
    await database.withTenant(TENANT_A, currentTenant);
    const afterA = await rawSetting(pool);
    expect(afterA === null || afterA === '').toBe(true);

    expect(await database.withTenant(TENANT_B, currentTenant)).toBe(TENANT_B);
    const afterB = await rawSetting(pool);
    expect(afterB === null || afterB === '').toBe(true);
  });

  it('SPEC-000-AC11 resets the context after a failing callback (rollback)', async () => {
    const { pool, database } = newDatabase(1);
    await expect(
      database.withTenant(TENANT_A, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const after = await rawSetting(pool);
    expect(after === null || after === '').toBe(true);
    expect(await database.withTenant(TENANT_B, currentTenant)).toBe(TENANT_B);
  });

  it('SPEC-000-AC11 never mixes tenants under concurrency (3 connections, 60 calls)', async () => {
    const { database } = newDatabase(3);
    const tenants = [TENANT_A, TENANT_B, TENANT_C];
    const calls = Array.from({ length: 60 }, (_, index) => {
      const tenant = tenants[index % 3] as string;
      return database.withTenant(tenant, async (tx) => {
        const before = await currentTenant(tx);
        await tx.execute(sql`select pg_sleep(${Math.random() * 0.02})`);
        const after = await currentTenant(tx);
        return { tenant, before, after };
      });
    });
    for (const result of await Promise.all(calls)) {
      expect(result.before).toBe(result.tenant);
      expect(result.after).toBe(result.tenant);
    }
  });

  it('refuses and evicts a connection that carries a leaked session-level tenant', async () => {
    const { pool, database } = newDatabase(1);
    // Simulate a bug elsewhere: a session-level (not transaction-local) setting on the only connection.
    const poisoned = await pool.connect();
    await poisoned.query(`select set_config('app.tenant_id', $1, false)`, [TENANT_B]);
    poisoned.release();

    await expect(database.withTenant(TENANT_A, currentTenant)).rejects.toThrow(
      'Tenant context leaked',
    );
    // The poisoned connection was destroyed: the next call gets a fresh, clean one.
    expect(await database.withTenant(TENANT_A, currentTenant)).toBe(TENANT_A);
  });
});

describe('withTenant: input and misuse', () => {
  it('rejects non-UUID tenant ids before opening any connection', async () => {
    const { pool, database } = newDatabase(1);
    const bad = [
      '',
      'not-a-uuid',
      "'; drop table app.x; --",
      '0197b3a2-7c1e-7f00-8000-00000000000a; select 1',
      '00000000-0000-0000-0000-000000000000',
      ' 0197b3a2-7c1e-7f00-8000-00000000000a',
    ];
    for (const value of bad) {
      await expect(database.withTenant(value, currentTenant), value).rejects.toThrow(
        'Invalid tenant id',
      );
    }
    expect(pool.totalCount).toBe(0);
  });

  it('parseTenantId rejects non-strings', () => {
    expect(() => parseTenantId(undefined as unknown as string)).toThrow('Invalid tenant id');
  });

  it('rejects nested withTenant calls, even for the same tenant', async () => {
    const { database } = newDatabase(2);
    await expect(
      database.withTenant(TENANT_A, () => database.withTenant(TENANT_A, currentTenant)),
    ).rejects.toThrow('Nested withTenant');
  });

  it('a transaction handle used after the call ended fails loudly', async () => {
    const { database } = newDatabase(1);
    let leaked: TenantTransaction | undefined;
    await database.withTenant(TENANT_A, async (tx) => {
      leaked = tx;
    });
    expect(() => leaked?.execute(sql`select 1`)).toThrow('outside of its withTenant');
  });
});
