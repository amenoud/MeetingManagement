import { describe, expect, it } from 'vitest';
import { scrub } from './redact.ts';
import { Secret } from './secret.ts';

const json = (value: unknown): string => JSON.stringify(scrub(value));

describe('scrub: by key', () => {
  it.each([
    'password',
    'Password',
    'newPassword',
    'user_password_hash',
    'authorization',
    'Set-Cookie',
    'cookie',
    'apiKey',
    'api_key',
    'x-api-key',
    'accessToken',
    'refresh_token',
    'clientSecret',
    'sessionId',
    'privateKey',
    'DATABASE_URL',
    'connectionString',
    'otp',
    'totp',
    'csrf',
    'dsn',
  ])('masks the value of %s', (key) => {
    expect(scrub({ [key]: 'value-that-must-not-leak' })).toEqual({ [key]: '[REDACTED]' });
  });

  it('masks nested and mixed-case keys', () => {
    const out = json({
      request: { headers: { Authorization: 'x', COOKIE: 'y' } },
      list: [{ Token: 'z' }],
    });
    expect(out).not.toMatch(/"x"|"y"|"z"/);
    expect(out).toContain('[REDACTED]');
  });

  it.each(['content', 'body', 'notes', 'text', 'html', 'markdown', 'transcript', 'minutes'])(
    'masks document content under %s',
    (key) => {
      expect(scrub({ [key]: 'Le conseil décide de licencier M. Dupont' })).toEqual({
        [key]: '[REDACTED:content]',
      });
    },
  );
});

describe('scrub: by value, whatever the key', () => {
  it('masks credentials inside a connection URL but keeps user and host', () => {
    const out = scrub({ target: 'postgres://app_rw:s3cr3tP4ss@db.internal:5432/app' });
    expect(out).toEqual({ target: 'postgres://app_rw:[REDACTED]@db.internal:5432/app' });
  });

  it('masks Bearer and Basic credentials', () => {
    expect(scrub('sent Bearer abc123SECRETtoken456xyz to api')).toBe(
      'sent Bearer [REDACTED] to api',
    );
    expect(scrub('Authorization: Basic dXNlcjpwYXNzd29yZA==')).toBe(
      'Authorization: Basic [REDACTED]',
    );
  });

  it('masks JWT tokens', () => {
    // Fake JWT assembled at run time so the source holds no secret-looking literal.
    const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0In0', 'abcDEFghiJKL'].join('.');
    expect(scrub({ note2: `got ${jwt}` })).toEqual({ note2: 'got [REDACTED:jwt]' });
  });

  it('masks secret query parameters and free-text key=value pairs', () => {
    expect(scrub('/reset?token=abc123&lang=fr')).toBe('/reset?token=[REDACTED]&lang=fr');
    expect(scrub('login failed password=Hunter2 for the account')).toBe(
      'login failed password=[REDACTED] for the account',
    );
  });

  it('masks e-mail addresses', () => {
    expect(scrub('invited jean.dupont@example.test today')).toBe('invited [email] today');
  });

  it('masks long random tokens (letters and digits) but keeps UUIDs', () => {
    const uuid = '0197b3a2-7c1e-7f00-8000-00000000000a';
    expect(scrub(`session a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6 for ${uuid}`)).toBe(
      `session [REDACTED:token] for ${uuid}`,
    );
  });

  it('keeps long hashes under a hash-like key (they are not secrets)', () => {
    const sha = 'a'.repeat(30) + '1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
    expect(scrub({ content_hash: sha, checksum: sha, sha256: sha })).toEqual({
      content_hash: sha,
      checksum: sha,
      sha256: sha,
    });
  });
});

describe('scrub: no false positives on what logs are for', () => {
  it('keeps identifiers, numbers, booleans, null and ordinary words', () => {
    const value = {
      request_id: 'req-12345678',
      tenant_id: '0197b3a2-7c1e-7f00-8000-00000000000a',
      status: 200,
      ok: true,
      duration_ms: 12.5,
      nothing: null,
      event: 'meeting.created',
      footprint: 'x',
      path: '/api/meetings',
    };
    expect(scrub(value)).toEqual(value);
  });

  it('visibly masks a harmless key that looks secret (never a silent hole)', () => {
    expect(scrub({ tokenCount: 3 })).toEqual({ tokenCount: '[REDACTED]' });
  });
});

describe('scrub: structure and resilience', () => {
  it('never throws on cycles, deep nesting, huge values or hostile objects', () => {
    const cyclic: Record<string, unknown> = { name: 'a' };
    cyclic['self'] = cyclic;
    expect(json(cyclic)).toContain('[Circular]');

    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 20; i++) deep = { next: deep };
    expect(json(deep)).toContain('[MaxDepth]');

    expect((scrub('x'.repeat(5000)) as string).length).toBeLessThan(2100);
    expect(scrub(Array.from({ length: 80 }, (_, i) => i))).toHaveLength(51);

    const hostile = {
      get boom(): never {
        throw new Error('getter');
      },
    };
    expect(scrub(hostile)).toEqual({ boom: '[Unreadable]' });
    expect(
      scrub({
        toJSON: () => {
          throw new Error('nope');
        },
      }),
    ).toBe('[UNLOGGABLE]');
  });

  it('handles Secret, Buffer, Date, bigint, functions, symbols, Map and Set', () => {
    const out = scrub({
      s: new Secret('top-secret-value'),
      b: Buffer.from('abc'),
      d: new Date('2026-11-14T10:00:00Z'),
      n: 12n,
      f: () => 1,
      m: new Map([['k', 'v']]),
      set: new Set([1]),
    });
    expect(out).toEqual({
      s: '[REDACTED]',
      b: '[Binary 3 bytes]',
      d: '2026-11-14T10:00:00.000Z',
      n: '12',
      f: '[Function]',
      m: '[Map]',
      set: '[Set]',
    });
  });

  it('scrubs error messages and causes, and keeps the error type', () => {
    const leaked = ['abcdef', '123456'].join(''); // assembled at run time: no secret-looking literal
    const error = new Error('cannot connect to postgres://u:pw123456@db/x', {
      cause: new Error(`refresh failed: token=${leaked}`),
    });
    const out = json(error);
    expect(out).not.toContain('pw123456');
    expect(out).not.toContain(leaked);
    expect(out).toContain('"type":"Error"');
  });

  it('does not mutate its input', () => {
    const input = { password: 'p', nested: { token: 't' } };
    scrub(input);
    expect(input).toEqual({ password: 'p', nested: { token: 't' } });
  });
});
