// Masks secrets, personal data and content before anything is written to a log (PLAN-PLT-01).
// This is a safety NET: the rule is to log identifiers, never content. Pure, never throws.
import { Secret } from './secret.ts';

const MAX_DEPTH = 6;
const MAX_STRING = 2000;
const MAX_ARRAY = 50;
const MAX_KEYS = 100;

/** Key fragments that mark a value as secret (matched inside the normalized key). */
const SECRET_FRAGMENTS = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'cookie',
  'apikey',
  'accesskey',
  'privatekey',
  'credential',
  'signature',
  'connectionstring',
  'databaseurl',
  'session',
];
/** Short names matched exactly, so that "footprint" is not mistaken for "otp". */
const SECRET_EXACT = new Set(['otp', 'totp', 'dsn', 'pwd', 'csrf', 'mfa']);
/** Keys that carry document content: never logged (log identifiers instead). */
const CONTENT_EXACT = new Set([
  'content',
  'body',
  'notes',
  'note',
  'text',
  'html',
  'markdown',
  'transcript',
  'minutes',
]);
/** Keys whose value is legitimately a long hex/base64 string (content hashes, checksums). */
const HASH_SUFFIXES = ['hash', 'sha256', 'checksum', 'digest'];

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONNECTION_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/gi;
const AUTH_SCHEME = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const SECRET_QUERY_PARAM =
  /((?:^|[?&;,\s])(?:token|access_token|refresh_token|id_token|api_key|apikey|key|password|passwd|pwd|secret|code|sig|signature|session|sid|auth|otp)=)[^&\s#;]+/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const LONG_TOKEN = /[A-Za-z0-9_-]{32,}/g;

function scrubString(input: string, allowLong: boolean): string {
  let text = input.length > MAX_STRING ? `${input.slice(0, MAX_STRING)}…[truncated]` : input;
  text = text.replace(CONNECTION_CREDENTIALS, '$1$2:[REDACTED]@');
  text = text.replace(AUTH_SCHEME, '$1 [REDACTED]');
  text = text.replace(JWT, '[REDACTED:jwt]');
  text = text.replace(SECRET_QUERY_PARAM, '$1[REDACTED]');
  text = text.replace(EMAIL, '[email]');
  if (!allowLong) {
    text = text.replace(LONG_TOKEN, (match) => {
      // Identifiers are fine; a long run mixing letters and digits looks like a token.
      if (UUID.test(match)) return match;
      return /[A-Za-z]/.test(match) && /\d/.test(match) ? '[REDACTED:token]' : match;
    });
  }
  return text;
}

function keyVerdict(key: string): 'secret' | 'content' | 'hash' | 'normal' {
  const normalized = normalizeKey(key);
  if (SECRET_EXACT.has(normalized) || SECRET_FRAGMENTS.some((f) => normalized.includes(f))) {
    return 'secret';
  }
  if (CONTENT_EXACT.has(normalized)) return 'content';
  if (HASH_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return 'hash';
  return 'normal';
}

function walk(value: unknown, depth: number, seen: WeakSet<object>, allowLong: boolean): unknown {
  switch (typeof value) {
    case 'string':
      return scrubString(value, allowLong);
    case 'number':
    case 'boolean':
    case 'undefined':
      return value;
    case 'bigint':
      return value.toString();
    case 'symbol':
      return value.toString();
    case 'function':
      return '[Function]';
    default:
      break;
  }
  if (value === null) return null;
  if (depth >= MAX_DEPTH) return '[MaxDepth]';

  const object = value as object;
  if (object instanceof Secret) return '[REDACTED]';
  if (seen.has(object)) return '[Circular]';
  seen.add(object);

  if (object instanceof Uint8Array) return `[Binary ${object.byteLength} bytes]`;
  if (object instanceof Date) return Number.isNaN(object.getTime()) ? null : object.toISOString();
  if (object instanceof Map || object instanceof Set) return `[${object.constructor.name}]`;
  if (object instanceof Error) {
    const out: Record<string, unknown> = {
      type: object.name,
      message: walk(object.message, depth + 1, seen, false),
      stack: walk(object.stack ?? '', depth + 1, seen, false),
    };
    for (const [key, entry] of entries(object)) out[key] = scrubEntry(key, entry, depth, seen);
    if ('cause' in object && object.cause !== undefined) {
      out['cause'] = walk(object.cause, depth + 1, seen, false);
    }
    return out;
  }
  if (Array.isArray(object)) {
    const items = object.slice(0, MAX_ARRAY).map((item) => walk(item, depth + 1, seen, allowLong));
    if (object.length > MAX_ARRAY) items.push(`[+${object.length - MAX_ARRAY} more]`);
    return items;
  }
  if (typeof (object as { toJSON?: unknown }).toJSON === 'function') {
    return walk((object as { toJSON: () => unknown }).toJSON(), depth + 1, seen, allowLong);
  }

  const out: Record<string, unknown> = {};
  for (const [key, entry] of entries(object)) out[key] = scrubEntry(key, entry, depth, seen);
  return out;
}

function entries(object: object): [string, unknown][] {
  const result: [string, unknown][] = [];
  for (const key of Object.keys(object).slice(0, MAX_KEYS)) {
    try {
      result.push([key, (object as Record<string, unknown>)[key]]);
    } catch {
      result.push([key, '[Unreadable]']);
    }
  }
  return result;
}

function scrubEntry(key: string, entry: unknown, depth: number, seen: WeakSet<object>): unknown {
  const verdict = keyVerdict(key);
  if (verdict === 'secret') return '[REDACTED]';
  if (verdict === 'content') return '[REDACTED:content]';
  return walk(entry, depth + 1, seen, verdict === 'hash');
}

/** Returns a copy of `value` that is safe to log. Never throws. */
export function scrub(value: unknown): unknown {
  try {
    return walk(value, 0, new WeakSet(), false);
  } catch {
    return '[UNLOGGABLE]';
  }
}
