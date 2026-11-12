import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const bin = `${root}node_modules/dependency-cruiser/bin/dependency-cruiser.mjs`;
const config = `${root}.dependency-cruiser.cjs`;

function cruise(fixture: string) {
  return spawnSync(process.execPath, [bin, 'src', '--config', config], {
    cwd: `${root}tests/fixtures/${fixture}`,
    encoding: 'utf8',
  });
}

describe('module boundaries (ADR-0001)', () => {
  it('rejects an import of another module internals', () => {
    const result = cruise('depcruise-bad');
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('module-public-api-only');
  });

  it('accepts an import through the public index', () => {
    const result = cruise('depcruise-ok');
    expect(result.status, result.stdout).toBe(0);
  });
});
