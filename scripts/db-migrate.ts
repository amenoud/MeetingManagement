// Applies pending SQL migrations from db/migrations with the app_migrator role.
// Usage: pnpm db:migrate   (reads DATABASE_MIGRATOR_URL)
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../src/platform/db/index.ts';

const url = process.env['DATABASE_MIGRATOR_URL'];
if (!url) {
  console.error('DATABASE_MIGRATOR_URL is required');
  process.exit(1);
}
const applied = await runMigrations(
  url,
  fileURLToPath(new URL('../db/migrations', import.meta.url)),
);
console.info(applied.length === 0 ? 'No pending migration.' : `Applied: ${applied.join(', ')}`);
