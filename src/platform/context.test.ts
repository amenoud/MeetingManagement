import { describe, expect, it } from 'vitest';
import {
  bindTenant,
  bindUser,
  currentContext,
  newRequestId,
  parseRequestId,
  runWithContext,
} from './context.ts';

const A = '0197b3a2-7c1e-7f00-8000-00000000000a';
const B = '0197b3a2-7c1e-7f00-8000-00000000000b';

describe('request id', () => {
  it('generates a UUID', () => {
    expect(newRequestId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps a safe inbound id', () => {
    expect(parseRequestId('req-ABC-12345678')).toBe('req-ABC-12345678');
  });

  it.each([
    ['a newline (log injection)', 'abcd1234\n{"level":"error","msg":"forged"}'],
    ['too long', 'a'.repeat(65)],
    ['too short', 'abc'],
    ['markup', '<script>alert(1)</script>'],
    ['spaces', 'abcd 1234 efgh'],
    ['empty', ''],
  ])('replaces an unsafe inbound id: %s', (_label, hostile) => {
    const id = parseRequestId(hostile);
    expect(id).not.toBe(hostile);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('generates one when absent', () => {
    expect(parseRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('request context', () => {
  it('is empty outside a context, and binding does nothing there', () => {
    expect(currentContext()).toBeUndefined();
    expect(() => bindTenant(A)).not.toThrow();
    expect(currentContext()).toBeUndefined();
  });

  it('carries the request id, then the tenant and user once bound (normalized to lowercase)', () => {
    runWithContext({ requestId: 'req-12345678' }, () => {
      expect(currentContext()).toEqual({ requestId: 'req-12345678' });
      bindTenant(A.toUpperCase());
      bindUser(B);
      expect(currentContext()).toEqual({ requestId: 'req-12345678', tenantId: A, userId: B });
    });
    expect(currentContext()).toBeUndefined();
  });

  it('refuses a tenant or user that is not a UUID', () => {
    runWithContext({}, () => {
      expect(() => bindTenant('not-a-uuid')).toThrow('Invalid tenant id');
      expect(() => bindUser("'; drop table x; --")).toThrow('Invalid user id');
    });
  });

  it('keeps concurrent requests apart across awaits', async () => {
    const seen = await Promise.all(
      [A, B].map((tenant, index) =>
        runWithContext({ requestId: `request-${index}0000000` }, async () => {
          bindTenant(tenant);
          await new Promise((resolve) => setTimeout(resolve, index === 0 ? 20 : 5));
          return currentContext();
        }),
      ),
    );
    expect(seen[0]).toEqual({ requestId: 'request-00000000', tenantId: A });
    expect(seen[1]).toEqual({ requestId: 'request-10000000', tenantId: B });
  });
});
