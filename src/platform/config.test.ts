import { readFileSync } from 'node:fs';
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { configKeys, loadConfig } from './config.ts';
import { Secret } from './secret.ts';

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
    expect(config.LOG_LEVEL).toBe('info');
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

  it('rejects an unknown log level', () => {
    expect(() => loadConfig({ ...valid, LOG_LEVEL: 'verbose' })).toThrow('LOG_LEVEL');
  });

  it('SPEC-000-AC18 keeps secrets in Secret wrappers that never print their value', () => {
    const config = loadConfig(valid);
    expect(config.DATABASE_URL).toBeInstanceOf(Secret);
    expect(config.S3_SECRET_ACCESS_KEY.reveal()).toBe('secret-value');
    const printed = [
      JSON.stringify(config),
      inspect(config, { depth: 5 }),
      String(config.DATABASE_URL),
    ];
    for (const text of printed) {
      expect(text).not.toContain('secret-value');
      expect(text).not.toContain('pw@localhost');
    }
  });

  it('returns a frozen configuration', () => {
    const config = loadConfig(valid);
    expect(Object.isFrozen(config)).toBe(true);
    expect(() => {
      (config as { PORT: number }).PORT = 1;
    }).toThrow();
  });
});

describe('.env.example', () => {
  it('lists every variable of the configuration schema (no drift)', () => {
    const example = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
    const declared = new Set(
      example
        .split('\n')
        .map((line) => /^([A-Z0-9_]+)=/.exec(line)?.[1])
        .filter((name): name is string => name !== undefined),
    );
    const missing = configKeys.filter((key) => !declared.has(key));
    expect(missing).toEqual([]);
  });
});
