// Temporary home page (PLAN-PLT-02): proves language negotiation end to end. Replaced in PLT-03.
import { LOCALES } from './i18n/locales.ts';
import type { MessageKey } from './i18n/messages.ts';
import type { Translator } from './i18n/translator.ts';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** Every value coming from a catalog is escaped: messages are text, never markup. */
export function renderHomePage(translator: Translator<MessageKey>): string {
  const { t, locale } = translator;
  const links = LOCALES.map((candidate) => {
    const current = candidate === locale ? ' aria-current="true"' : '';
    return `<a href="/?lang=${candidate}" hreflang="${candidate}" lang="${candidate}"${current}>${escapeHtml(t(`language.${candidate}`))}</a>`;
  }).join(' ');
  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(t('home.title'))} – ${escapeHtml(t('app.name'))}</title>
</head>
<body>
<main>
<h1>${escapeHtml(t('home.title'))}</h1>
<p>${escapeHtml(t('home.tagline'))}</p>
<p>${escapeHtml(t('home.status'))}</p>
<nav aria-label="${escapeHtml(t('home.languageNav'))}">${links}</nav>
</main>
</body>
</html>
`;
}
