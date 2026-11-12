import { describe, expect, it } from 'vitest';
import { parseSemVer } from './version';

describe('parseSemVer', () => {
  it('SPEC-000-AC1 parses a valid version', () => {
    expect(parseSemVer('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('rejects an invalid version', () => {
    expect(() => parseSemVer('1.2')).toThrow('Invalid semantic version');
  });
});
