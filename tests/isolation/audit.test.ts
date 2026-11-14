import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  NO_EXCEPTIONS,
  auditIsolation,
  parseExceptions,
  runMigrations,
  type Finding,
  type IsolationExceptions,
  type Rule,
} from '../../src/platform/db/index.ts';
import { createTestDatabase, query, type TestDatabase } from '../helpers/db.ts';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));
const EXCEPTIONS_FILE = fileURLToPath(
  new URL('../../db/isolation-exceptions.json', import.meta.url),
);
const COMPLIANT = fileURLToPath(new URL('./fixtures/compliant.sql', import.meta.url));
const BEHAVIOR_FIXTURE = fileURLToPath(new URL('./fixtures/isolation.sql', import.meta.url));

const REASON = 'Declared by the audit test to exercise the rule.';
const compliantExceptions: IsolationExceptions = {
  ...NO_EXCEPTIONS,
  rootTables: [{ table: 'app.aud_root', column: 'id', reason: REASON, approvedIn: 'TST-01' }],
  globalTables: [{ table: 'app.aud_global', reason: REASON, approvedIn: 'TST-01' }],
};

const withGlobal = (...tables: string[]): IsolationExceptions => ({
  ...compliantExceptions,
  globalTables: [
    ...compliantExceptions.globalTables,
    ...tables.map((table) => ({ table, reason: REASON, approvedIn: 'TST-01' })),
  ],
});

const rulesFor = (findings: Finding[], object: string): Rule[] =>
  findings
    .filter((finding) => finding.object === object)
    .map((finding) => finding.rule)
    .sort();

/** A tenant table that follows the convention, to be (mis)configured by each scenario. */
const tenantTable = (name: string, extra = ''): string => `
  create table app.${name} (
    tenant_id uuid not null default app.current_tenant_id(),
    id uuid not null${extra},
    primary key (tenant_id, id)
  );`;
const protect = (name: string): string => `select app.enable_tenant_isolation('app.${name}');`;
const POLICY = `using (tenant_id = app.current_tenant_id()) with check (tenant_id = app.current_tenant_id())`;

interface Scenario {
  name: string;
  setup: string;
  cleanup: string;
  expected: Record<string, Rule[]>;
  exceptions?: IsolationExceptions;
}

