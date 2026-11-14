// Restores a dump into a NEW empty database on the server of DATABASE_ADMIN_URL.
// Usage: pnpm db:restore <dump-file> <new-database-name>
// Run `pnpm db:bootstrap --roles-only` first on a new server, and `pnpm db:bootstrap` afterwards.
import { restoreDatabase } from '../src/platform/db/index.ts';
import { Client } from 'pg';

const [file, target] = process.argv.slice(2);
const admin = process.env['DATABASE_ADMIN_URL'];
if (!file || !target || !admin) {
  console.error(
    'Usage: pnpm db:restore <dump-file> <new-database-name>  (needs DATABASE_ADMIN_URL)',
  );
  process.exit(1);
}
if (!/^[a-z][a-z0-9_]{0,62}$/.test(target)) {
  console.error('Database name must match ^[a-z][a-z0-9_]*$');
  process.exit(1);
}

const server = new Client({ connectionString: admin });
await server.connect();
try {
  const exists = await server.query('select 1 from pg_database where datname = $1', [target]);
  if (exists.rowCount) {
    console.error(`Database ${target} already exists: refusing to restore over it.`);
    process.exit(1);
  }
  await server.query(`create database ${target}`);
} finally {
  await server.end();
}

const url = new URL(admin);
url.pathname = `/${target}`;
const start = performance.now();
await restoreDatabase(url.toString(), file);
console.info(`Restored into ${target} in ${((performance.now() - start) / 1000).toFixed(1)} s.`);
console.info(
  'Next: pnpm db:bootstrap (privileges), then pnpm db:verify-restore <source-db> <restored-db>.',
);
