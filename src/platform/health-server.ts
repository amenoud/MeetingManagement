import { createServer, type Server } from 'node:http';

/**
 * Minimal HTTP server exposing GET /healthz.
 * Temporary: replaced by the Next.js application in PLT-03 (see PLAN-INF-03).
 */
export function createHealthServer(): Server {
  return createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
}
