export const LOCALES = ['fr', 'de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Source language: the French catalog is the reference for keys and placeholders. */
export const DEFAULT_LOCALE: Locale = 'fr';

/** BCP 47 tag used for dates and numbers (Swiss context, ADR-0012). */
export const FORMAT_LOCALE: Record<Locale, string> = {
  fr: 'fr-CH',
  de: 'de-CH',
  en: 'en-GB',
};

export const DEFAULT_TIME_ZONE = 'Europe/Zurich';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
