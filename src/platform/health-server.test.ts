import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { escapeHtml, renderHomePage } from './home-page.ts';
import {
  CATALOGS,
  createTranslator,
  createTranslatorFor,
  flattenCatalog,
  type Catalog,
} from './i18n/index.ts';
import type { MessageKey } from './i18n/index.ts';
import { createHealthServer } from './health-server.ts';
import { createLogger } from './logger.ts';

const servers: ReturnType<typeof createHealthServer>[] = [];

async function start(): Promise<string> {
  const server = createHealthServer({
    logger: createLogger({ destination: { write: () => undefined } }),
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const message = (locale: 'fr' | 'de' | 'en', key: string): string =>
  flattenCatalog(CATALOGS[locale]).get(key) as string;

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

describe('health server', () => {
  it('SPEC-000-AC15 answers 200 on /healthz', async () => {
    const response = await fetch(`${await start()}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});

describe('SPEC-000-AC21 temporary home page in three languages', () => {
  it.each(['fr', 'de', 'en'] as const)('shows the page in %s with ?lang=', async (locale) => {
    const response = await fetch(`${await start()}/?lang=${locale}`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('content-language')).toBe(locale);
    expect(response.headers.get('vary')).toContain('Accept-Language');
    expect(html).toContain(`<html lang="${locale}">`);
    for (const key of ['home.title', 'home.tagline', 'home.status']) {
      expect(html, `${locale} ${key}`).toContain(escapeHtml(message(locale, key)));
    }
  });

  it('negotiates the language from Accept-Language, with quality values', async () => {
    const base = await start();
    const get = async (acceptLanguage: string) =>
      (await fetch(`${base}/`, { headers: { 'Accept-Language': acceptLanguage } })).headers.get(
        'content-language',
      );
    expect(await get('de-CH,de;q=0.9,en;q=0.8')).toBe('de');
    expect(await get('en;q=0.2, de;q=0.9')).toBe('de');
    expect(await get('en-GB')).toBe('en');
    expect(await get('it, es;q=0.5')).toBe('fr'); // unsupported: French
    expect(await get('')).toBe('fr');
  });

  it('an explicit ?lang= beats Accept-Language', async () => {
    const response = await fetch(`${await start()}/?lang=en`, {
      headers: { 'Accept-Language': 'de' },
    });
    expect(response.headers.get('content-language')).toBe('en');
  });

  it('offers the three languages and marks only the current one', async () => {
    const html = await (await fetch(`${await start()}/?lang=de`)).text();
    for (const locale of ['fr', 'de', 'en']) expect(html).toContain(`href="/?lang=${locale}"`);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="true">Deutsch</);
  });

  it('never reflects a hostile ?lang= value', async () => {
    const response = await fetch(`${await start()}/?lang=%3Cscript%3Ealert(1)%3C/script%3E`);
    const html = await response.text();
    expect(response.headers.get('content-language')).toBe('fr');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  function pageFor(texts: { title: string; tagline: string; status: string }): string {
    const hostile: Catalog = {
      app: { name: 'App' },
      home: { ...texts, languageNav: 'x' },
      language: { fr: 'F', de: 'D', en: 'E' },
    };
    const translator = createTranslatorFor<MessageKey>('fr', {
      catalogs: { fr: hostile, de: hostile, en: hostile },
    });
    return renderHomePage(translator);
  }

  it('escapes every catalog value: messages are text, never markup', () => {
    const html = pageFor({ title: 'a < b & "c"', tagline: "d > e ' f", status: 'plain' });
    expect(html).toContain('a &lt; b &amp; &quot;c&quot;');
    expect(html).toContain('d &gt; e &#39; f');
  });

  it('a message that looks like a tag never reaches the page as markup', () => {
    const html = pageFor({ title: '<script>alert(1)</script>', tagline: 'x', status: 'y' });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert(1)');
  });
});

describe('SPEC-000-AC21 error responses in the language of the request', () => {
  it.each(['fr', 'de', 'en'] as const)('answers 404 in %s', async (locale) => {
    const response = await fetch(`${await start()}/other`, {
      headers: { 'Accept-Language': locale },
    });
    expect(response.status).toBe(404);
    expect(response.headers.get('content-language')).toBe(locale);
    expect(response.headers.get('vary')).toContain('Accept-Language');
    const body = (await response.json()) as {
      error: { code: string; message: string; requestId: string };
    };
    expect(body.error.code).toBe('not_found');
    expect(body.error.message).toBe(message(locale, 'errors.not_found'));
    expect(body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('the three messages differ', () => {
    const messages = (['fr', 'de', 'en'] as const).map((l) =>
      createTranslator(l).t('errors.not_found'),
    );
    expect(new Set(messages).size).toBe(3);
  });
});
