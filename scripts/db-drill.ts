// Disaster-recovery drill (PLAN-OPS-03): the database server is destroyed and rebuilt from a dump.
// 1. throwaway server A: roles, migrations, tables, data of two tenants  -> fingerprint + dump
// 2. server A is DELETED
// 3. throwaway server B (empty): roles only -> restore -> privileges -> verify
// Needs Docker. Touches nothing of the development database. Usage: pnpm db:drill
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import {
  auditIsolation,
  bootstrapRoles,
  containerRunner,
  createDatabase,
  diffSnapshots,
  dumpDatabase,
  restoreDatabase,
  runMigrations,
  snapshotDatabase,
} from '../src/platform/db/index.ts';
import { compliantExceptions } from '../tests/helpers/exceptions.ts';

const IMAGE = 'postgres:16-alpine';
const PASSWORD = 'drill_only_password';
const DB = 'meetingmanagement';
const TENANTS = ['0197b3a2-7c1e-7f00-8000-00000000000a', '0197b3a2-7c1e-7f00-8000-00000000000b'];
const PARENTS_PER_TENANT = 20_000;
const MIGRATIONS = fileURLToPath(new URL('../db/migrations', import.meta.url));
const FIXTURE = fileURLToPath(
  new URL('../tests/isolation/fixtures/compliant.sql', import.meta.url),
);

const docker = (...args: string[]): string =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const timings: [string, number][] = [];
async function timed<T>(label: string, work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await work();
  } finally {
    timings.push([label, (performance.now() - start) / 1000]);
  }
}

interface Server {
  container: string;
  port: string;
  url: (user: string, password: string, database?: string) => string;
}

