import { describe, expect, it } from 'vitest';
import { findUnpinned } from '../scripts/check-actions-pinned.ts';

const sha = '3d3c42e5aac5ba805825da76410c181273ba90b1';

describe('findUnpinned', () => {
  it('SPEC-000-AC6 accepts actions pinned by full SHA', () => {
    const yaml = `steps:\n  - uses: actions/checkout@${sha} # v7.0.1\n`;
    expect(findUnpinned(yaml)).toEqual([]);
  });

  it('SPEC-000-AC6 rejects a version tag', () => {
    const yaml = 'steps:\n  - uses: actions/checkout@v4\n';
    expect(findUnpinned(yaml)).toEqual([{ line: 2, reference: 'actions/checkout@v4' }]);
  });

  it('SPEC-000-AC6 rejects a branch ref and a short SHA', () => {
    const yaml = 'steps:\n  - uses: a/b@main\n  - uses: c/d@3d3c42e\n';
    expect(findUnpinned(yaml)).toHaveLength(2);
  });

  it('allows local actions and ignores comments', () => {
    const yaml = '# uses: actions/checkout@v4\nsteps:\n  - uses: ./.github/actions/x\n';
    expect(findUnpinned(yaml)).toEqual([]);
  });

  it('requires a digest for docker:// references', () => {
    expect(findUnpinned('  - uses: docker://alpine:3\n')).toHaveLength(1);
  });
});