const scenarios: Scenario[] = [
  {
    name: 'R1: tenant_id without row level security',
    setup: tenantTable('s_a'),
    cleanup: 'drop table app.s_a',
    expected: { 'app.s_a': ['R1_POLICY_MISSING', 'R1_RLS_NOT_ENABLED', 'R1_RLS_NOT_FORCED'] },
  },
  {
    name: 'R1: row level security enabled but not forced',
    setup: `${tenantTable('s_a')}
      alter table app.s_a enable row level security;
      create policy tenant_isolation on app.s_a ${POLICY};`,
    cleanup: 'drop table app.s_a',
    expected: { 'app.s_a': ['R1_RLS_NOT_FORCED'] },
  },
  {
    name: 'R1: policy that lets everything through',
    setup: `${tenantTable('s_a')}
      alter table app.s_a enable row level security;
      alter table app.s_a force row level security;
      create policy tenant_isolation on app.s_a using (true) with check (true);`,
    cleanup: 'drop table app.s_a',
    expected: { 'app.s_a': ['R1_POLICY_EXPRESSION'] },
  },
  {
    name: 'R1: a second permissive policy widens access',
    setup: `${tenantTable('s_a')} ${protect('s_a')}
      create policy extra on app.s_a using (true);`,
    cleanup: 'drop table app.s_a',
    expected: { 'app.s_a': ['R1_POLICY_EXTRA_PERMISSIVE'] },
  },
  {
    name: 'R1: policy limited to one role instead of everyone',
    setup: `${tenantTable('s_a')} ${protect('s_a')}
      drop policy tenant_isolation on app.s_a;
      create policy tenant_isolation on app.s_a for all to app_rw ${POLICY};`,
    cleanup: 'drop table app.s_a',
    expected: { 'app.s_a': ['R1_POLICY_SCOPE'] },
  },
  {
    name: 'R1: tenant_id of the wrong type',
    setup: `create table app.s_a (tenant_id text not null, id uuid not null, primary key (tenant_id, id));
      alter table app.s_a enable row level security;
      alter table app.s_a force row level security;`,
    cleanup: 'drop table app.s_a',
    expected: { 'app.s_a': ['R1_POLICY_MISSING', 'R1_TENANT_COLUMN'] },
  },
  {
    name: 'R1: nullable tenant_id',
    setup: `create table app.s_a (tenant_id uuid, id uuid, unique (tenant_id, id));
      alter table app.s_a enable row level security;
      alter table app.s_a force row level security;
      create policy tenant_isolation on app.s_a ${POLICY};`,
    cleanup: 'drop table app.s_a',
    expected: { 'app.s_a': ['R1_TENANT_COLUMN'] },
  },
  {
    name: 'R3: table without tenant_id that is not declared global',
    setup: 'create table app.s_b (id uuid primary key);',
    cleanup: 'drop table app.s_b',
    expected: { 'app.s_b': ['R3_UNCLASSIFIED'] },
  },
  {
    name: 'R4: single-column foreign key between tenant tables (and the unique key it needs)',
    setup: `${tenantTable('s_p', ', unique (id)')} ${protect('s_p')}
      ${tenantTable('s_c', ', parent_id uuid not null references app.s_p (id)')} ${protect('s_c')}`,
    cleanup: 'drop table app.s_c, app.s_p',
    expected: { 'app.s_p': ['R5_UNIQUE_WITHOUT_TENANT'], 'app.s_c': ['R4_FK_NOT_COMPOSITE'] },
  },
  {
    name: 'R4: a global table must not reference a tenant table',
    setup: `create table app.s_g (t uuid not null, p uuid not null,
        foreign key (t, p) references app.aud_parent (tenant_id, id));`,
    cleanup: 'drop table app.s_g',
    exceptions: withGlobal('app.s_g'),
    expected: { 'app.s_g': ['R4_GLOBAL_REFERENCES_TENANT'] },
  },
  {
    name: 'R5: unique constraint without tenant_id',
    setup: `${tenantTable('s_u', ', name text unique')} ${protect('s_u')}`,
    cleanup: 'drop table app.s_u',
    expected: { 'app.s_u': ['R5_UNIQUE_WITHOUT_TENANT'] },
  },
  {
    name: 'R6: no index starting with tenant_id',
    setup: `create table app.s_i (
        tenant_id uuid not null default app.current_tenant_id(), id uuid not null, primary key (id, tenant_id));
      ${protect('s_i')}`,
    cleanup: 'drop table app.s_i',
    expected: { 'app.s_i': ['R6_NO_TENANT_INDEX'] },
  },
  {
    name: 'R7: view that runs with its owner rights',
    setup: 'create view app.s_v as select * from app.aud_parent;',
    cleanup: 'drop view app.s_v',
    expected: { 'app.s_v': ['R7_VIEW_NOT_INVOKER'] },
  },
  {
    name: 'R7: materialized view',
    setup: 'create materialized view app.s_m as select 1 as x;',
    cleanup: 'drop materialized view app.s_m',
    expected: { 'app.s_m': ['R7_MATERIALIZED_VIEW'] },
  },
  {
    name: 'R8: SECURITY DEFINER function',
    setup: `create function app.s_fn() returns int language sql security definer as 'select 1';`,
    cleanup: 'drop function app.s_fn()',
    expected: { 'app.s_fn()': ['R8_SECURITY_DEFINER'] },
  },
  {
    name: 'R9: app_rw granted TRUNCATE',
    setup: 'grant truncate on app.aud_child to app_rw;',
    cleanup: 'revoke truncate on app.aud_child from app_rw',
    expected: { 'app.aud_child': ['R9_FORBIDDEN_PRIVILEGE'] },
  },
  {
    name: 'R9: PUBLIC granted access',
    setup: 'grant select on app.aud_child to public;',
    cleanup: 'revoke select on app.aud_child from public',
    expected: { 'app.aud_child': ['R9_PUBLIC_PRIVILEGE'] },
  },
  {
    name: 'R9: app_rw granted access to the migration bookkeeping',
    setup: 'grant select on meta.schema_migrations to app_rw;',
    cleanup: 'revoke select on meta.schema_migrations from app_rw',
    expected: { 'meta.schema_migrations': ['R9_FORBIDDEN_PRIVILEGE'] },
  },
  {
    name: 'R10: table in the public schema',
    setup: 'create table public.s_stray (id int);',
    cleanup: 'drop table public.s_stray',
    expected: { 'public.s_stray': ['R10_UNEXPECTED_SCHEMA'] },
  },
  {
    name: 'R10: table in an unexpected schema',
    setup: 'create schema s_extra; create table s_extra.t (id int);',
    cleanup: 'drop schema s_extra cascade',
    expected: { 's_extra.t': ['R10_UNEXPECTED_SCHEMA'] },
  },
];

let db: TestDatabase;
const extraDatabases: TestDatabase[] = [];

beforeAll(async () => {
  db = await createTestDatabase();
  await runMigrations(db.migratorUrl, MIGRATIONS);
  await query(db.adminUrl, await readFile(COMPLIANT, 'utf8'));
});

afterAll(async () => {
  await db.drop();
  await Promise.all(extraDatabases.map((extra) => extra.drop()));
});

