import { z } from 'zod';
import { Secret } from './secret.ts';

const portSchema = z.coerce.number().int().min(1).max(65535);
const secret = z
  .string()
  .min(1)
  .transform((value) => new Secret(value));

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: portSchema.default(3000),
  DATABASE_URL: secret,
  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().min(1).default('eu-central-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: secret,
  S3_SECRET_ACCESS_KEY: secret,
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: portSchema,
  SMTP_FROM: z.string().min(1),
});

/** Secrets are `Secret` instances: use `.reveal()` only where the value is actually needed. */
export type Config = Readonly<z.infer<typeof configSchema>>;

/** Every variable the application reads (used to keep .env.example complete). */
export const configKeys: readonly string[] = Object.keys(configSchema.shape);

/**
 * Validates the process environment once at startup and returns a frozen configuration.
 * The error names the offending variables but never echoes their values (they may be secrets).
 */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid configuration, check: ${names.join(', ')}`);
  }
  return Object.freeze(result.data);
}

let cached: Config | undefined;

/** The validated configuration of this process (read once from the environment, then frozen). */
export function getConfig(): Config {
  cached ??= loadConfig(process.env);
  return cached;
}
