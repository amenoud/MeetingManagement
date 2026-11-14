// Creates the database roles and privileges (idempotent). Local/CI/ops tool, never run by the app.
// Usage: pnpm db:bootstrap [--roles-only]   (reads DATABASE_ADMIN_URL, DATABASE_URL, DATABASE_MIGRATOR_URL)
// --roles-only: create the roles but not the schemas/privileges (step before a restore).
import { bootstrapRoles, loadDbAdminEnv } from '../src/platform/db/index.ts';

const env = loadDbAdminEnv(process.env);
const rolesOnly = process.argv.includes('--roles-only');
await bootstrapRoles(env.DATABASE_ADMIN_URL, env.DATABASE_URL, env.DATABASE_MIGRATOR_URL, {
  privileges: !rolesOnly,
});
console.info(
  rolesOnly ? 'Database roles created (no privileges).' : 'Database roles bootstrapped.',
);
