import type { AddressInfo } from 'node:net';
import { Agent, request as httpRequest, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { bindTenant } from './context.ts';
import { AppError } from './errors.ts';
import { createHttpServer, type RequestHandler } from './http.ts';
import { createTranslator } from './i18n/translator.ts';
import { createLogger } from './logger.ts';

const TENANT = '0197b3a2-7c1e-7f00-8000-00000000000a';
const servers: Server[] = [];

function collector() {
  const lines: string[] = [];
  return {
    destination: {
      write(chunk: string) {
        lines.push(chunk);
      },
    },
    raw: () => lines.join(''),
    entries: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

async function start(handler: RequestHandler) {
  const sink = collector();
  const server = createHttpServer(handler, {
    logger: createLogger({ destination: sink.destination }),
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, sink };
}

/** The access log line is written when the response is finished: wait for it. */
async function accessLine(sink: ReturnType<typeof collector>) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const found = sink.entries().find((entry) => entry['msg'] === 'http.request');
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('no http.request line was logged');
}

const ok: RequestHandler = (_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end('{}');
};

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

describe('SPEC-000-AC18 HTTP: request id, tenant and no leak in the logs', () => {
  it('echoes a safe X-Request-Id and writes it, the method, the path and the status in the access log', async () => {
    const { base, sink } = await start(ok);
    const response = await fetch(`${base}/api/meetings`, {
      headers: { 'X-Request-Id': 'req-abcdef12' },
    });
    expect(response.headers.get('x-request-id')).toBe('req-abcdef12');
    expect(await accessLine(sink)).toMatchObject({
      msg: 'http.request',
      level: 'info',
      request_id: 'req-abcdef12',
      method: 'GET',
      path: '/api/meetings',
      status: 200,
    });
    expect(typeof (await accessLine(sink))['duration_ms']).toBe('number');
  });

  it('keeps each request id on its own access line when requests share one keep-alive connection', async () => {
    const { base, sink } = await start((req, res) => {
      bindTenant(req.url === '/a' ? TENANT : '0197b3a2-7c1e-7f00-8000-00000000000b');
      ok(req, res);
    });
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    const get = (path: string, id: string) =>
      new Promise<void>((resolve, reject) => {
        const request = httpRequest(
          `${base}${path}`,
          { agent, headers: { 'X-Request-Id': id } },
          (response) => {
            response.resume();
            response.on('end', resolve);
          },
        );
        request.on('error', reject);
        request.end();
      });
    try {
      await get('/a', 'req-aaaaaaaa');
      await get('/b', 'req-bbbbbbbb');
      for (let attempt = 0; attempt < 50 && sink.entries().length < 2; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      agent.destroy();
    }
    const lines = sink.entries().filter((entry) => entry['msg'] === 'http.request');
    const byPath = Object.fromEntries(lines.map((line) => [line['path'], line]));
    expect(byPath['/a']).toMatchObject({ request_id: 'req-aaaaaaaa', tenant_id: TENANT });
    expect(byPath['/b']).toMatchObject({
      request_id: 'req-bbbbbbbb',
      tenant_id: '0197b3a2-7c1e-7f00-8000-00000000000b',
    });
  });

  it('replaces an unsafe inbound X-Request-Id by a generated UUID', async () => {
    const { base, sink } = await start(ok);
    const response = await fetch(`${base}/x`, { headers: { 'X-Request-Id': 'bad id! <script>' } });
    const id = response.headers.get('x-request-id');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await accessLine(sink))['request_id']).toBe(id);
  });

  it('adds tenant_id to the access log once a handler bound the tenant', async () => {
    const { base, sink } = await start((req, res) => {
      bindTenant(TENANT);
      ok(req, res);
    });
    await fetch(`${base}/x`);
    expect(await accessLine(sink)).toMatchObject({ tenant_id: TENANT });
  });

  it('logs neither the query string, nor the Authorization header, nor the cookie, nor a token in the path', async () => {
    const bearer = ['abc123', 'SECRET', 'token456xyz'].join('');
    const session = ['SESSIONVALUE', '9f8e7d6c5b4a'].join('-');
    const queryToken = ['tok', '9a8b7c6d5e4f3a2b1c0d'].join('');
    const pathToken = ['a1B2c3D4', 'e5F6g7H8', 'i9J0k1L2', 'm3N4o5P6'].join('');
    const { base, sink } = await start(ok);
    await fetch(`${base}/reset/${pathToken}?token=${queryToken}&email=jean.dupont@example.test`, {
      headers: { Authorization: `Bearer ${bearer}`, Cookie: `sid=${session}` },
    });
    const line = await accessLine(sink);
    const raw = sink.raw();
    for (const value of [bearer, session, queryToken, pathToken, 'jean.dupont']) {
      expect(raw, value).not.toContain(value);
    }
    expect(line['path']).not.toContain('?');
  });
});

describe('SPEC-000-AC18 HTTP: errors', () => {
  const leaks = ['row-value-secret', 'param-secret-value', 'Failed query', 'insert into'];

  function databaseFailure(): Error {
    const driver = Object.assign(new Error('duplicate key ... row-value-secret'), {
      code: '23505',
      severity: 'ERROR',
      detail: 'Key (name)=(row-value-secret) already exists.',
      table: 'iso_parent',
      constraint: 't_name_key',
    });
    return Object.assign(
      new Error('Failed query: insert into app.t (name) values ($1)\nparams: param-secret-value', {
        cause: driver,
      }),
      { query: 'insert into app.t (name) values ($1)', params: ['param-secret-value'] },
    );
  }

  it('answers an unexpected error with a generic 500 carrying the request id, and logs only value-free fields', async () => {
    const { base, sink } = await start(() => {
      throw databaseFailure();
    });
    const response = await fetch(`${base}/x`, { headers: { 'X-Request-Id': 'req-abcdef12' } });
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; requestId: string } };
    expect(body.error).toMatchObject({ code: 'internal_error', requestId: 'req-abcdef12' });
    await accessLine(sink);

    const responseText = JSON.stringify(body);
    const raw = sink.raw();
    for (const leak of leaks) {
      expect(responseText, `response: ${leak}`).not.toContain(leak);
      expect(raw, `log: ${leak}`).not.toContain(leak);
    }
    const error = sink.entries().find((entry) => entry['msg'] === 'http.error');
    expect(error).toMatchObject({ level: 'error', request_id: 'req-abcdef12' });
    expect(raw).toContain('23505');
    expect(raw).toContain('t_name_key');
  });

  it('answers an AppError with its status and code, in the language of the catalogs, logged as a warning', async () => {
    const { base, sink } = await start(() => {
      throw new AppError('forbidden', 403, 'English fallback, never shown for a known code.');
    });
    const response = await fetch(`${base}/x`);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: 'forbidden', message: createTranslator('fr').t('errors.forbidden') },
    });
    await accessLine(sink);
    expect(sink.entries().find((entry) => entry['msg'] === 'http.error')).toMatchObject({
      level: 'warn',
    });
  });

  it('shows the default message of an AppError whose code has no catalog entry', async () => {
    const { base } = await start(() => {
      throw new AppError('custom_unlisted_code', 409, 'Default message.');
    });
    const response = await fetch(`${base}/x`);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'custom_unlisted_code', message: 'Default message.' },
    });
  });

  it('survives an asynchronous failure inside the handler', async () => {
    const { base } = await start(async () => {
      await Promise.resolve();
      throw new Error('async boom with param-secret-value');
    });
    const response = await fetch(`${base}/x`);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('param-secret-value');
  });
});
