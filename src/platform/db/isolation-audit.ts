// Mechanical check of the tenant-isolation conventions (PLAN-TST-01, ADR-0002).
// Reads the PostgreSQL catalog of a migrated database and reports every deviation.
// Read-only: needs an administrator-like connection able to read the catalog.
import { Client } from 'pg';
import { z } from 'zod';

const reason = z.string().min(20, 'reason must explain the exception (20+ characters)');
const approvedIn = z.string().min(1);

const exceptionsSchema = z.object({
  globalTables: z.array(z.object({ table: z.string(), reason, approvedIn })),
  rootTables: z.array(z.object({ table: z.string(), column: z.string(), reason, approvedIn })),
  securityDefinerFunctions: z.array(z.object({ name: z.string(), reason, approvedIn })),
  materializedViews: z.array(z.object({ table: z.string(), reason, approvedIn })),
});

export type IsolationExceptions = z.infer<typeof exceptionsSchema>;

export const NO_EXCEPTIONS: IsolationExceptions = {
  globalTables: [],
  rootTables: [],
  securityDefinerFunctions: [],
  materializedViews: [],
};

/** Validates the content of db/isolation-exceptions.json. Throws with the offending paths. */
export function parseExceptions(value: unknown): IsolationExceptions {
  const result = exceptionsSchema.strict().safeParse(value);
  if (!result.success) {
    const where = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid isolation exceptions: ${where}`);
  }
  return result.data;
}

export type Rule =
  | 'R1_TENANT_COLUMN'
  | 'R1_RLS_NOT_ENABLED'
  | 'R1_RLS_NOT_FORCED'
  | 'R1_POLICY_MISSING'
  | 'R1_POLICY_EXPRESSION'
  | 'R1_POLICY_SCOPE'
  | 'R1_POLICY_EXTRA_PERMISSIVE'
  | 'R3_UNCLASSIFIED'
  | 'R4_FK_NOT_COMPOSITE'
  | 'R4_GLOBAL_REFERENCES_TENANT'
  | 'R5_UNIQUE_WITHOUT_TENANT'
  | 'R6_NO_TENANT_INDEX'
  | 'R7_VIEW_NOT_INVOKER'
  | 'R7_MATERIALIZED_VIEW'
  | 'R7_UNSUPPORTED_KIND'
  | 'R8_SECURITY_DEFINER'
  | 'R9_FORBIDDEN_PRIVILEGE'
  | 'R9_PUBLIC_PRIVILEGE'
  | 'R10_UNEXPECTED_SCHEMA'
  | 'EXC_STALE'
  | 'EXC_GLOBAL_HAS_TENANT_ID';

export interface Finding {
  rule: Rule;
  /** schema.table (or schema.function) the finding is about. */
  object: string;
  detail: string;
}

const TENANT_COLUMN = 'tenant_id';
const APP_SCHEMA = 'app';
const ALLOWED_SCHEMAS = new Set(['app', 'meta']);
const POLICY_NAME = 'tenant_isolation';
const FORBIDDEN_RW_PRIVILEGES = ['TRUNCATE', 'REFERENCES', 'TRIGGER'];

interface Relation {
  oid: number;
  schema: string;
  name: string;
  kind: string;
  rls: boolean;
  forced: boolean;
  options: string[] | null;
  full: string;
}

interface Column {
  relid: number;
  num: number;
  name: string;
  type: string;
  notNull: boolean;
}

const normalize = (expression: string | null): string => (expression ?? '').replace(/\s+/g, '');

export async function auditIsolation(
  connectionString: string,
  exceptions: IsolationExceptions = NO_EXCEPTIONS,
): Promise<Finding[]> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    // Make pg_get_expr print schema-qualified names whatever the connection defaults are.
    await client.query('set search_path = pg_catalog');
    return await run(client, exceptions);
  } finally {
    await client.end();
  }
}

async function run(client: Client, exceptions: IsolationExceptions): Promise<Finding[]> {
  const findings: Finding[] = [];
  const add = (rule: Rule, object: string, detail: string): void => {
    findings.push({ rule, object, detail });
  };

  const relations = (
    await client.query<{
      oid: number;
      schema: string;
      name: string;
      kind: string;
      rls: boolean;
      forced: boolean;
      options: string[] | null;
    }>(
      `select c.oid::int as oid, n.nspname as schema, c.relname as name, c.relkind as kind,
              c.relrowsecurity as rls, c.relforcerowsecurity as forced, c.reloptions as options
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
          and c.relkind in ('r', 'p', 'v', 'm', 'f')
        order by n.nspname, c.relname`,
    )
  ).rows.map((row): Relation => ({ ...row, full: `${row.schema}.${row.name}` }));

  const columns = (
    await client.query<Column & { relid: number }>(
      `select a.attrelid::int as "relid", a.attnum::int as num, a.attname as name,
              format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as "notNull"
         from pg_attribute a join pg_class c on c.oid = a.attrelid
         join pg_namespace n on n.oid = c.relnamespace
        where a.attnum > 0 and not a.attisdropped and n.nspname = $1`,
      [APP_SCHEMA],
    )
  ).rows;
  const columnsOf = (relation: Relation): Column[] =>
    columns.filter((column) => column.relid === relation.oid);
  const columnNamed = (relation: Relation, name: string): Column | undefined =>
    columnsOf(relation).find((column) => column.name === name);
  const nameOf = (relid: number, num: number): string | undefined =>
    columns.find((column) => column.relid === relid && column.num === num)?.name;

  const rolesExist =
    (await client.query(`select 1 from pg_roles where rolname = 'app_rw'`)).rowCount === 1;

  // R10: nothing outside the known schemas.
  for (const relation of relations) {
    if (!ALLOWED_SCHEMAS.has(relation.schema)) {
      add('R10_UNEXPECTED_SCHEMA', relation.full, `relation outside schemas app/meta`);
    }
  }

  const inApp = relations.filter((relation) => relation.schema === APP_SCHEMA);
  const tables = inApp.filter((relation) => ['r', 'p'].includes(relation.kind));
  const globalNames = new Set(exceptions.globalTables.map((entry) => entry.table));
  const rootByName = new Map(exceptions.rootTables.map((entry) => [entry.table, entry.column]));

  // Classification: tenant table / root table / declared global table / unclassified.
  const isTenantTable = (relation: Relation): boolean =>
    columnNamed(relation, TENANT_COLUMN) !== undefined && !rootByName.has(relation.full);
  const kindOf = (relation: Relation): 'tenant' | 'root' | 'global' | 'none' => {
    if (rootByName.has(relation.full)) return 'root';
    if (columnNamed(relation, TENANT_COLUMN)) return 'tenant';
    if (globalNames.has(relation.full)) return 'global';
    return 'none';
  };

  // Stale or contradictory exceptions.
  const tableNames = new Set(tables.map((relation) => relation.full));
  for (const entry of exceptions.globalTables) {
    const relation = tables.find((candidate) => candidate.full === entry.table);
    if (!relation) add('EXC_STALE', entry.table, 'global table exception matches no table');
    else if (columnNamed(relation, TENANT_COLUMN)) {
      add('EXC_GLOBAL_HAS_TENANT_ID', entry.table, 'a global table must not have tenant_id');
    }
  }
  for (const entry of exceptions.rootTables) {
    if (!tableNames.has(entry.table)) {
      add('EXC_STALE', entry.table, 'root table exception matches no table');
    }
  }
  for (const entry of exceptions.materializedViews) {
    if (!inApp.some((relation) => relation.kind === 'm' && relation.full === entry.table)) {
      add('EXC_STALE', entry.table, 'materialized view exception matches no view');
    }
  }

  const policies = (
    await client.query<{
      relid: number;
      name: string;
      cmd: string;
      permissive: boolean;
      roles: string;
      qual: string | null;
      check: string | null;
    }>(
      `select p.polrelid::int as relid, p.polname as name, p.polcmd as cmd, p.polpermissive as permissive,
              p.polroles::text as roles, pg_get_expr(p.polqual, p.polrelid) as qual,
              pg_get_expr(p.polwithcheck, p.polrelid) as "check"
         from pg_policy p`,
    )
  ).rows;

  // R1 / R2: isolation of tenant tables and root tables.
  for (const relation of tables) {
    const kind = kindOf(relation);
    if (kind === 'none') {
      add(
        'R3_UNCLASSIFIED',
        relation.full,
        'no tenant_id column and not declared in db/isolation-exceptions.json',
      );
      continue;
    }
    if (kind === 'global') continue;
    const columnName = kind === 'root' ? (rootByName.get(relation.full) as string) : TENANT_COLUMN;
    const column = columnNamed(relation, columnName);
    if (!column || column.type !== 'uuid' || !column.notNull) {
      add('R1_TENANT_COLUMN', relation.full, `${columnName} must exist and be uuid NOT NULL`);
    }
    if (!relation.rls)
      add('R1_RLS_NOT_ENABLED', relation.full, 'row level security is not enabled');
    if (!relation.forced)
      add('R1_RLS_NOT_FORCED', relation.full, 'row level security is not forced');

    const own = policies.filter((policy) => policy.relid === relation.oid);
    const main = own.find((policy) => policy.name === POLICY_NAME);
    if (!main) {
      add('R1_POLICY_MISSING', relation.full, `policy ${POLICY_NAME} is missing`);
    } else {
      const expected = normalize(`(${columnName} = app.current_tenant_id())`);
      if (normalize(main.qual) !== expected || normalize(main.check) !== expected) {
        add(
          'R1_POLICY_EXPRESSION',
          relation.full,
          `USING / WITH CHECK must both be (${columnName} = app.current_tenant_id())`,
        );
      }
      if (main.cmd !== '*' || main.roles !== '{0}' || !main.permissive) {
        add(
          'R1_POLICY_SCOPE',
          relation.full,
          'policy must be permissive, for ALL commands and for PUBLIC',
        );
      }
    }
    for (const policy of own) {
      if (policy.name !== POLICY_NAME && policy.permissive) {
        add(
          'R1_POLICY_EXTRA_PERMISSIVE',
          relation.full,
          `permissive policy ${policy.name} widens access`,
        );
      }
    }
  }

  // R4: foreign keys.
  const foreignKeys = (
    await client.query<{ from: number; to: number; keys: number[]; refs: number[]; name: string }>(
      `select conrelid::int as "from", confrelid::int as "to", conkey::int[] as keys,
              confkey::int[] as refs, conname as name
         from pg_constraint where contype = 'f'`,
    )
  ).rows;
  for (const fk of foreignKeys) {
    const source = tables.find((relation) => relation.oid === fk.from);
    const target = tables.find((relation) => relation.oid === fk.to);
    if (!source || !target) continue;
    const sourceKind = kindOf(source);
    const targetKind = kindOf(target);
    if (sourceKind === 'global' && targetKind === 'tenant') {
      add(
        'R4_GLOBAL_REFERENCES_TENANT',
        source.full,
        `${fk.name} points to tenant table ${target.full}`,
      );
    }
    if (sourceKind === 'tenant' && targetKind === 'tenant') {
      const pairs = fk.keys.map((key, index) => [
        nameOf(fk.from, key),
        nameOf(fk.to, fk.refs[index] as number),
      ]);
      const composite = pairs.some(([a, b]) => a === TENANT_COLUMN && b === TENANT_COLUMN);
      if (!composite) {
        add(
          'R4_FK_NOT_COMPOSITE',
          source.full,
          `${fk.name} to ${target.full} must include tenant_id on both sides`,
        );
      }
    }
  }

  // R5 / R6: indexes of tenant tables.
  const indexes = (
    await client.query<{
      relid: number;
      unique: boolean;
      keys: number[];
      def: string;
      name: string;
    }>(
      `select i.indrelid::int as relid, i.indisunique as "unique", i.indkey::int[] as keys,
              pg_get_indexdef(i.indexrelid) as def, c.relname as name
         from pg_index i join pg_class c on c.oid = i.indexrelid`,
    )
  ).rows;
  for (const relation of tables.filter(isTenantTable)) {
    const own = indexes.filter((index) => index.relid === relation.oid);
    const tenantNum = columnNamed(relation, TENANT_COLUMN)?.num;
    for (const index of own.filter((candidate) => candidate.unique)) {
      const covers =
        index.keys.includes(tenantNum as number) ||
        (index.keys.includes(0) && index.def.includes(TENANT_COLUMN));
      if (!covers) {
        add(
          'R5_UNIQUE_WITHOUT_TENANT',
          relation.full,
          `unique index ${index.name} must include tenant_id`,
        );
      }
    }
    if (!own.some((index) => index.keys[0] === tenantNum)) {
      add('R6_NO_TENANT_INDEX', relation.full, 'no index starts with tenant_id');
    }
  }

  // R7: views.
  for (const relation of inApp) {
    if (relation.kind === 'v' && !(relation.options ?? []).includes('security_invoker=true')) {
      add(
        'R7_VIEW_NOT_INVOKER',
        relation.full,
        'view must be created WITH (security_invoker = true)',
      );
    }
    if (
      relation.kind === 'm' &&
      !exceptions.materializedViews.some((entry) => entry.table === relation.full)
    ) {
      add('R7_MATERIALIZED_VIEW', relation.full, 'materialized views have no row level security');
    }
    if (relation.kind === 'f')
      add('R7_UNSUPPORTED_KIND', relation.full, 'foreign tables are not supported');
  }

  // R8: SECURITY DEFINER functions.
  const definers = (
    await client.query<{ name: string }>(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as name
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = $1 and p.prosecdef`,
      [APP_SCHEMA],
    )
  ).rows;
  for (const definer of definers) {
    const full = `${APP_SCHEMA}.${definer.name}`;
    if (!exceptions.securityDefinerFunctions.some((entry) => entry.name === full)) {
      add('R8_SECURITY_DEFINER', full, 'SECURITY DEFINER function runs with its owner rights');
    }
  }
  for (const entry of exceptions.securityDefinerFunctions) {
    if (!definers.some((definer) => `${APP_SCHEMA}.${definer.name}` === entry.name)) {
      add('EXC_STALE', entry.name, 'SECURITY DEFINER exception matches no function');
    }
  }

  // R9: privileges. PUBLIC never; app_rw never TRUNCATE/REFERENCES/TRIGGER (nothing at all on meta).
  const publicGrants = (
    await client.query<{ relid: number }>(
      `select c.oid::int as relid from pg_class c, aclexplode(c.relacl) a
        where a.grantee = 0 and c.relkind in ('r', 'p', 'v', 'm')`,
    )
  ).rows;
  for (const relation of relations.filter((candidate) => ALLOWED_SCHEMAS.has(candidate.schema))) {
    if (publicGrants.some((grant) => grant.relid === relation.oid)) {
      add('R9_PUBLIC_PRIVILEGE', relation.full, 'PUBLIC has privileges on this relation');
    }
    if (!rolesExist) continue;
    const forbidden =
      relation.schema === 'meta'
        ? ['SELECT', 'INSERT', 'UPDATE', 'DELETE', ...FORBIDDEN_RW_PRIVILEGES]
        : FORBIDDEN_RW_PRIVILEGES;
    for (const privilege of forbidden) {
      const has = await client.query<{ has: boolean }>(
        `select has_table_privilege('app_rw', $1::oid, $2) as has`,
        [relation.oid, privilege],
      );
      if (has.rows[0]?.has) {
        add('R9_FORBIDDEN_PRIVILEGE', relation.full, `app_rw must not have ${privilege}`);
      }
    }
  }

  return findings.sort((a, b) => `${a.object}|${a.rule}`.localeCompare(`${b.object}|${b.rule}`));
}
