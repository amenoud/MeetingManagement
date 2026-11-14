import { describe, expect, it } from 'vitest';
import { bindTenant, bindUser, runWithContext } from './context.ts';
import { createLogger } from './logger.ts';
import { Secret } from './secret.ts';

const A = '0197b3a2-7c1e-7f00-8000-00000000000a';
const USER = '0197b3a2-7c1e-7f00-8000-0000000000c1';

function collector() {
  const lines: string[] = [];
  return {
    destination: {
      write(chunk: string) {
        lines.push(chunk);
      },
    },
    raw: () => lines.join(''),
    entries: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

// Every one of these values must be absent from the raw log output.
const LEAKS = {
  bearer: 'abc123SECRETtoken456xyz',
  session: 'SESSIONVALUE-9f8e7d6c5b4a',
  password: 'Hunter2!pass',
  queryToken: ['tok', '9a8b7c6d5e4f3a2b1c0d'].join(''),
  email: 'jean.dupont@example.test',
  dbPassword: 's3cr3tP4ss',
  jwtPayload: 'eyJzdWIiOiIxMjM0In0',
  pvText: 'Le conseil décide de licencier M. Dupont',
  secretObject: 'value-inside-secret-wrapper',
};

describe('logger', () => {
  it('writes one JSON object per line with level, time, service and message', () => {
    const sink = collector();
    createLogger({ destination: sink.destination }).info({ port: 3000 }, 'server.listening');
    const [entry] = sink.entries();
    expect(entry).toMatchObject({
      level: 'info',
      service: 'meetingmanagement',
      msg: 'server.listening',
      port: 3000,
    });
    expect(entry?.['time']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry).not.toHaveProperty('pid');
    expect(entry).not.toHaveProperty('hostname');
  });

  it('honours the level', () => {
    const sink = collector();
    const log = createLogger({ destination: sink.destination, level: 'warn' });
    log.info('ignored');
    log.warn('kept');
    expect(sink.entries().map((entry) => entry['msg'])).toEqual(['kept']);
  });

  it('SPEC-000-AC18 adds request_id to every line, and tenant_id and user_id once bound', () => {
    const sink = collector();
    const log = createLogger({ destination: sink.destination });
    runWithContext({ requestId: 'req-12345678' }, () => {
      log.info('before.tenant');
      bindTenant(A);
      bindUser(USER);
      log.info('after.tenant');
    });
    log.info('outside');
    const [before, after, outside] = sink.entries();
    expect(before).toMatchObject({ request_id: 'req-12345678' });
    expect(before).not.toHaveProperty('tenant_id');
    expect(after).toMatchObject({ request_id: 'req-12345678', tenant_id: A, user_id: USER });
    expect(outside).not.toHaveProperty('request_id');
  });

  it('SPEC-000-AC18 leaves no password, token, secret, e-mail or document content in the output', () => {
    const sink = collector();
    const log = createLogger({ destination: sink.destination });
    runWithContext({ requestId: 'req-12345678' }, () => {
      bindTenant(A);
      log.info(
        {
          method: 'POST',
          url: `/reset?token=${LEAKS.queryToken}&lang=fr`,
          headers: {
            authorization: `Bearer ${LEAKS.bearer}`,
            cookie: `sid=${LEAKS.session}`,
            'content-type': 'application/json',
          },
          body: { password: LEAKS.password, minutes: { content: LEAKS.pvText } },
          user: `${LEAKS.email}`,
          database: `postgres://app_rw:${LEAKS.dbPassword}@db:5432/app`,
          jwt: `eyJhbGciOiJIUzI1NiJ9.${LEAKS.jwtPayload}.abcDEFghiJKL`,
          config: { apiKey: new Secret(LEAKS.secretObject) },
        },
        `login by ${LEAKS.email} failed, password=${LEAKS.password}`,
      );
    });
    const output = sink.raw();
    for (const [name, value] of Object.entries(LEAKS)) {
      expect(output, `${name} leaked`).not.toContain(value);
    }
    // ...while what is useful to operators is still there.
    const [entry] = sink.entries();
    expect(entry).toMatchObject({ request_id: 'req-12345678', tenant_id: A, method: 'POST' });
    expect(output).toContain('lang=fr');
    expect(output).toContain('application/json');
  });

  it('scrubs error objects logged under any key', () => {
    const sink = collector();
    createLogger({ destination: sink.destination }).error(
      { err: new Error(`cannot reach postgres://u:${LEAKS.dbPassword}@db/x`) },
      'job.failed',
    );
    expect(sink.raw()).not.toContain(LEAKS.dbPassword);
    expect(sink.raw()).toContain('"type":"Error"');
  });

  it('never throws on a hostile log argument', () => {
    const sink = collector();
    const log = createLogger({ destination: sink.destination });
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(() =>
      log.info(
        {
          cyclic,
          bad: {
            toJSON: () => {
              throw new Error('x');
            },
          },
        },
        'hostile',
      ),
    ).not.toThrow();
    expect(sink.entries()).toHaveLength(1);
  });
});
