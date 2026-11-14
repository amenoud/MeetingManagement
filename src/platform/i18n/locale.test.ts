import { describe, expect, it } from 'vitest';
import { normalizeLocale, parseAcceptLanguage, resolveLocale } from './index.ts';

describe('normalizeLocale', () => {
  it.each([
    ['fr', 'fr'],
    ['FR', 'fr'],
    ['de-CH', 'de'],
    ['en-GB', 'en'],
    ['fr-CA', 'fr'],
  ])('%s -> %s', (tag, expected) => {
    expect(normalizeLocale(tag)).toBe(expected);
  });

  it.each(['es', 'it-CH', '', '*', 'frx', '<script>', null, undefined])('refuses %s', (tag) => {
    expect(normalizeLocale(tag)).toBeUndefined();
  });
});

describe('parseAcceptLanguage', () => {
  it('orders by quality, keeping header order for equal quality', () => {
    expect(parseAcceptLanguage('en;q=0.5, de-CH, fr;q=0.9')).toEqual(['de-CH', 'fr', 'en']);
    expect(parseAcceptLanguage('fr, de, en')).toEqual(['fr', 'de', 'en']);
  });

  it('drops q=0 (not acceptable), wildcards and malformed entries', () => {
    expect(parseAcceptLanguage('de;q=0, *;q=0.1, fr;q=abc, en')).toEqual(['en']);
  });

  it('is bounded: huge or hostile headers cannot cost much', () => {
    const many = Array.from({ length: 500 }, (_, i) => `x${i};q=0.1`).join(',');
    expect(parseAcceptLanguage(many).length).toBeLessThanOrEqual(20);
    expect(parseAcceptLanguage('a'.repeat(100_000))).toEqual([]);
    expect(parseAcceptLanguage('de\r\nX-Injected: 1')).toEqual([]);
    expect(parseAcceptLanguage(undefined)).toEqual([]);
  });
});

describe('resolveLocale', () => {
  it('falls back to French when nothing matches', () => {
    expect(resolveLocale({})).toBe('fr');
    expect(resolveLocale({ acceptLanguage: 'es, it;q=0.8' })).toBe('fr');
  });

  it('takes the best supported language of Accept-Language', () => {
    expect(resolveLocale({ acceptLanguage: 'it, de-CH;q=0.9, en;q=0.8' })).toBe('de');
    expect(resolveLocale({ acceptLanguage: 'en-GB,en;q=0.9' })).toBe('en');
  });

  it('priority: explicit choice > user > organisation > Accept-Language', () => {
    const base = { query: 'en', user: 'de', tenant: 'fr', acceptLanguage: 'fr' };
    expect(resolveLocale(base)).toBe('en');
    expect(resolveLocale({ ...base, query: undefined })).toBe('de');
    expect(resolveLocale({ ...base, query: undefined, user: null })).toBe('fr');
    expect(resolveLocale({ acceptLanguage: 'de', tenant: undefined })).toBe('de');
  });

  it('ignores an unsupported explicit choice instead of failing', () => {
    expect(resolveLocale({ query: '<script>', acceptLanguage: 'de' })).toBe('de');
    expect(resolveLocale({ query: 'xx', user: 'en' })).toBe('en');
  });
});
