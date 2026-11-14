import { IntlMessageFormat } from 'intl-messageformat';
import { getLogger } from '../logger.ts';
import { DEFAULT_LOCALE, FORMAT_LOCALE, type Locale } from './locales.ts';
import { CATALOGS, flattenCatalog, type Catalog, type MessageKey } from './messages.ts';

export type MessageValues = Record<string, string | number | boolean | Date>;

export interface Translator<Key extends string = MessageKey> {
  readonly locale: Locale;
  /** Never throws: a missing or malformed message is reported and the key itself is returned. */
  t(key: Key, values?: MessageValues): string;
  has(key: string): boolean;
}

export interface Problem {
  kind: 'missing_message' | 'format_error';
  key: string;
  locale: Locale;
}

export interface TranslatorOptions {
  catalogs?: Record<Locale, Catalog>;
  /** Receives missing/malformed messages (default: an `i18n.*` error log line, key and locale only). */
  onProblem?: (problem: Problem) => void;
}

function logProblem(problem: Problem): void {
  getLogger().error({ key: problem.key, locale: problem.locale }, `i18n.${problem.kind}`);
}

/**
 * ICU MessageFormat translator (plurals, select, number/date arguments).
 * Lookup order: requested locale, then French (source language), then the key itself.
 */
export function createTranslatorFor<Key extends string>(
  locale: Locale,
  options: TranslatorOptions = {},
): Translator<Key> {
  const catalogs = options.catalogs ?? CATALOGS;
  const report = options.onProblem ?? logProblem;
  const compiled = new Map<string, IntlMessageFormat>();
  const own = flattenCatalog(catalogs[locale]);
  const source = flattenCatalog(catalogs[DEFAULT_LOCALE]);
  const lookup = (key: string): string | undefined => own.get(key) ?? source.get(key);

  return {
    locale,
    has: (key) => lookup(key) !== undefined,
    t(key, values) {
      const message = lookup(key);
      if (message === undefined) {
        report({ kind: 'missing_message', key, locale });
        return key;
      }
      try {
        let format = compiled.get(key);
        if (!format) {
          format = new IntlMessageFormat(message, FORMAT_LOCALE[locale]);
          compiled.set(key, format);
        }
        return String(format.format(values));
      } catch {
        report({ kind: 'format_error', key, locale });
        return key;
      }
    },
  };
}

const shared = new Map<Locale, Translator>();

/** Translator over the application catalogs (one instance per locale). */
export function createTranslator(locale: Locale): Translator {
  let translator = shared.get(locale);
  if (!translator) {
    translator = createTranslatorFor<MessageKey>(locale);
    shared.set(locale, translator);
  }
  return translator;
}
