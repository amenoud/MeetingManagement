// Audits the tenant-isolation conventions of a migrated database (PLAN-TST-01, ADR-0002).
// Usage: pnpm db:audit   (reads DATABASE_ADMIN_URL; exits 1 if any finding)
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { auditIsolation, parseExceptions } from '../src/platform/db/index.ts';

const url = process.env['DATABASE_ADMIN_URL'];
if (!url) {
  console.error('DATABASE_ADMIN_URL is required');
  process.exit(1);
}
const file = fileURLToPath(new URL('../db/isolation-exceptions.json', import.meta.url));
const exceptions = parseExceptions(JSON.parse(await readFile(file, 'utf8')));
const findings = await auditIsolation(url, exceptions);

if (findings.length === 0) {
  console.info('Isolation audit passed: no finding.');
} else {
  for (const finding of findings) {
    console.error(`${finding.rule}  ${finding.object}  ${finding.detail}`);
  }
  console.error(`\nIsolation audit failed: ${findings.length} finding(s).`);
  process.exit(1);
}
