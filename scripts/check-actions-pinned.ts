// Fails if a GitHub Actions workflow uses an action that is not pinned by full commit SHA
// (SPEC-000 AC6). Local actions (./...) are allowed; docker:// references need a sha256 digest.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const USES = /^\s*-?\s*uses:\s*([^\s#]+)/;
const PINNED_ACTION = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/;
const PINNED_DOCKER = /^docker:\/\/\S+@sha256:[0-9a-f]{64}$/;

export interface Violation {
  line: number;
  reference: string;
}

export function findUnpinned(workflow: string): Violation[] {
  const violations: Violation[] = [];
  workflow.split('\n').forEach((text, index) => {
    const reference = USES.exec(text)?.[1];
    if (!reference || reference.startsWith('./')) return;
    if (!PINNED_ACTION.test(reference) && !PINNED_DOCKER.test(reference)) {
      violations.push({ line: index + 1, reference });
    }
  });
  return violations;
}

function main(): void {
  const dir = '.github/workflows';
  const files = readdirSync(dir).filter((name) => /\.ya?ml$/.test(name));
  let failed = false;
  for (const name of files) {
    for (const violation of findUnpinned(readFileSync(join(dir, name), 'utf8'))) {
      failed = true;
      console.error(`${dir}/${name}:${violation.line} not pinned by SHA: ${violation.reference}`);
    }
  }
  if (failed) process.exit(1);
  console.info(`All actions pinned by SHA (${files.length} workflow file(s)).`);
}

if (import.meta.main) main();
