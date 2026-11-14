// Checks the message catalogs (same keys, same variables, valid ICU). Exit code 1 on any problem.
// Usage: pnpm i18n:check
import { CATALOGS, checkCatalogs } from '../src/platform/i18n/index.ts';

const problems = checkCatalogs(CATALOGS);
if (problems.length === 0) {
  console.info('i18n catalogs consistent (fr, de, en).');
} else {
  for (const problem of problems) {
    console.error(`${problem.locale}  ${problem.key}  ${problem.kind}: ${problem.detail}`);
  }
  console.error(`\n${problems.length} i18n problem(s).`);
  process.exit(1);
}
