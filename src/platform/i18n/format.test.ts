import { describe, expect, it } from 'vitest';
import { createFormatters } from './index.ts';

// Checks stable properties (separators, order, 24-hour clock), not the exact thousands separator,
// which depends on the locale data shipped with the Node version.
const winter = new Date('2026-11-14T12:00:00Z'); // CET = UTC+1
const summer = new Date('2026-07-14T12:00:00Z'); // CEST = UTC+2

describe('dates and times (Europe/Zurich by default)', () => {
  it('formats the date as day, month, year in each language', () => {
    expect(createFormatters('fr').date(winter)).toBe('14.11.2026');
    expect(createFormatters('de').date(winter)).toBe('14.11.2026');
    expect(createFormatters('en').date(winter)).toBe('14/11/2026');
  });

  it('uses the 24-hour clock, never AM/PM', () => {
    for (const locale of ['fr', 'de', 'en'] as const) {
      expect(createFormatters(locale).time(new Date('2026-11-14T14:30:00Z'))).toBe('15:30');
    }
  });

  it('follows the daylight-saving change of Zurich', () => {
    const format = createFormatters('de');
    expect(format.time(winter)).toBe('13:00');
    expect(format.time(summer)).toBe('14:00');
  });

  it('crosses midnight in the right zone', () => {
    // 23:30 UTC on 14 November is already 00:30 on the 15th in Zurich.
    const late = new Date('2026-11-14T23:30:00Z');
    expect(createFormatters('fr').dateTime(late)).toBe('15.11.2026 00:30');
  });

  it('honours another time zone (per-meeting setting)', () => {
    expect(createFormatters('en', 'UTC').time(winter)).toBe('12:00');
    expect(createFormatters('en', 'America/New_York').time(winter)).toBe('07:00');
  });

  it('refuses an unknown time zone loudly (programming error)', () => {
    expect(() => createFormatters('fr', 'Mars/Olympus')).toThrow(RangeError);
  });
});

describe('numbers', () => {
  it('uses the decimal separator of each language', () => {
    expect(createFormatters('fr').number(1234.5)).toMatch(/,5$/);
    expect(createFormatters('de').number(1234.5)).toMatch(/\.5$/);
    expect(createFormatters('en').number(1234.5)).toBe('1,234.5');
  });

  it('groups thousands in each language and accepts Intl options', () => {
    for (const locale of ['fr', 'de', 'en'] as const) {
      expect(createFormatters(locale).number(1234567)).toMatch(/^1\D234\D567$/);
    }
    expect(createFormatters('en').number(0.256, { style: 'percent' })).toBe('26%');
  });
});
