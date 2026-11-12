// Creates the database roles and privileges (idempotent). Local/CI/ops tool, never run by the app.
// Usage: pnpm db:bootstrap   (reads DATABASE_ADMIN_URL, DATABASE_URL, DATABASE_MIGRATOR_URL)
import { bootstrapRoles, loadDbAdminEnv } from '../src/platform/db/index.ts';

const env = loadDbAdminEnv(process.env);
await bootstrapRoles(env.DATABASE_ADMIN_URL, env.DATABASE_URL, env.DATABASE_MIGRATOR_URL);
console.info('Database roles bootstrapped.');
