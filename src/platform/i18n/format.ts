import { DEFAULT_TIME_ZONE, FORMAT_LOCALE, type Locale } from './locales.ts';

export interface Formatters {
  /** 14.11.2026 (fr, de) or 14/11/2026 (en), in the given time zone. */
  date(value: Date | number): string;
  /** 13:05, 24-hour clock, in the given time zone. */
  time(value: Date | number): string;
  dateTime(value: Date | number): string;
  number(value: number, options?: Intl.NumberFormatOptions): string;
}

/**
 * Locale-aware formatting through Intl. The time zone defaults to Europe/Zurich (changeable per
 * meeting). Throws a RangeError at creation for an unknown time zone: that is a programming error.
 */
export function createFormatters(locale: Locale, timeZone: string = DEFAULT_TIME_ZONE): Formatters {
  const tag = FORMAT_LOCALE[locale];
  const dateFormat = new Intl.DateTimeFormat(tag, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone,
  });
  const timeFormat = new Intl.DateTimeFormat(tag, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  });
  return {
    date: (value) => dateFormat.format(value),
    time: (value) => timeFormat.format(value),
    dateTime: (value) => `${dateFormat.format(value)} ${timeFormat.format(value)}`,
    number: (value, options) => new Intl.NumberFormat(tag, options).format(value),
  };
}
