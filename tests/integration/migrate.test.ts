import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../../src/platform/db/index.ts';
import { createTestDatabase, query, type TestDatabase } from '../helpers/db.ts';

let db: TestDatabase;
const dirs: string[] = [];

async function migrationsDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mm-migrations-'));
  dirs.push(dir);
  for (const [name, sql] of Object.entries(files)) await writeFile(join(dir, name), sql);
  return dir;
}

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('migration runner', () => {
  it('applies pending migrations in order, then is idempotent', async () => {
    const dir = await migrationsDir({
      '0002_second.sql': 'create table app.m_second (id int);',
      '0001_first.sql': 'create table app.m_first (id int);',
    });
    expect(await runMigrations(db.migratorUrl, dir)).toEqual(['0001_first.sql', '0002_second.sql']);
    expect(await runMigrations(db.migratorUrl, dir)).toEqual([]);
    const rows = await query<{ name: string }>(
      db.adminUrl,
      'select name from meta.schema_migrations order by name',
    );
    expect(rows.map((row) => row.name)).toEqual(['0001_first.sql', '0002_second.sql']);
  });

  it('refuses a migration file whose checksum changed after it was applied', async () => {
    const dir = await migrationsDir({
      '0001_first.sql': 'create table app.m_changed (id int);',
      '0002_second.sql': 'create table app.m_second (id int);',
    });
    await expect(runMigrations(db.migratorUrl, dir)).rejects.toThrow(/Checksum mismatch/);
  });

  it('refuses when an applied migration disappeared from disk', async () => {
    const dir = await migrationsDir({ '0001_first.sql': 'create table app.m_first (id int);' });
    await expect(runMigrations(db.migratorUrl, dir)).rejects.toThrow(/missing on disk/);
  });

  it('rejects badly named migration files', async () => {
    const dir = await migrationsDir({ 'create_table.sql': 'select 1;' });
    await expect(runMigrations(db.migratorUrl, dir)).rejects.toThrow(/Invalid migration file name/);
  });

  it('rolls back a failing migration and does not record it', async () => {
    const other = await createTestDatabase();
    try {
      const dir = await migrationsDir({
        '0001_bad.sql': 'create table app.m_partial (id int); select no_such_function();',
      });
      await expect(runMigrations(other.migratorUrl, dir)).rejects.toThrow(/0001_bad.sql failed/);
      const tables = await query<{ n: string }>(
        other.adminUrl,
        `select count(*)::text as n from pg_tables where tablename = 'm_partial'`,
      );
      expect(tables[0]?.n).toBe('0');
      const recorded = await query<{ n: string }>(
        other.adminUrl,
        'select count(*)::text as n from meta.schema_migrations',
      );
      expect(recorded[0]?.n).toBe('0');
    } finally {
      await other.drop();
    }
  });

  it('serializes concurrent runners: a migration is applied exactly once', async () => {
    const other = await createTestDatabase();
    try {
      const dir = await migrationsDir({
        '0001_slow.sql': 'select pg_sleep(0.5); create table app.m_slow (id int);',
      });
      const [a, b] = await Promise.all([
        runMigrations(other.migratorUrl, dir),
        runMigrations(other.migratorUrl, dir),
      ]);
      expect([...a, ...b]).toEqual(['0001_slow.sql']);
    } finally {
      await other.drop();
    }
  });
});
