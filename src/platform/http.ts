// Request wrapper shared by every HTTP entry point (PLAN-PLT-01): request context, access log, safe errors.
// Temporary home: PLT-03 plugs the same behaviour into the real web framework.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { currentContext, runWithContext } from './context.ts';
import { AppError, toHttpError } from './errors.ts';
import { getLogger, type Logger } from './logger.ts';

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

export interface HttpServerOptions {
  logger?: Logger;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Wraps `handler` so that every request:
 * - gets a request context (an inbound X-Request-Id is kept only if it is safe) echoed in the response;
 * - writes ONE access log line with the method, the path WITHOUT its query string, the status and duration;
 * - turns any thrown error into a generic response, logging the (scrubbed) error with the request id.
 */
export function createHttpServer(handler: RequestHandler, options: HttpServerOptions = {}): Server {
  return createServer((req, res) => {
    const log = options.logger ?? getLogger();
    runWithContext({ requestId: firstHeader(req.headers['x-request-id']) }, () => {
      const context = currentContext();
      if (!context) throw new Error('request context missing'); // cannot happen inside runWithContext
      res.setHeader('X-Request-Id', context.requestId);
      const started = performance.now();
      // Node keeps the request context across this callback, also on keep-alive connections (tested).
      res.on('finish', () =>
        log.info(
          {
            method: req.method,
            path: (req.url ?? '').split('?')[0],
            status: res.statusCode,
            duration_ms: Math.round(performance.now() - started),
          },
          'http.request',
        ),
      );

      Promise.resolve()
        .then(() => handler(req, res))
        .catch((error: unknown) => {
          const expected = error instanceof AppError;
          log[expected ? 'warn' : 'error']({ err: error }, 'http.error');
          if (res.headersSent) {
            res.destroy();
            return;
          }
          const { status, body } = toHttpError(error, context.requestId);
          res.writeHead(status, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          res.end(JSON.stringify(body));
        });
    });
  });
}
