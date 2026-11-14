import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { bootstrapRoles } from '../../src/platform/db/index.ts';

// Defaults match docker-compose.yml (FAKE local development credentials, public by design).
const ADMIN_URL =
  process.env['DATABASE_ADMIN_URL'] ??
  'postgres://postgres:postgres_dev_only@127.0.0.1:5433/postgres';
const RW_URL =
  process.env['DATABASE_URL'] ??
  'postgres://app_rw:app_rw_dev_only@127.0.0.1:5433/meetingmanagement';
const MIGRATOR_URL =
  process.env['DATABASE_MIGRATOR_URL'] ??
  'postgres://app_migrator:app_migrator_dev_only@127.0.0.1:5433/meetingmanagement';

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

export interface TestDatabase {
  name: string;
  adminUrl: string;
  rwUrl: string;
  migratorUrl: string;
  drop: () => Promise<void>;
}

/** Creates a throwaway database with the roles bootstrapped, so each test file starts clean. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `mm_test_${randomBytes(6).toString('hex')}`;
  const server = new Client({ connectionString: ADMIN_URL });
  await server.connect();
  await server.query(`create database ${name}`);
  await server.end();

  const database: TestDatabase = {
    name,
    adminUrl: withDatabase(ADMIN_URL, name),
    rwUrl: withDatabase(RW_URL, name),
    migratorUrl: withDatabase(MIGRATOR_URL, name),
    drop: async () => {
      const cleanup = new Client({ connectionString: ADMIN_URL });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${name} with (force)`);
      await cleanup.end();
    },
  };
  await bootstrapRoles(database.adminUrl, database.rwUrl, database.migratorUrl);
  return database;
}

/** Runs one query on a fresh connection with the given URL and returns the rows. */
export async function query<T extends Record<string, unknown>>(
  url: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}

/** Returns the PostgreSQL error code raised by a statement, or null if it succeeded. */
export async function errorCode(url: string, sql: string): Promise<string | null> {
  try {
    await query(url, sql);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}
