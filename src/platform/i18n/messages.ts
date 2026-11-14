import de from '../../messages/de.json' with { type: 'json' };
import en from '../../messages/en.json' with { type: 'json' };
import fr from '../../messages/fr.json' with { type: 'json' };
import type { Locale } from './locales.ts';

export interface Catalog {
  readonly [key: string]: string | Catalog;
}

type Join<Prefix extends string, Key extends string> = Prefix extends '' ? Key : `${Prefix}.${Key}`;
type Flatten<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? Join<Prefix, K> : Flatten<T[K], Join<Prefix, K>>;
}[keyof T & string];

/** Every key of the French catalog, e.g. 'home.title'. A key that does not exist does not compile. */
export type MessageKey = Flatten<typeof fr>;

export const CATALOGS: Record<Locale, Catalog> = { fr, de, en };

const flatCache = new WeakMap<Catalog, ReadonlyMap<string, string>>();

/** { a: { b: 'x' } } -> Map { 'a.b' => 'x' } (memoized per catalog). */
export function flattenCatalog(catalog: Catalog): ReadonlyMap<string, string> {
  const cached = flatCache.get(catalog);
  if (cached) return cached;
  const flat = new Map<string, string>();
  const visit = (node: Catalog, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string') flat.set(path, value);
      else visit(value, path);
    }
  };
  visit(catalog, '');
  flatCache.set(catalog, flat);
  return flat;
}
