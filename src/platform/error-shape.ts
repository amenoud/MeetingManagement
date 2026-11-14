// Recognizes database errors so they can be logged WITHOUT their text (PLAN-PLT-01, ADR-0011).
// Why: a Drizzle error message repeats the SQL and its parameters; a PostgreSQL error carries
// `detail`/`where`/`hint`, which can contain row values (e.g. "Key (email)=(x@y.z) already exists").

const PG_CODE = /^[0-9A-Z]{5}$/;
const MAX_FRAMES = 8;

export interface DatabaseErrorFields {
  type: 'DatabaseError';
  pg_code?: string;
  pg_severity?: string;
  pg_schema?: string;
  pg_table?: string;
  pg_column?: string;
  pg_constraint?: string;
  pg_routine?: string;
  /** Call-site frames only: the message line of the stack is dropped. */
  frames?: string;
}

function isPostgresError(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const code = record['code'];
  return (
    typeof code === 'string' && PG_CODE.test(code) && ('severity' in record || 'routine' in record)
  );
}

function text(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

/** Returns only non-textual, value-free fields of a database error, or undefined for any other error. */
export function databaseErrorFields(error: unknown): DatabaseErrorFields | undefined {
  if (!(error instanceof Error)) return undefined;
  const postgres = isPostgresError(error)
    ? error
    : isPostgresError(error.cause)
      ? error.cause
      : undefined;
  const drizzleWrapper =
    error.message.startsWith('Failed query:') || ('query' in error && 'params' in error);
  if (!postgres && !drizzleWrapper) return undefined;

  const fields: DatabaseErrorFields = { type: 'DatabaseError' };
  if (postgres) {
    const known = {
      pg_code: text(postgres, 'code'),
      pg_severity: text(postgres, 'severity'),
      pg_schema: text(postgres, 'schema'),
      pg_table: text(postgres, 'table'),
      pg_column: text(postgres, 'column'),
      pg_constraint: text(postgres, 'constraint'),
      pg_routine: text(postgres, 'routine'),
    };
    for (const [key, value] of Object.entries(known)) {
      if (value !== undefined) (fields as unknown as Record<string, string>)[key] = value;
    }
  }
  const frames = (error.stack ?? '')
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '))
    .slice(0, MAX_FRAMES)
    .join('\n');
  if (frames) fields.frames = frames;
  return fields;
}