describe('SPEC-000-AC13 isolation audit: what must pass', () => {
  it('the production schema (real migrations only) has no finding', async () => {
    const real = await createTestDatabase();
    extraDatabases.push(real);
    await runMigrations(real.migratorUrl, MIGRATIONS);
    const exceptions = parseExceptions(JSON.parse(await readFile(EXCEPTIONS_FILE, 'utf8')));
    expect(await auditIsolation(real.adminUrl, exceptions)).toEqual([]);
  });

  it('a set of tables following every convention has no finding', async () => {
    expect(await auditIsolation(db.adminUrl, compliantExceptions)).toEqual([]);
  });

  it('the negative controls of the behaviour suite are flagged, and only them', async () => {
    const behaviour = await createTestDatabase();
    extraDatabases.push(behaviour);
    await runMigrations(behaviour.migratorUrl, MIGRATIONS);
    await query(behaviour.adminUrl, await readFile(BEHAVIOR_FIXTURE, 'utf8'));
    const findings = await auditIsolation(behaviour.adminUrl, {
      ...NO_EXCEPTIONS,
      rootTables: [
        { table: 'app.iso_tenant_like', column: 'id', reason: REASON, approvedIn: 'TST-01' },
      ],
    });
    const flagged = [...new Set(findings.map((finding) => finding.object))].sort();
    expect(flagged).toEqual(['app.iso_child_naive', 'app.iso_parent_naive']);
    expect(rulesFor(findings, 'app.iso_child_naive')).toEqual([
      'R4_FK_NOT_COMPOSITE',
      'R5_UNIQUE_WITHOUT_TENANT',
      'R6_NO_TENANT_INDEX',
    ]);
  });
});

describe('SPEC-000-AC13 isolation audit: what must fail, one rule at a time', () => {
  for (const scenario of scenarios) {
    it(scenario.name, async () => {
      await query(db.adminUrl, scenario.setup);
      try {
        const findings = await auditIsolation(
          db.adminUrl,
          scenario.exceptions ?? compliantExceptions,
        );
        for (const [object, rules] of Object.entries(scenario.expected)) {
          expect(rulesFor(findings, object), object).toEqual(rules);
        }
        const unrelated = findings.filter((finding) => !(finding.object in scenario.expected));
        expect(unrelated, 'no collateral finding on compliant objects').toEqual([]);
      } finally {
        await query(db.adminUrl, scenario.cleanup);
      }
    });
  }
});

describe('exceptions list', () => {
  it('reports stale entries (nothing matches them)', async () => {
    const findings = await auditIsolation(db.adminUrl, {
      globalTables: [
        ...compliantExceptions.globalTables,
        { table: 'app.gone', reason: REASON, approvedIn: 'x' },
      ],
      rootTables: [
        ...compliantExceptions.rootTables,
        { table: 'app.gone_root', column: 'id', reason: REASON, approvedIn: 'x' },
      ],
      securityDefinerFunctions: [{ name: 'app.gone()', reason: REASON, approvedIn: 'x' }],
      materializedViews: [{ table: 'app.gone_mv', reason: REASON, approvedIn: 'x' }],
    });
    expect(findings.map((finding) => `${finding.rule} ${finding.object}`).sort()).toEqual([
      'EXC_STALE app.gone',
      'EXC_STALE app.gone()',
      'EXC_STALE app.gone_mv',
      'EXC_STALE app.gone_root',
    ]);
  });

  it('refuses a "global" table that has a tenant_id column', async () => {
    await query(db.adminUrl, 'create table app.s_gt (tenant_id uuid not null, id uuid);');
    try {
      const findings = await auditIsolation(db.adminUrl, withGlobal('app.s_gt'));
      expect(rulesFor(findings, 'app.s_gt')).toContain('EXC_GLOBAL_HAS_TENANT_ID');
    } finally {
      await query(db.adminUrl, 'drop table app.s_gt');
    }
  });

  it('refuses entries without a real reason or approval, and unknown keys', () => {
    const entry = (override: object) => ({
      ...NO_EXCEPTIONS,
      globalTables: [{ table: 'app.t', reason: REASON, approvedIn: 'ID-01', ...override }],
    });
    expect(() => parseExceptions(entry({ reason: 'because' }))).toThrow(/reason/);
    expect(() => parseExceptions(entry({ approvedIn: '' }))).toThrow(/approvedIn/);
    expect(() => parseExceptions({ ...NO_EXCEPTIONS, extra: [] })).toThrow(
      /Invalid isolation exceptions/,
    );
    expect(() => parseExceptions(entry({}))).not.toThrow();
  });

  it('the committed exceptions file is valid', async () => {
    const parsed = parseExceptions(JSON.parse(await readFile(EXCEPTIONS_FILE, 'utf8')));
    expect(parsed).toBeDefined();
  });
});
