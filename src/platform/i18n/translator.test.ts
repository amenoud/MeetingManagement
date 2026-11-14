import { describe, expect, it } from 'vitest';
import {
  createTranslator,
  createTranslatorFor,
  type Catalog,
  type Locale,
  type Problem,
} from './index.ts';

// Catalogs written for the test: they exercise ICU features the application does not use yet.
const catalogs: Record<Locale, Catalog> = {
  fr: {
    items: '{count, plural, =0 {Aucun élément} one {# élément} other {# éléments}}',
    greeting: '{role, select, chair {Président} other {Membre}} {name}',
    price: 'Prix : {amount, number}',
    onlyFrench: 'Seulement en français',
    broken: 'Valeur : {amount, number}',
  },
  de: {
    items: '{count, plural, =0 {Keine Elemente} one {# Element} other {# Elemente}}',
    greeting: '{role, select, chair {Vorsitz} other {Mitglied}} {name}',
    price: 'Preis: {amount, number}',
    broken: 'Wert: {amount, number}',
  },
  en: {
    items: '{count, plural, =0 {No items} one {# item} other {# items}}',
    greeting: '{role, select, chair {Chair} other {Member}} {name}',
    price: 'Price: {amount, number}',
    broken: 'Value: {amount, number}',
  },
};

function translator(locale: Locale) {
  const problems: Problem[] = [];
  return {
    problems,
    t: createTranslatorFor<string>(locale, {
      catalogs,
      onProblem: (problem) => problems.push(problem),
    }),
  };
}

describe('translator: ICU plurals and select, in every language', () => {
  it.each([
    ['fr', 0, 'Aucun élément'],
    ['fr', 1, '1 élément'],
    ['fr', 5, '5 éléments'],
    ['de', 0, 'Keine Elemente'],
    ['de', 1, '1 Element'],
    ['de', 5, '5 Elemente'],
    ['en', 0, 'No items'],
    ['en', 1, '1 item'],
    ['en', 5, '5 items'],
  ] as const)('%s plural of %i', (locale, count, expected) => {
    expect(translator(locale).t.t('items', { count })).toBe(expected);
  });

  it('selects on a value', () => {
    expect(translator('fr').t.t('greeting', { role: 'chair', name: 'Dupont' })).toBe(
      'Président Dupont',
    );
    expect(translator('de').t.t('greeting', { role: 'x', name: 'Muster' })).toBe('Mitglied Muster');
    expect(translator('en').t.t('greeting', { role: 'chair', name: 'Smith' })).toBe('Chair Smith');
  });

  it('formats a number argument with the Swiss/British conventions of the language', () => {
    const fr = translator('fr').t.t('price', { amount: 1234.5 });
    const de = translator('de').t.t('price', { amount: 1234.5 });
    const en = translator('en').t.t('price', { amount: 1234.5 });
    expect(fr).toMatch(/^Prix : 1\D?234,5$/); // decimal comma, some grouping separator
    expect(de).toMatch(/^Preis: 1\D?234\.5$/); // decimal point in Switzerland
    expect(en).toBe('Price: 1,234.5');
  });
});

describe('translator: it never throws', () => {
  it('falls back to French for a key absent from the language, then reports nothing', () => {
    const { t, problems } = translator('de');
    expect(t.t('onlyFrench')).toBe('Seulement en français');
    expect(problems).toEqual([]);
  });

  it('returns the key itself and reports a key that exists nowhere', () => {
    const { t, problems } = translator('en');
    expect(t.t('does.not.exist')).toBe('does.not.exist');
    expect(problems).toEqual([{ kind: 'missing_message', key: 'does.not.exist', locale: 'en' }]);
  });

  it('returns the key and reports a message that cannot be formatted (missing value)', () => {
    const { t, problems } = translator('fr');
    expect(t.t('broken')).toBe('broken');
    expect(problems).toEqual([{ kind: 'format_error', key: 'broken', locale: 'fr' }]);
  });

  it('answers has() for known and unknown keys', () => {
    const { t } = translator('de');
    expect(t.has('items')).toBe(true);
    expect(t.has('onlyFrench')).toBe(true); // through the French fallback
    expect(t.has('nope')).toBe(false);
  });

  it('logs a missing key without any value (default reporter)', () => {
    // The default reporter writes an i18n.* line with the key and the locale only.
    expect(() => createTranslator('de').t('home.title')).not.toThrow();
  });
});

describe('translator over the application catalogs', () => {
  it('translates the application keys in each language', () => {
    expect(createTranslator('fr').t('home.title')).toBe('Gestion de séances de comité');
    expect(createTranslator('de').t('home.title')).toBe('Sitzungsverwaltung für Gremien');
    expect(createTranslator('en').t('home.title')).toBe('Committee meeting management');
  });

  it('refuses an unknown key at compile time', () => {
    // @ts-expect-error the key does not exist in the French catalog: it must not compile
    const message = createTranslator('fr').t('home.does_not_exist');
    expect(message).toBe('home.does_not_exist');
  });

  it('reuses one translator per language', () => {
    expect(createTranslator('de')).toBe(createTranslator('de'));
  });
});
