// What a REAL Drizzle / PostgreSQL error looks like, not my reconstruction of it (PLAN-PLT-01b).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { bindTenant, currentContext, runWithContext } from '../../src/platform/context.ts';
import { runMigrations } from '../../src/platform/db/index.ts';
import { createDatabaseFromPool } from '../../src/platform/db/with-tenant.ts';
import { toHttpError } from '../../src/platform/errors.ts';
import { createLogger } from '../../src/platform/logger.ts';
import { scrub } from '../../src/platform/redact.ts';
import { createTestDatabase, query, type TestDatabase } from '../helpers/db.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));
const A = '0197b3a2-7c1e-7f00-8000-00000000000a';
// A recognisable fake personal value that PostgreSQL will echo in its `detail`.
const VALUE = ['jean.dupont', 'example.test'].join('@');

let db: TestDatabase;
let pool: Pool;

beforeAll(async () => {
  db = await createTestDatabase();
  await runMigrations(db.migratorUrl, MIGRATIONS);
  await query(
    db.migratorUrl,
    `create table app.err_probe (
       tenant_id uuid not null default app.current_tenant_id(),
       id uuid not null,
       email text not null,
       primary key (tenant_id, id),
       unique (tenant_id, email)
     );
     select app.enable_tenant_isolation('app.err_probe');`,
  );
  pool = new Pool({ connectionString: db.rwUrl, max: 2 });
});

afterAll(async () => {
  await pool.end();
  await db.drop();
});

async function realFailure(): Promise<unknown> {
  await query(db.adminUrl, 'delete from app.err_probe'); // start from an empty table every time
  const database = createDatabaseFromPool(pool, { ownsPool: false });
  const insert = (id: string) =>
    database.withTenant(A, (tx) =>
      tx.execute(sql`insert into app.err_probe (id, email) values (${id}, ${VALUE})`),
    );
  await insert('0197b3a2-7c1e-7f00-8000-0000000000e1');
  try {
    await insert('0197b3a2-7c1e-7f00-8000-0000000000e2'); // same e-mail: unique violation
  } catch (error) {
    return error;
  }
  throw new Error('the duplicate insert should have failed');
}

describe('a real Drizzle / PostgreSQL error', () => {
  it('actually carries the value, the SQL and the parameters (the risk is real)', async () => {
    const error = (await realFailure()) as Error & { cause?: { detail?: string } };
    const everything = `${error.message} ${error.cause?.detail ?? ''}`;
    expect(everything).toContain(VALUE);
    expect(everything).toContain('insert into');
  });

  it('SPEC-000-AC18 is logged without the value, the SQL or the parameters, but with the diagnosis fields', async () => {
    const error = await realFailure();
    const lines: string[] = [];
    const log = createLogger({ destination: { write: (chunk) => void lines.push(chunk) } });
    log.error({ err: error }, 'job.failed');
    const raw = lines.join('');
    for (const leak of [VALUE, 'jean.dupont', 'insert into', 'Failed query', 'params:']) {
      expect(raw, leak).not.toContain(leak);
    }
    expect(raw).toContain('23505');
    expect(raw).toContain('err_probe');
    expect(JSON.stringify(scrub(error))).toContain('DatabaseError');
  });

  it('SPEC-000-AC18 never reaches the HTTP response', async () => {
    const error = await realFailure();
    const text = JSON.stringify(toHttpError(error, 'req-12345678').body);
    for (const leak of [VALUE, 'jean.dupont', 'insert into', 'duplicate key']) {
      expect(text, leak).not.toContain(leak);
    }
    expect(text).toContain('internal_error');
  });
});

describe('withTenant and the request context', () => {
  it('binds the tenant to the current request context, so later log lines carry it', async () => {
    const database = createDatabaseFromPool(pool, { ownsPool: false });
    const seen = await runWithContext({ requestId: 'req-12345678' }, async () => {
      const before = currentContext()?.tenantId;
      await database.withTenant(A, () => Promise.resolve());
      return { before, after: currentContext()?.tenantId };
    });
    expect(seen).toEqual({ before: undefined, after: A });
  });

  it('does nothing outside a request context (scripts, tests)', async () => {
    const database = createDatabaseFromPool(pool, { ownsPool: false });
    await expect(database.withTenant(A, () => Promise.resolve())).resolves.toBeUndefined();
    expect(() => bindTenant(A)).not.toThrow();
  });
});
