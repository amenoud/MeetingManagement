import { describe, expect, it } from 'vitest';
import { majorVersion } from './backup.ts';

describe('majorVersion', () => {
  it('reads the major version of pg_dump output', () => {
    expect(majorVersion('pg_dump (PostgreSQL) 16.14')).toBe(16);
    expect(majorVersion('pg_dump (PostgreSQL) 17.2 (Ubuntu 17.2-1.pgdg24.04+1)')).toBe(17);
    expect(majorVersion('pg_dump (PostgreSQL) 18')).toBe(18);
  });

  it('returns undefined when there is no version', () => {
    expect(majorVersion('command not found')).toBeUndefined();
  });
});
