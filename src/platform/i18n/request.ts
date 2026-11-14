import type { IncomingMessage } from 'node:http';
import { resolveLocale } from './locale.ts';
import type { Locale } from './locales.ts';

/**
 * Language of an HTTP request: explicit `?lang=` > user preference > organisation language >
 * Accept-Language > French. `user` and `tenant` are filled in once the request is authenticated.
 */
export function localeOfRequest(
  req: IncomingMessage,
  preferences: { user?: string; tenant?: string } = {},
): Locale {
  let query: string | null;
  try {
    query = new URL(req.url ?? '/', 'http://localhost').searchParams.get('lang');
  } catch {
    query = null;
  }
  const header = req.headers['accept-language'];
  return resolveLocale({
    query,
    user: preferences.user,
    tenant: preferences.tenant,
    acceptLanguage: Array.isArray(header) ? header[0] : header,
  });
}
