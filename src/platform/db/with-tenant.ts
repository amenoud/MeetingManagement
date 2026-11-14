import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getLogger } from '../logger.ts';

/** SQL handle valid ONLY inside the withTenant() callback that received it. */
export type TenantTransaction = NodePgDatabase;

export interface DatabaseOptions {
  /** Connection string of the runtime role app_rw. */
  connectionString: string;
  /** Maximum pool size (default 10). */
  max?: number;
  applicationName?: string;
}

export interface Database {
  /**
   * Runs `fn` in ONE transaction whose row-level-security context is `tenantId`
   * (ADR-0002). This is the only way application code reaches the database.
   * The context is transaction-scoped (`set_config(..., true)`), so it can never leak to the
   * next user of a pooled connection. Calls cannot be nested.
   */
  withTenant<T>(tenantId: string, fn: (tx: TenantTransaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const insideTenantContext = new AsyncLocalStorage<true>();

/** Returns the canonical (lowercase) tenant id, or throws. Runs before any SQL. */
export function parseTenantId(value: string): string {
  const id = typeof value === 'string' ? value.toLowerCase() : '';
  if (!UUID.test(id) || id === NIL_UUID) {
    throw new Error('Invalid tenant id: a non-nil UUID is required');
  }
  return id;
}

/** Makes a leaked handle fail loudly instead of running on a connection owned by someone else. */
function guard(tx: TenantTransaction, isActive: () => boolean): TenantTransaction {
  return new Proxy(tx, {
    get(target, property, receiver) {
      if (!isActive()) throw new Error('Transaction used outside of its withTenant() call');
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * Builds a Database on an existing pool. Exposed for tests and embedding only:
 * application code uses createDatabase().
 */
export function createDatabaseFromPool(pool: Pool, options: { ownsPool: boolean }): Database {
  return {
    async withTenant(tenantId, fn) {
      const id = parseTenantId(tenantId);
      if (insideTenantContext.getStore()) {
        throw new Error('Nested withTenant() calls are not allowed');
      }

      const client = await pool.connect();
      let evict: Error | undefined;
      let active = true;
      try {
        await client.query('begin');
        // One round trip: read the previous value (must be empty) and set the new transaction-local one.
        const probe = await client.query<{ previous: string | null }>(
          `select current_setting('app.tenant_id', true) as previous,
                  set_config('app.tenant_id', $1, true)`,
          [id],
        );
        if (probe.rows[0]?.previous) {
          // A session-level value survived on this connection: never reuse it.
          evict = new Error('Tenant context leaked on a pooled connection');
          throw evict;
        }
        const tx = guard(drizzle(client), () => active);
        const result = await insideTenantContext.run(true, () => fn(tx));
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch((rollbackError: unknown) => {
          // Cannot even roll back: the connection is in an unknown state, drop it.
          evict ??= rollbackError instanceof Error ? rollbackError : new Error('rollback failed');
        });
        throw error;
      } finally {
        active = false;
        client.release(evict);
      }
    },

    async close() {
      if (options.ownsPool) await pool.end();
    },
  };
}

export function createDatabase(options: DatabaseOptions): Database {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    application_name: options.applicationName ?? 'meetingmanagement',
  });
  // An idle client can error (server restart): log without any connection detail.
  pool.on('error', () => {
    getLogger().error('database.pool_error');
  });
  return createDatabaseFromPool(pool, { ownsPool: true });
}
