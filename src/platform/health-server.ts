import type { Server } from 'node:http';
import { AppError } from './errors.ts';
import { createHttpServer, type HttpServerOptions } from './http.ts';

/**
 * Minimal HTTP server exposing GET /healthz.
 * Temporary: replaced by the Next.js application in PLT-03 (see PLAN-INF-03).
 */
export function createHealthServer(options: HttpServerOptions = {}): Server {
  return createHttpServer((req, res) => {
    if (req.method === 'GET' && (req.url ?? '').split('?')[0] === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    throw new AppError('not_found', 404, 'Not found');
  }, options);
}
