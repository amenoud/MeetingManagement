// Fingerprints a database so a restored copy can be compared with its source (PLAN-OPS-03).
import { Client } from 'pg';

export interface TableFingerprint {
  rows: number;
  /** md5 over every row rendered as text, in a stable order. */
  hash: string;
}

/** `schema.table` -> fingerprint, for every ordinary table of the schemas app and meta. */
export type Snapshot = Record<string, TableFingerprint>;

export interface Difference {
  kind: 'missing_table' | 'unexpected_table' | 'row_count' | 'content';
  table: string;
  detail: string;
}

const SCHEMAS = ['app', 'meta'];

/**
 * Needs a connection that sees ALL rows (superuser or BYPASSRLS): row-level security would
 * otherwise hide rows and make two different databases look identical.
 */
export async function snapshotDatabase(connectionString: string): Promise<Snapshot> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const who = await client.query<{ sees_all: boolean }>(
      `select rolsuper or rolbypassrls as sees_all from pg_roles where rolname = current_user`,
    );
    if (!who.rows[0]?.sees_all) {
      throw new Error(
        'snapshotDatabase needs a superuser or BYPASSRLS connection (RLS would hide rows)',
      );
    }
    const tables = await client.query<{ schema: string; name: string }>(
      `select n.nspname as schema, c.relname as name
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'p') and n.nspname = any($1)
        order by 1, 2`,
      [SCHEMAS],
    );
    const snapshot: Snapshot = {};
    for (const { schema, name } of tables.rows) {
      const quoted = `${client.escapeIdentifier(schema)}.${client.escapeIdentifier(name)}`;
      const result = await client.query<{ rows: string; hash: string }>(
        `select count(*)::text as rows,
                coalesce(md5(string_agg(t::text, E'\\n' order by t::text)), '') as hash
           from ${quoted} t`,
      );
      snapshot[`${schema}.${name}`] = {
        rows: Number(result.rows[0]?.rows),
        hash: result.rows[0]?.hash ?? '',
      };
    }
    return snapshot;
  } finally {
    await client.end();
  }
}

/** Empty array means: same tables, same row counts, same content. */
export function diffSnapshots(source: Snapshot, restored: Snapshot): Difference[] {
  const differences: Difference[] = [];
  for (const [table, expected] of Object.entries(source)) {
    const actual = restored[table];
    if (!actual) {
      differences.push({
        kind: 'missing_table',
        table,
        detail: 'absent from the restored database',
      });
    } else if (actual.rows !== expected.rows) {
      differences.push({
        kind: 'row_count',
        table,
        detail: `${expected.rows} rows expected, ${actual.rows} found`,
      });
    } else if (actual.hash !== expected.hash) {
      differences.push({ kind: 'content', table, detail: 'same row count but different content' });
    }
  }
  for (const table of Object.keys(restored)) {
    if (!(table in source)) {
      differences.push({ kind: 'unexpected_table', table, detail: 'not present in the source' });
    }
  }
  return differences;
}
