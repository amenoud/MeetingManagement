import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import {
  auditIsolation,
  bootstrapRoles,
  diffSnapshots,
  dumpDatabase,
  restoreDatabase,
  runMigrations,
  snapshotDatabase,
  type Snapshot,
  type ToolRunner,
} from '../../src/platform/db/index.ts';
import { createDatabaseFromPool } from '../../src/platform/db/with-tenant.ts';
import { createBareDatabase, createTestDatabase, query, type TestDatabase } from '../helpers/db.ts';
import { compliantExceptions } from '../helpers/exceptions.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));
const COMPLIANT = fileURLToPath(new URL('../isolation/fixtures/compliant.sql', import.meta.url));
const A = '0197b3a2-7c1e-7f00-8000-00000000000a';
const B = '0197b3a2-7c1e-7f00-8000-00000000000b';
const PER_TENANT = 40;

let source: TestDatabase;
let restored: TestDatabase;
let workDir: string;
let dumpFile: string;
let sourceSnapshot: Snapshot;
const extra: TestDatabase[] = [];

/** Rebuilds the state a new server would have: roles first (no schemas), restore, then privileges. */
async function restoreInto(database: TestDatabase, file: string): Promise<void> {
  await bootstrapRoles(database.adminUrl, database.rwUrl, database.migratorUrl, {
    privileges: false,
  });
  await restoreDatabase(database.adminUrl, file);
  await bootstrapRoles(database.adminUrl, database.rwUrl, database.migratorUrl);
}

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'mm-restore-'));
  dumpFile = join(workDir, 'source.dump');

  source = await createTestDatabase();
  await runMigrations(source.migratorUrl, MIGRATIONS);
  // Created by app_migrator like real migrations, so the default privileges for app_rw apply.
  await query(source.migratorUrl, await readFile(COMPLIANT, 'utf8'));
  const pool = new Pool({ connectionString: source.rwUrl, max: 2 });
  const database = createDatabaseFromPool(pool, { ownsPool: false });
  try {
    for (const tenant of [A, B]) {
      await database.withTenant(tenant, async (tx) => {
        await tx.execute(sql`insert into app.aud_root (id, name) values (${tenant}, 'Org')`);
        await tx.execute(sql`insert into app.aud_global (id, email)
        select gen_random_uuid(), 'user' || g || '-' || ${tenant}::text || '@example.test'
          from generate_series(1, 3) g`);
        await tx.execute(sql`insert into app.aud_parent (id, name)
        select gen_random_uuid(), 'parent-' || g from generate_series(1, ${PER_TENANT}) g`);
        await tx.execute(sql`insert into app.aud_child (id, parent_id)
        select gen_random_uuid(), id from app.aud_parent`);
      });
    }
  } finally {
    await pool.end();
  }
  sourceSnapshot = await snapshotDatabase(source.adminUrl);

  await dumpDatabase(source.adminUrl, dumpFile);

  restored = await createBareDatabase();
  await restoreInto(restored, dumpFile);
}, 120_000);

