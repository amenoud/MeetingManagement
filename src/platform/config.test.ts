import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const valid = {
  DATABASE_URL: 'postgres://user:pw@localhost:5432/db',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret-value',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_FROM: 'noreply@example.test',
};

describe('loadConfig', () => {
  it('parses a valid environment and applies defaults', () => {
    const config = loadConfig(valid);
    expect(config.PORT).toBe(3000);
    expect(config.SMTP_PORT).toBe(1025);
    expect(config.S3_REGION).toBe('eu-central-1');
  });

  it('SPEC-000-AC17 names the missing variable', () => {
    const rest: Record<string, string> = { ...valid };
    delete rest['DATABASE_URL'];
    expect(() => loadConfig(rest)).toThrow('DATABASE_URL');
  });

  it('SPEC-000-AC17 never echoes secret values in the error', () => {
    let message = '';
    try {
      loadConfig({ ...valid, SMTP_PORT: 'secret-value-not-a-port' });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toContain('SMTP_PORT');
    expect(message).not.toContain('secret-value');
  });
});
