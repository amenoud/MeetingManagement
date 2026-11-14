// Writes a custom-format dump of the database in DATABASE_ADMIN_URL to ./backups (git-ignored).
// Usage: pnpm db:backup
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { dumpDatabase } from '../src/platform/db/index.ts';

const url = process.env['DATABASE_ADMIN_URL'];
if (!url) {
  console.error('DATABASE_ADMIN_URL is required');
  process.exit(1);
}
const database = decodeURIComponent(new URL(url).pathname.slice(1));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const directory = process.env['BACKUP_DIR'] ?? 'backups';
await mkdir(directory, { recursive: true });
const file = join(directory, `${database}-${stamp}.dump`);

const start = performance.now();
await dumpDatabase(url, file);
const { size } = await stat(file);
console.info(
  `Backup written: ${file} (${(size / 1024).toFixed(0)} KB, ${((performance.now() - start) / 1000).toFixed(1)} s)`,
);
console.info(
  'WARNING: this file contains personal data. Keep it private; do not commit or share it.',
);
