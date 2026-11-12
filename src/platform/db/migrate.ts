import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

const FILE_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;
// Arbitrary constant: serializes concurrent migration runs across instances.
const LOCK_KEY = 7_240_001;

interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

async function readMigrations(dir: string): Promise<MigrationFile[]> {
  const entries = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
  const files: MigrationFile[] = [];
  for (const name of entries) {
    if (!FILE_NAME.test(name)) {
      throw new Error(`Invalid migration file name: ${name} (expected NNNN_description.sql)`);
    }
    const sql = await readFile(join(dir, name), 'utf8');
    files.push({ name, sql, checksum: createHash('sha256').update(sql).digest('hex') });
  }
  return files;
}

/**
 * Applies pending SQL migrations in name order, each in its own transaction.
 * - A migration that was already applied must still have the same checksum (never edit applied files).
 * - A recorded migration whose file disappeared is an error.
 * - Runs are serialized by an advisory lock. Returns the names applied by THIS call.
 * Connect with the app_migrator role.
 */
export async function runMigrations(connectionString: string, dir: string): Promise<string[]> {
  const files = await readMigrations(dir);
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`create table if not exists meta.schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )`);

    const recorded = await client.query<{ name: string; checksum: string }>(
      'select name, checksum from meta.schema_migrations',
    );
    const known = new Map(recorded.rows.map((row) => [row.name, row.checksum]));
    const onDisk = new Set(files.map((file) => file.name));
    for (const name of known.keys()) {
      if (!onDisk.has(name)) throw new Error(`Applied migration is missing on disk: ${name}`);
    }

    const applied: string[] = [];
    for (const file of files) {
      const previous = known.get(file.name);
      if (previous !== undefined) {
        if (previous !== file.checksum) {
          throw new Error(`Checksum mismatch for applied migration: ${file.name}`);
        }
        continue;
      }
      try {
        await client.query('begin');
        await client.query(file.sql);
        await client.query('insert into meta.schema_migrations (name, checksum) values ($1, $2)', [
          file.name,
          file.checksum,
        ]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw new Error(`Migration ${file.name} failed: ${(error as Error).message}`, {
          cause: error,
        });
      }
      applied.push(file.name);
    }
    return applied;
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}
