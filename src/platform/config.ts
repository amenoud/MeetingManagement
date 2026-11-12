import { z } from 'zod';

const portSchema = z.coerce.number().int().min(1).max(65535);

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: portSchema.default(3000),
  DATABASE_URL: z.string().min(1),
  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().min(1).default('eu-central-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: portSchema,
  SMTP_FROM: z.string().min(1),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Validates the process environment once at startup.
 * The error names the offending variables but never echoes their values (they may be secrets).
 */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid configuration, check: ${names.join(', ')}`);
  }
  return result.data;
}
