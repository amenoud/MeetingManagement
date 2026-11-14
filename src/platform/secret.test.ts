import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { Secret } from './secret.ts';

describe('Secret', () => {
  const secret = new Secret('s3cr3t-value');

  it('reveals the value only through reveal()', () => {
    expect(secret.reveal()).toBe('s3cr3t-value');
  });

  it('SPEC-000-AC18 hides the value in string, JSON, inspect and template output', () => {
    const outputs = [
      String(secret),
      `${secret}`,
      JSON.stringify({ secret }),
      inspect(secret),
      inspect({ nested: { secret } }, { depth: 5 }),
    ];
    for (const output of outputs) expect(output).not.toContain('s3cr3t-value');
  });

  it('does not expose the value as an own property', () => {
    expect(Object.keys(secret)).toEqual([]);
    expect(JSON.stringify(Object.getOwnPropertyNames(secret))).not.toContain('value');
  });
});
