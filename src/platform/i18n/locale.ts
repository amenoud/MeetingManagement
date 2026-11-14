import { DEFAULT_LOCALE, LOCALES, type Locale } from './locales.ts';

const MAX_HEADER = 500;
const MAX_ENTRIES = 20;
const ENTRY = /^\s*([A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*|\*)\s*(?:;\s*q=([01](?:\.\d{0,3})?))?\s*$/;

/** 'de-CH' -> 'de', 'FR' -> 'fr'; undefined if the language is not supported. */
export function normalizeLocale(tag: string | null | undefined): Locale | undefined {
  if (!tag) return undefined;
  const primary = tag.trim().toLowerCase().split('-')[0];
  return (LOCALES as readonly string[]).includes(primary ?? '') ? (primary as Locale) : undefined;
}

/**
 * Language tags of an Accept-Language header, best first (q-values; q=0 means "not acceptable").
 * Bounded (header size and number of entries) and tolerant: malformed entries are skipped.
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  const entries: { tag: string; q: number; order: number }[] = [];
  header
    .slice(0, MAX_HEADER)
    .split(',')
    .slice(0, MAX_ENTRIES)
    .forEach((part, order) => {
      const match = ENTRY.exec(part);
      if (!match || match[1] === '*') return;
      const q = match[2] === undefined ? 1 : Number(match[2]);
      if (q > 0) entries.push({ tag: match[1] as string, q, order });
    });
  return entries.sort((a, b) => b.q - a.q || a.order - b.order).map((entry) => entry.tag);
}

export interface LocaleInputs {
  /** Explicit choice in the request (e.g. ?lang=de). */
  query?: string | null | undefined;
  /** The signed-in user's preference. */
  user?: string | null | undefined;
  /** The organisation's default language. */
  tenant?: string | null | undefined;
  /** Raw Accept-Language header. */
  acceptLanguage?: string | null | undefined;
}

/** explicit choice > user preference > organisation language > Accept-Language > French. */
export function resolveLocale(inputs: LocaleInputs): Locale {
  const direct =
    normalizeLocale(inputs.query) ?? normalizeLocale(inputs.user) ?? normalizeLocale(inputs.tenant);
  if (direct) return direct;
  for (const tag of parseAcceptLanguage(inputs.acceptLanguage)) {
    const locale = normalizeLocale(tag);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}
