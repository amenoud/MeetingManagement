import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

export const APP_RW_ROLE = 'app_rw';
export const APP_MIGRATOR_ROLE = 'app_migrator';

const GRANTS_SQL = new URL('../../../db/bootstrap/grants.sql', import.meta.url);

// Attribute list shared by CREATE ROLE and ALTER ROLE. Never superuser, never BYPASSRLS.
const ROLE_ATTRIBUTES =
  'login nosuperuser nocreatedb nocreaterole noreplication nobypassrls noinherit';

interface Credentials {
  user: string;
  password: string;
}

function credentialsFrom(url: string, expectedUser: string): Credentials {
  const parsed = new URL(url);
  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  if (user !== expectedUser) {
    throw new Error(`The connection string for ${expectedUser} must use that role name`);
  }
  if (password === '') {
    throw new Error(`The connection string for ${expectedUser} must contain a password`);
  }
  return { user, password };
}

async function upsertRole(client: Client, { user, password }: Credentials): Promise<void> {
  const exists = await client.query('select 1 from pg_roles where rolname = $1', [user]);
  const verb = exists.rowCount === 0 ? 'create role' : 'alter role';
  const keyword = exists.rowCount === 0 ? '' : 'with ';
  // CREATE/ALTER ROLE cannot take bind parameters: format(%I, %L) quotes name and password safely.
  const built = await client.query<{ statement: string }>(
    `select format($1::text, $2::text, $3::text) as statement`,
    [`${verb} %I ${keyword}${ROLE_ATTRIBUTES} password %L`, user, password],
  );
  const statement = built.rows[0]?.statement;
  if (!statement) throw new Error('Could not build role statement');
  await client.query(statement);
}

/**
 * Creates (or updates) the runtime and migration roles and applies the privilege model.
 * Idempotent. Must be run with an administrator connection; passwords come from the two role URLs.
 */
export async function bootstrapRoles(
  adminUrl: string,
  appRwUrl: string,
  migratorUrl: string,
): Promise<void> {
  const appRw = credentialsFrom(appRwUrl, APP_RW_ROLE);
  const migrator = credentialsFrom(migratorUrl, APP_MIGRATOR_ROLE);
  const grants = await readFile(GRANTS_SQL, 'utf8');

  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query('begin');
    await upsertRole(client, migrator);
    await upsertRole(client, appRw);
    await client.query(grants);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
