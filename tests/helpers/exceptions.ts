import { NO_EXCEPTIONS, type IsolationExceptions } from '../../src/platform/db/index.ts';

export const REASON = 'Declared by the audit test to exercise the rule.';

/** Exceptions matching tests/isolation/fixtures/compliant.sql. */
export const compliantExceptions: IsolationExceptions = {
  ...NO_EXCEPTIONS,
  rootTables: [{ table: 'app.aud_root', column: 'id', reason: REASON, approvedIn: 'TST-01' }],
  globalTables: [{ table: 'app.aud_global', reason: REASON, approvedIn: 'TST-01' }],
};