afterAll(async () => {
  await Promise.all([source?.drop(), restored?.drop(), ...extra.map((db) => db.drop())]);
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

describe('SPEC-000-AC27 backup and restore', () => {
  it('produces a non-empty custom-format dump', async () => {
    const content = await readFile(dumpFile);
    expect(content.length).toBeGreaterThan(1000);
    expect(content.subarray(0, 5).toString('latin1')).toBe('PGDMP');
  });

  it('the source holds data for both tenants (the drill is not vacuous)', () => {
    expect(sourceSnapshot['app.aud_parent']?.rows).toBe(PER_TENANT * 2);
    expect(sourceSnapshot['app.aud_child']?.rows).toBe(PER_TENANT * 2);
    expect(sourceSnapshot['meta.schema_migrations']?.rows).toBeGreaterThanOrEqual(2);
  });

  it('the restored database matches the source: tables, row counts and content', async () => {
    const restoredSnapshot = await snapshotDatabase(restored.adminUrl);
    expect(diffSnapshots(sourceSnapshot, restoredSnapshot)).toEqual([]);
  });

  it('the isolation audit passes on the restored database (RLS, policies, privileges kept)', async () => {
    expect(await auditIsolation(restored.adminUrl, compliantExceptions)).toEqual([]);
  });

  it('the application still works on the restored database, each tenant seeing only its rows', async () => {
    const pool = new Pool({ connectionString: restored.rwUrl, max: 2 });
    try {
      const database = createDatabaseFromPool(pool, { ownsPool: false });
      const count = (tenant: string) =>
        database.withTenant(tenant, async (tx) => {
          const result = await tx.execute<{ n: string }>(
            sql`select count(*)::text as n from app.aud_parent`,
          );
          return Number(result.rows[0]?.n);
        });
      expect(await count(A)).toBe(PER_TENANT);
      expect(await count(B)).toBe(PER_TENANT);
      expect((await pool.query('select * from app.aud_parent')).rowCount).toBe(0);
      await expect(pool.query('truncate app.aud_parent')).rejects.toMatchObject({ code: '42501' });
    } finally {
      await pool.end();
    }
  });

  it('the table owner is still subject to the policy after the restore (FORCE kept)', async () => {
    expect(await query(restored.migratorUrl, 'select * from app.aud_parent')).toHaveLength(0);
  });

  it('a truncated dump fails loudly instead of restoring partially', async () => {
    const whole = await readFile(dumpFile);
    const truncated = join(workDir, 'truncated.dump');
    await writeFile(truncated, whole.subarray(0, Math.floor(whole.length / 2)));
    const target = await createBareDatabase();
    extra.push(target);
    await expect(restoreInto(target, truncated)).rejects.toThrow(/pg_restore failed/);
  });

  it('refuses to dump with a client newer than the server (such a dump cannot be restored)', async () => {
    const newerClient: ToolRunner = {
      name: 'fake pg_dump 99',
      hostPort: () => ({ host: 'localhost', port: '5432' }),
      spawn: () =>
        spawn(process.execPath, ['-e', "console.log('pg_dump (PostgreSQL) 99.0')"], {
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
    };
    const never = join(workDir, 'never.dump');
    await expect(dumpDatabase(source.adminUrl, never, newerClient)).rejects.toThrow(
      /newer than the PostgreSQL 16 server/,
    );
    await expect(stat(never)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('a file that is not a dump is refused', async () => {
    const garbage = join(workDir, 'garbage.dump');
    await writeFile(garbage, 'this is not a PostgreSQL dump');
    const target = await createBareDatabase();
    extra.push(target);
    await expect(restoreInto(target, garbage)).rejects.toThrow(/pg_restore failed/);
  });
});

describe('the verification itself is not vacuous', () => {
  it('detects a deleted row, a same-count content change and a missing table', async () => {
    const copy = await createBareDatabase();
    extra.push(copy);
    await restoreInto(copy, dumpFile);
    const differences = async () =>
      diffSnapshots(sourceSnapshot, await snapshotDatabase(copy.adminUrl)).map(
        (difference) => `${difference.kind} ${difference.table}`,
      );
    expect(await differences()).toEqual([]);

    // One row deleted: the row count differs.
    await query(
      copy.adminUrl,
      `delete from app.aud_child where id = (select id from app.aud_child limit 1)`,
    );
    expect(await differences()).toContain('row_count app.aud_child');

    // Same row count, one value changed: only the content hash can tell.
    await query(
      copy.adminUrl,
      `update app.aud_parent set name = 'tampered' where name = 'parent-3'`,
    );
    expect(await differences()).toContain('content app.aud_parent');

    await query(copy.adminUrl, 'drop table app.aud_child');
    expect(await differences()).toContain('missing_table app.aud_child');
  });
});
