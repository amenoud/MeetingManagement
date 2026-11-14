import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CATALOGS,
  LOCALES,
  checkCatalogs,
  flattenCatalog,
  type Catalog,
  type Locale,
} from './index.ts';

const summarize = (problems: ReturnType<typeof checkCatalogs>): string[] =>
  problems.map((problem) => `${problem.locale} ${problem.key} ${problem.kind}`);

/** The French catalog as a base, with the German or English one modified by `change`. */
function catalogsWith(
  locale: Exclude<Locale, 'fr'>,
  change: (flat: Record<string, string>) => void,
) {
  const flat = Object.fromEntries(flattenCatalog(CATALOGS[locale]));
  change(flat);
  const nested: Record<string, Record<string, string>> = {};
  for (const [path, value] of Object.entries(flat)) {
    const [group, ...rest] = path.split('.');
    nested[group as string] ??= {};
    (nested[group as string] as Record<string, string>)[rest.join('.')] = value;
  }
  return { ...CATALOGS, [locale]: nested as unknown as Catalog };
}

describe('SPEC-000-AC21 message catalogs', () => {
  it('the application catalogs are consistent: same keys, same variables, valid ICU', () => {
    expect(summarize(checkCatalogs(CATALOGS))).toEqual([]);
  });

  it('exist for every supported language and are not empty', () => {
    for (const locale of LOCALES) {
      expect(flattenCatalog(CATALOGS[locale]).size, locale).toBeGreaterThan(5);
    }
  });

  it('the three languages really differ (no untranslated copy of the French text)', () => {
    const fr = flattenCatalog(CATALOGS.fr);
    for (const locale of ['de', 'en'] as const) {
      const flat = flattenCatalog(CATALOGS[locale]);
      for (const key of ['home.title', 'home.tagline', 'errors.not_found']) {
        expect(flat.get(key), `${locale} ${key}`).not.toBe(fr.get(key));
      }
    }
  });
});

describe('SPEC-000-AC21 the check itself detects problems (tests of the test)', () => {
  it('reports a key missing in a language, naming the key and the language', () => {
    const broken = catalogsWith('de', (flat) => {
      delete flat['home.tagline'];
    });
    expect(summarize(checkCatalogs(broken))).toEqual(['de home.tagline missing_key']);
  });

  it('reports an extra key', () => {
    const broken = catalogsWith('en', (flat) => {
      flat['home.surplus'] = 'Surplus';
    });
    expect(summarize(checkCatalogs(broken))).toEqual(['en home.surplus extra_key']);
  });

  it('reports an empty message', () => {
    const broken = catalogsWith('de', (flat) => {
      flat['home.title'] = '   ';
    });
    expect(summarize(checkCatalogs(broken))).toContain('de home.title empty');
  });

  it('reports a variable that differs between languages', () => {
    const base = catalogsWith('de', (flat) => {
      flat['home.status'] = 'Hallo {name}';
    });
    const both = {
      ...base,
      fr: { ...base.fr, home: { ...(base.fr['home'] as object), status: 'Bonjour {user}' } },
    };
    expect(summarize(checkCatalogs(both as typeof base))).toContain('de home.status placeholders');
  });

  it('reports invalid ICU syntax', () => {
    const broken = catalogsWith('en', (flat) => {
      flat['home.status'] = 'Count {count, plural, one {# item}';
    });
    expect(summarize(checkCatalogs(broken))).toContain('en home.status syntax');
  });

  it('reports a straight apostrophe (an ICU escape character)', () => {
    const broken = catalogsWith('en', (flat) => {
      flat['home.status'] = "It's under development";
    });
    expect(summarize(checkCatalogs(broken))).toContain('en home.status apostrophe');
  });

  it('reports HTML / rich text in a message', () => {
    const broken = catalogsWith('de', (flat) => {
      flat['home.status'] = 'Das ist <b>wichtig</b>';
    });
    expect(summarize(checkCatalogs(broken))).toContain('de home.status rich_text');
  });

  it('reports a key that does not follow the naming convention', () => {
    const broken = catalogsWith('de', (flat) => {
      flat['Home.Title2'] = 'x';
    });
    expect(summarize(checkCatalogs(broken))).toContain('de Home.Title2 bad_key_name');
  });
});

describe('error messages by code', () => {
  /** new AppError('code', ...) in non-test source files. */
  function codesUsedInSource(): string[] {
    const found = new Set<string>();
    const visit = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) visit(path);
        else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
          for (const match of readFileSync(path, 'utf8').matchAll(
            /new AppError\(\s*'([a-z0-9_]+)'/g,
          )) {
            found.add(match[1] as string);
          }
        }
      }
    };
    visit(fileURLToPath(new URL('../..', import.meta.url)));
    return [...found].sort();
  }

  it('every AppError code used in src/ has errors.<code> in all three languages', () => {
    const codes = codesUsedInSource();
    expect(codes).toContain('not_found'); // the scan really finds something
    for (const locale of LOCALES) {
      const flat = flattenCatalog(CATALOGS[locale]);
      const missing = codes.filter((code) => !flat.has(`errors.${code}`));
      expect(missing, locale).toEqual([]);
    }
  });

  it('the generic internal_error and the codes announced for the next increments exist', () => {
    for (const locale of LOCALES) {
      const flat = flattenCatalog(CATALOGS[locale]);
      for (const code of [
        'internal_error',
        'forbidden',
        'unauthenticated',
        'validation_failed',
        'rate_limited',
      ]) {
        expect(flat.has(`errors.${code}`), `${locale} ${code}`).toBe(true);
      }
    }
  });
});
