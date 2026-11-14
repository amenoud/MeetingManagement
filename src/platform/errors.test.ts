import { describe, expect, it } from 'vitest';
import { databaseErrorFields } from './error-shape.ts';
import { AppError, toHttpError } from './errors.ts';
import { scrub } from './redact.ts';

const leaks = [
  'row-value-secret',
  'hint-secret',
  'where-secret',
  'param-secret-value',
  'Failed query',
  'insert into',
  'duplicate key value',
];

// What a driver error looks like: text with row values in `message`/`detail`/`where`.
function postgresError(): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint "t_name_key"'), {
    code: '23505',
    severity: 'ERROR',
    detail: 'Key (name)=(row-value-secret) already exists.',
    hint: 'a hint with hint-secret',
    where: 'SQL statement "insert ... where-secret"',
    schema: 'app',
    table: 'iso_parent',
    column: 'name',
    constraint: 't_name_key',
    routine: '_bt_check_unique',
  });
}

// What Drizzle throws: its message repeats the SQL and the parameters.
function drizzleError(cause: Error): Error {
  const error = new Error(
    'Failed query: insert into app.t (name) values ($1)\nparams: param-secret-value',
    { cause },
  );
  return Object.assign(error, {
    query: 'insert into app.t (name) values ($1)',
    params: ['param-secret-value'],
  });
}

describe('databaseErrorFields', () => {
  it('keeps only value-free fields of a PostgreSQL error', () => {
    expect(databaseErrorFields(postgresError())).toMatchObject({
      type: 'DatabaseError',
      pg_code: '23505',
      pg_severity: 'ERROR',
      pg_schema: 'app',
      pg_table: 'iso_parent',
      pg_column: 'name',
      pg_constraint: 't_name_key',
      pg_routine: '_bt_check_unique',
    });
  });

  it('recognizes a Drizzle wrapper through its cause', () => {
    const fields = databaseErrorFields(drizzleError(postgresError()));
    expect(fields?.pg_code).toBe('23505');
  });

  it('recognizes a Drizzle wrapper without a cause', () => {
    expect(databaseErrorFields(drizzleError(new Error('x')))).toMatchObject({
      type: 'DatabaseError',
    });
  });

  it('ignores ordinary errors and non-errors', () => {
    expect(databaseErrorFields(new Error('plain'))).toBeUndefined();
    expect(
      databaseErrorFields(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })),
    ).toBeUndefined();
    expect(databaseErrorFields('Failed query: …')).toBeUndefined();
    expect(databaseErrorFields(null)).toBeUndefined();
  });
});

describe('scrub of database errors (what the logger writes)', () => {
  it('SPEC-000-AC18 writes no SQL, parameter, detail, hint or message for a PostgreSQL error', () => {
    const out = JSON.stringify(scrub(postgresError()));
    for (const leak of leaks) expect(out, leak).not.toContain(leak);
    expect(out).toContain('23505');
    expect(out).toContain('t_name_key');
  });

  it('SPEC-000-AC18 writes no SQL or parameter for a Drizzle error, even nested as a cause', () => {
    const wrapped = new Error('job failed', { cause: drizzleError(postgresError()) });
    for (const error of [drizzleError(postgresError()), wrapped]) {
      const out = JSON.stringify(scrub({ err: error }));
      for (const leak of leaks) expect(out, leak).not.toContain(leak);
      expect(out).toContain('23505');
    }
  });

  it('keeps ordinary errors readable (scrubbed)', () => {
    const out = JSON.stringify(scrub(new Error('connect ECONNREFUSED 127.0.0.1:5432')));
    expect(out).toContain('ECONNREFUSED');
  });
});

describe('toHttpError', () => {
  it('shows the public message and code of an AppError, with the request id', () => {
    const result = toHttpError(
      new AppError('forbidden', 403, 'You may not do this.'),
      'req-12345678',
    );
    expect(result).toEqual({
      status: 403,
      body: {
        error: { code: 'forbidden', message: 'You may not do this.', requestId: 'req-12345678' },
      },
    });
  });

  it('SPEC-000-AC18 never shows the message of any other error', () => {
    for (const error of [
      drizzleError(postgresError()),
      postgresError(),
      new Error('internal path /srv/app/secret-file'),
      'a string',
      undefined,
    ]) {
      const { status, body } = toHttpError(error, 'req-12345678');
      expect(status).toBe(500);
      const text = JSON.stringify(body);
      expect(body.error.code).toBe('internal_error');
      expect(body.error.requestId).toBe('req-12345678');
      for (const leak of [...leaks, 'secret-file', 'a string'])
        expect(text, leak).not.toContain(leak);
    }
  });
});
