// Request context propagated to every log line (PLAN-PLT-01). Uses AsyncLocalStorage, so nothing has
// to be passed by hand (and nothing can be forgotten).
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  tenantId?: string;
  userId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** An inbound request id is only trusted if it cannot inject lines or markup into a log. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

const store = new AsyncLocalStorage<RequestContext>();

export function newRequestId(): string {
  return randomUUID();
}

/** Keeps `candidate` (e.g. an X-Request-Id header) only if it is safe; otherwise generates one. */
export function parseRequestId(candidate: string | undefined): string {
  return candidate !== undefined && SAFE_REQUEST_ID.test(candidate) ? candidate : newRequestId();
}

/** Runs `fn` with a request context; the tenant and user are attached later with bindTenant/bindUser. */
export function runWithContext<T>(options: { requestId?: string | undefined }, fn: () => T): T {
  return store.run({ requestId: parseRequestId(options.requestId) }, fn);
}

export function currentContext(): Readonly<RequestContext> | undefined {
  return store.getStore();
}

function toUuid(value: string, what: string): string {
  const id = typeof value === 'string' ? value.toLowerCase() : '';
  if (!UUID.test(id)) throw new Error(`Invalid ${what}: a UUID is required`);
  return id;
}

/** Attaches the tenant to the current context. Does nothing outside a context (scripts, tests). */
export function bindTenant(tenantId: string): void {
  const context = store.getStore();
  if (context) context.tenantId = toUuid(tenantId, 'tenant id');
}

/** Attaches the user to the current context. Does nothing outside a context. */
export function bindUser(userId: string): void {
  const context = store.getStore();
  if (context) context.userId = toUuid(userId, 'user id');
}
