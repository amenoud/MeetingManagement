// Smoke test of the local Docker environment (SPEC-000 AC15, AC16).
// Usage: pnpm test:docker   (Docker must be running; services are started if needed)
import { execFileSync } from 'node:child_process';
import net from 'node:net';

const APP_PORT = process.env.APP_PORT ?? '3000';
const S3_BUCKET = process.env.S3_BUCKET ?? 'meetingmanagement-dev';
const S3_KEY = process.env.S3_ACCESS_KEY_ID ?? 'devaccesskey';
const S3_SECRET = process.env.S3_SECRET_ACCESS_KEY ?? 'devsecretkey_only';
const MAILPIT_UI = process.env.MAILPIT_UI_PORT ?? '8025';
const SMTP_PORT = Number(process.env.SMTP_PORT ?? '1025');
const MAX_IMAGE_BYTES = 300 * 1024 * 1024;

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok });
  console.info(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
}

function sh(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function smtpSend(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    const lines = [
      'EHLO smoke.test',
      'MAIL FROM:<smoke@meetingmanagement.test>',
      'RCPT TO:<dest@meetingmanagement.test>',
      'DATA',
      'Subject: docker-smoke\r\n\r\nhello\r\n.',
      'QUIT',
    ];
    let index = 0;
    socket.setEncoding('utf8');
    socket.setTimeout(5000, () => reject(new Error('SMTP timeout')));
    socket.on('error', reject);
    socket.on('data', (chunk) => {
      if (/^\d{3}[ -]/m.test(chunk) && /(^|\n)\d{3} /.test(chunk)) {
        const next = lines[index++];
        if (next) socket.write(`${next}\r\n`);
        else socket.end();
      }
    });
    socket.on('close', () => resolve());
  });
}

async function waitFor(fn, label, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      if (await fn()) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timeout: ${label}`);
}

try {
  sh('docker', ['compose', '--profile', 'app', 'up', '-d', '--build', '--wait']);

  // AC15: app /healthz
  await waitFor(
    async () => (await fetch(`http://127.0.0.1:${APP_PORT}/healthz`)).ok,
    'app healthz',
  );
  record('AC15 app /healthz returns 200', true);

  // AC15: PostgreSQL accepts a connection
  const pg = sh('docker', [
    'compose',
    'exec',
    '-T',
    'db',
    'sh',
    '-c',
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select 1"',
  ]);
  record('AC15 PostgreSQL answers a query', pg.trim() === '1');

  // AC15: S3 bucket + object round trip (aws-cli container on the compose network)
  const network = 'meetingmanagement_default';
  const aws = (args) =>
    sh('docker', [
      'run',
      '--rm',
      '--network',
      network,
      '-e',
      `AWS_ACCESS_KEY_ID=${S3_KEY}`,
      '-e',
      `AWS_SECRET_ACCESS_KEY=${S3_SECRET}`,
      '-e',
      'AWS_DEFAULT_REGION=us-east-1',
      'amazon/aws-cli',
      '--endpoint-url',
      'http://s3:9000',
      ...args,
    ]);
  await waitFor(() => {
    aws(['s3', 'ls']);
    return true;
  }, 's3 ready');
  try {
    aws(['s3', 'mb', `s3://${S3_BUCKET}`]);
  } catch {
    /* bucket may already exist */
  }
  const listing = aws(['s3', 'ls']);
  record('AC15 S3 bucket is available', listing.includes(S3_BUCKET));

  // AC15: SMTP delivery visible in Mailpit
  await smtpSend(SMTP_PORT);
  const messages = await (await fetch(`http://127.0.0.1:${MAILPIT_UI}/api/v1/messages`)).json();
  record('AC15 Mailpit received the SMTP test message', messages.total >= 1);

  // AC16: non-root, no secrets, size
  const inspect = JSON.parse(sh('docker', ['image', 'inspect', 'meetingmanagement-app']))[0];
  const user = inspect.Config.User;
  record(
    'AC16 image runs as a non-root user',
    user !== '' && user !== 'root' && user !== '0',
    `user=${user}`,
  );
  record(
    'AC16 image size < 300 MB',
    inspect.Size < MAX_IMAGE_BYTES,
    `${Math.round(inspect.Size / 1e6)} MB`,
  );
  const files = sh('docker', [
    'run',
    '--rm',
    '--entrypoint',
    'sh',
    'meetingmanagement-app',
    '-c',
    'find /app -maxdepth 2 -name ".env*" -o -maxdepth 2 -name "*.pem" | head',
  ]);
  record('AC16 no .env or key file in the image', files.trim() === '');
} catch (error) {
  record(`unexpected error: ${error instanceof Error ? error.message : String(error)}`, false);
}

const failed = results.filter((r) => !r.ok).length;
console.info(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
