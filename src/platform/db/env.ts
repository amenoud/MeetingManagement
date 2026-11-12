import { z } from 'zod';

const schema = z.object({
  /** Administrator connection, used ONLY by the bootstrap script. Never part of the app runtime. */
  DATABASE_ADMIN_URL: z.string().min(1),
  /** Runtime role app_rw (same variable as the application configuration). */
  DATABASE_URL: z.string().min(1),
  /** Role app_migrator, owner of the schema objects. */
  DATABASE_MIGRATOR_URL: z.string().min(1),
});

export type DbAdminEnv = z.infer<typeof schema>;

/** Same rule as loadConfig: name the variables, never echo values (they contain passwords). */
export function loadDbAdminEnv(env: Record<string, string | undefined>): DbAdminEnv {
  const result = schema.safeParse(env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid database environment, check: ${names.join(', ')}`);
  }
  return result.data;
}
