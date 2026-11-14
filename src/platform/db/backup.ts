// Logical backup and restore with pg_dump / pg_restore (PLAN-OPS-03, docs/runbooks/restore.md).
// The password is passed through the environment, never on a command line or in a log.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

/** Where pg_dump / pg_restore run: on this machine, or inside a PostgreSQL container. */
export interface ToolRunner {
  name: string;
  /** Host and port the tool must use to reach the server, as seen from where it runs. */
  hostPort(url: URL): { host: string; port: string };
  spawn(tool: 'pg_dump' | 'pg_restore', args: string[], password: string): ChildProcess;
}

/**
 * Local tools. PG_BIN_DIR selects the directory holding pg_dump / pg_restore, so a machine with
 * several PostgreSQL versions uses the one matching the server (see assertClientNotNewer).
 */
export function localRunner(): ToolRunner {
  const binDir = process.env['PG_BIN_DIR'];
  const command = (tool: string): string => (binDir ? join(binDir, tool) : tool);
  return {
    name: 'local',
    hostPort: (url) => ({ host: url.hostname, port: url.port || '5432' }),
    spawn: (tool, args, password) =>
      spawn(command(tool), args, {
        env: { ...process.env, PGPASSWORD: password },
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
  };
}

/**
 * Runs the tools from a PostgreSQL image (e.g. postgres:16-alpine) against a server reachable from
 * this machine. Gives the client version matching the server without installing anything (used on CI,
 * where the runner only offers a newer client). Selected by the PG_TOOLS_IMAGE variable.
 */
export function imageRunner(image: string): ToolRunner {
  const onLinux = process.platform === 'linux';
  return {
    name: `docker run ${image}`,
    hostPort: (url) => {
      const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
      // Linux: share the host network. Docker Desktop (Windows/macOS): reach the host by name.
      const host = local && !onLinux ? 'host.docker.internal' : url.hostname;
      return { host, port: url.port || '5432' };
    },
    spawn: (tool, args, password) =>
      spawn(
        'docker',
        [
          'run',
          '--rm',
          '-i',
          ...(onLinux ? ['--network', 'host'] : []),
          '-e',
          'PGPASSWORD',
          image,
          tool,
          ...args,
        ],
        { env: { ...process.env, PGPASSWORD: password }, stdio: ['pipe', 'pipe', 'pipe'] },
      ),
  };
}

/** Runs the tools inside the `db` service of docker-compose.yml (development machines without pg tools). */
export function composeRunner(service = 'db'): ToolRunner {
  return {
    name: `docker compose exec ${service}`,
    hostPort: () => ({ host: 'localhost', port: '5432' }),
    spawn: (tool, args, password) =>
      spawn('docker', ['compose', 'exec', '-T', '-e', 'PGPASSWORD', service, tool, ...args], {
        env: { ...process.env, PGPASSWORD: password },
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
  };
}

/** Runs the tools inside any running PostgreSQL container (used by the disaster drill). */
export function containerRunner(container: string): ToolRunner {
  return {
    name: `docker exec ${container}`,
    hostPort: () => ({ host: 'localhost', port: '5432' }),
    spawn: (tool, args, password) =>
      spawn('docker', ['exec', '-i', '-e', 'PGPASSWORD', container, tool, ...args], {
        env: { ...process.env, PGPASSWORD: password },
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
  };
}

/**
 * PG_TOOLS_IMAGE if set; else local tools when installed; else the compose `db` service
 * (only for a local server).
 */
export function defaultRunner(connectionString: string): ToolRunner {
  const image = process.env['PG_TOOLS_IMAGE'];
  if (image) return imageRunner(image);
  const binDir = process.env['PG_BIN_DIR'];
  const hasLocal =
    spawnSync(binDir ? join(binDir, 'pg_dump') : 'pg_dump', ['--version'], { stdio: 'ignore' })
      .status === 0;
  if (hasLocal) return localRunner();
  const host = new URL(connectionString).hostname;
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) return composeRunner();
  throw new Error(
    'pg_dump is not installed and the server is not local: install the PostgreSQL client',
  );
}

function connectionArgs(url: URL, runner: ToolRunner): string[] {
  const { host, port } = runner.hostPort(url);
  return [
    '--no-password',
    '-h',
    host,
    '-p',
    port,
    '-U',
    decodeURIComponent(url.username),
    '-d',
    decodeURIComponent(url.pathname.slice(1)),
  ];
}

/** "pg_dump (PostgreSQL) 17.2" -> 17. Returns undefined when no version is found. */
export function majorVersion(text: string): number | undefined {
  const match = /(\d+)(?:\.\d+)*/.exec(text.replace(/^[^\d]*/, ''));
  return match ? Number(match[1]) : undefined;
}

/**
 * A pg_dump NEWER than the server writes settings the server does not know: the dump then cannot be
 * restored (seen on CI: client 17+ against server 16, "unrecognized configuration parameter").
 * Refuse to create a dump that could not be restored.
 */
async function assertClientNotNewer(
  connectionString: string,
  runner: ToolRunner,
  password: string,
): Promise<void> {
  const probe = runner.spawn('pg_dump', ['--version'], password);
  let output = '';
  probe.stdout?.setEncoding('utf8');
  probe.stdout?.on('data', (chunk: string) => {
    output += chunk;
  });
  const result = await waitFor(probe);
  const client = majorVersion(output);
  if (result.code !== 0 || client === undefined) {
    throw new Error(`Cannot read the pg_dump version (${runner.name}): ${result.stderr.trim()}`);
  }
  const server = new Client({ connectionString });
  await server.connect();
  try {
    const row = await server.query<{ num: string }>(
      `select current_setting('server_version_num') as num`,
    );
    const serverMajor = Math.floor(Number(row.rows[0]?.num) / 10000);
    if (!Number.isFinite(serverMajor)) throw new Error('Cannot read the PostgreSQL server version');
    if (client > serverMajor) {
      throw new Error(
        `pg_dump ${client} (${runner.name}) is newer than the PostgreSQL ${serverMajor} server: the dump could not be restored. Use PostgreSQL ${serverMajor} client tools (set PG_TOOLS_IMAGE=postgres:${serverMajor}-alpine or PG_BIN_DIR).`,
      );
    }
  } finally {
    await server.end();
  }
}

interface Outcome {
  code: number | null;
  stderr: string;
}

function waitFor(child: ChildProcess): Promise<Outcome> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      if (stderr.length < 4000) stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

/**
 * Writes a custom-format dump (owners and privileges kept) of the database in `connectionString`.
 * Use an administrator connection. On failure the partial file is removed and an error is thrown.
 */
export async function dumpDatabase(
  connectionString: string,
  file: string,
  runner: ToolRunner = defaultRunner(connectionString),
): Promise<void> {
  const url = new URL(connectionString);
  await assertClientNotNewer(connectionString, runner, decodeURIComponent(url.password));
  const child = runner.spawn(
    'pg_dump',
    ['--format=custom', ...connectionArgs(url, runner)],
    decodeURIComponent(url.password),
  );
  const out = createWriteStream(file);
  child.stdout?.pipe(out);
  const finished = new Promise<void>((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
  });
  const outcome = await waitFor(child);
  await finished.catch(() => undefined);
  if (outcome.code !== 0) {
    await rm(file, { force: true });
    throw new Error(`pg_dump failed (${runner.name}): ${outcome.stderr.trim()}`);
  }
}

/**
 * Restores a custom-format dump into an EXISTING EMPTY database, stopping at the first error
 * (a truncated or corrupt file never ends as a silent partial restore).
 * The roles named in the dump must already exist: run `pnpm db:bootstrap` first.
 */
export async function restoreDatabase(
  connectionString: string,
  file: string,
  runner: ToolRunner = defaultRunner(connectionString),
): Promise<void> {
  const url = new URL(connectionString);
  const child = runner.spawn(
    'pg_restore',
    ['--exit-on-error', ...connectionArgs(url, runner)],
    decodeURIComponent(url.password),
  );
  const input = createReadStream(file);
  input.on('error', () => child.stdin?.destroy());
  child.stdin?.on('error', () => undefined); // pg_restore may exit before reading everything
  input.pipe(child.stdin as NodeJS.WritableStream);
  const outcome = await waitFor(child);
  if (outcome.code !== 0) {
    throw new Error(`pg_restore failed (${runner.name}): ${outcome.stderr.trim()}`);
  }
}
