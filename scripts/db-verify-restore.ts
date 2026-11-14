// Compares a source database with a restored copy (row counts + content hashes) and audits the copy.
// Usage: pnpm db:verify-restore <source-database> <restored-database>   (needs DATABASE_ADMIN_URL)
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  auditIsolation,
  diffSnapshots,
  parseExceptions,
  snapshotDatabase,
} from '../src/platform/db/index.ts';

const [source, restored] = process.argv.slice(2);
const admin = process.env['DATABASE_ADMIN_URL'];
if (!source || !restored || !admin) {
  console.error(
    'Usage: pnpm db:verify-restore <source-db> <restored-db>  (needs DATABASE_ADMIN_URL)',
  );
  process.exit(1);
}
const urlFor = (database: string): string => {
  const url = new URL(admin);
  url.pathname = `/${database}`;
  return url.toString();
};

const file = fileURLToPath(new URL('../db/isolation-exceptions.json', import.meta.url));
const exceptions = parseExceptions(JSON.parse(await readFile(file, 'utf8')));
const differences = diffSnapshots(
  await snapshotDatabase(urlFor(source)),
  await snapshotDatabase(urlFor(restored)),
);
const findings = await auditIsolation(urlFor(restored), exceptions);

for (const difference of differences) {
  console.error(`DATA   ${difference.kind}  ${difference.table}  ${difference.detail}`);
}
for (const finding of findings) console.error(`AUDIT  ${finding.rule}  ${finding.object}`);
if (differences.length + findings.length > 0) {
  console.error('Verification FAILED.');
  process.exit(1);
}
console.info('Verification passed: identical data, isolation audit clean.');
