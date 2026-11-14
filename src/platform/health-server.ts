import type { Server } from 'node:http';
import { AppError } from './errors.ts';
import { renderHomePage } from './home-page.ts';
import { createTranslator } from './i18n/translator.ts';
import { localeOfRequest } from './i18n/request.ts';
import { createHttpServer, type HttpServerOptions } from './http.ts';

/**
 * Minimal HTTP server: GET /healthz and a temporary localized home page (GET /).
 * Temporary: replaced by the Next.js application in PLT-03 (see PLAN-INF-03, PLAN-PLT-02).
 */
export function createHealthServer(options: HttpServerOptions = {}): Server {
  return createHttpServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && path === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.method === 'GET' && path === '/') {
      const translator = createTranslator(localeOfRequest(req));
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Language': translator.locale,
        Vary: 'Accept-Language',
        'Cache-Control': 'no-store',
      });
      res.end(renderHomePage(translator));
      return;
    }
    throw new AppError('not_found', 404, 'Not found');
  }, options);
}