async function startServer(label: string): Promise<Server> {
  const container = `mm-drill-${label}-${randomBytes(3).toString('hex')}`;
  docker(
    'run',
    '-d',
    '--rm',
    '--name',
    container,
    '-e',
    `POSTGRES_PASSWORD=${PASSWORD}`,
    '-p',
    '127.0.0.1::5432',
    IMAGE,
  );
  const port = docker('port', container, '5432/tcp').split(':').pop() as string;
  const server: Server = {
    container,
    port,
    url: (user, password, database = 'postgres') =>
      `postgres://${user}:${password}@127.0.0.1:${port}/${database}`,
  };
  for (let attempt = 0; attempt < 60; attempt++) {
    const client = new Client({ connectionString: server.url('postgres', PASSWORD) });
    try {
      await client.connect();
      await client.end();
      return server;
    } catch {
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`Server ${container} did not become ready`);
}

const roleUrls = (server: Server) => ({
  admin: server.url('postgres', PASSWORD, DB),
  rw: server.url('app_rw', 'drill_rw_password', DB),
  migrator: server.url('app_migrator', 'drill_migrator_password', DB),
});

async function sqlOn(url: string, statement: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

const containers: string[] = [];
let workDir = '';

try {
  workDir = await mkdtemp(join(tmpdir(), 'mm-drill-'));
  const dumpFile = join(workDir, 'meetingmanagement.dump');

  // --- Server A: build a database that looks used ---
  const a = await timed('start server A', () => startServer('src'));
  containers.push(a.container);
  const ua = roleUrls(a);
  await sqlOn(a.url('postgres', PASSWORD), `create database ${DB}`);
  await bootstrapRoles(ua.admin, ua.rw, ua.migrator);
  await runMigrations(ua.migrator, MIGRATIONS);
  await sqlOn(ua.migrator, await readFile(FIXTURE, 'utf8'));
  const app = createDatabase({ connectionString: ua.rw, max: 2 });
  await timed(`load data (${PARENTS_PER_TENANT * 2} parents + as many children)`, async () => {
    for (const tenant of TENANTS) {
      await app.withTenant(tenant, async (tx) => {
        await tx.execute(sql`insert into app.aud_root (id, name) values (${tenant}, 'Org')`);
        await tx.execute(sql`insert into app.aud_parent (id, name)
          select gen_random_uuid(), 'parent-' || g from generate_series(1, ${PARENTS_PER_TENANT}) g`);
        await tx.execute(sql`insert into app.aud_child (id, parent_id)
          select gen_random_uuid(), id from app.aud_parent`);
      });
    }
  });
  await app.close();
  const before = await snapshotDatabase(ua.admin);

  const backupSeconds = await timed('BACKUP (pg_dump)', () =>
    dumpDatabase(ua.admin, dumpFile, containerRunner(a.container)),
  );
  void backupSeconds;
  const { size } = await stat(dumpFile);

  // --- The server disappears ---
  docker('rm', '-f', a.container);
  containers.splice(containers.indexOf(a.container), 1);
  console.info(`\nServer A destroyed. Dump kept: ${(size / 1024 / 1024).toFixed(1)} MB.\n`);

  // --- Server B: new, empty: the runbook, step by step ---
  const recoveryStart = performance.now();
  const b = await timed('1. start an EMPTY server B', () => startServer('dst'));
  containers.push(b.container);
  const ub = roleUrls(b);
  await timed('2. create database + roles only (db:bootstrap --roles-only)', async () => {
    await sqlOn(b.url('postgres', PASSWORD), `create database ${DB}`);
    await bootstrapRoles(ub.admin, ub.rw, ub.migrator, { privileges: false });
  });
  await timed('3. RESTORE (pg_restore)', () =>
    restoreDatabase(ub.admin, dumpFile, containerRunner(b.container)),
  );
  await timed('4. privileges and role settings (db:bootstrap)', () =>
    bootstrapRoles(ub.admin, ub.rw, ub.migrator),
  );

  const after = await timed('5. verify data (row counts + content hashes)', () =>
    snapshotDatabase(ub.admin),
  );
  const differences = diffSnapshots(before, after);
  const findings = await timed('6. isolation audit (db:audit)', () =>
    auditIsolation(ub.admin, compliantExceptions),
  );
  const functional = await timed('7. application check (app_rw + withTenant)', async () => {
    const restored = createDatabase({ connectionString: ub.rw, max: 2 });
    try {
      const counts: number[] = [];
      for (const tenant of TENANTS) {
        counts.push(
          await restored.withTenant(tenant, async (tx) => {
            const result = await tx.execute<{ n: string }>(
              sql`select count(*)::text as n from app.aud_parent`,
            );
            return Number(result.rows[0]?.n);
          }),
        );
      }
      return counts;
    } finally {
      await restored.close();
    }
  });
  const recoverySeconds = (performance.now() - recoveryStart) / 1000;

  // --- Report ---
  console.info('Timings');
  for (const [label, seconds] of timings)
    console.info(`  ${seconds.toFixed(1).padStart(6)} s  ${label}`);
  console.info(
    `  ${recoverySeconds.toFixed(1).padStart(6)} s  RECOVERY, steps 1 to 7 (RTO measured)\n`,
  );

  const problems: string[] = [];
  for (const difference of differences) {
    problems.push(`data: ${difference.kind} ${difference.table} ${difference.detail}`);
  }
  for (const finding of findings) problems.push(`audit: ${finding.rule} ${finding.object}`);
  if (functional.some((count) => count !== PARENTS_PER_TENANT)) {
    problems.push(
      `application: each tenant should see ${PARENTS_PER_TENANT} parents, got ${functional}`,
    );
  }
  if (problems.length > 0) {
    console.error('DRILL FAILED');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
  } else {
    console.info(
      `DRILL PASSED: ${Object.keys(after).length} tables identical, isolation audit clean, ` +
        `each tenant sees its own ${PARENTS_PER_TENANT} rows.`,
    );
  }
} finally {
  for (const container of containers) {
    try {
      docker('rm', '-f', container);
    } catch {
      /* already gone */
    }
  }
  if (workDir) await rm(workDir, { recursive: true, force: true });
}
