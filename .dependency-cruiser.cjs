/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'module-public-api-only',
      comment: 'A module may only import another module through its index.ts (ADR-0001).',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'platform-must-not-import-modules',
      comment: 'Platform code is generic and must not depend on business modules.',
      severity: 'error',
      from: { path: '^src/platform/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'modules-must-not-import-app',
      comment: 'Domain code must not depend on the framework glue layer (ADR-0001).',
      severity: 'error',
      from: { path: '^src/modules/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'pg-only-in-platform-db',
      comment:
        'Only the database layer may use the pg driver (ADR-0002: all SQL goes through withTenant).',
      severity: 'error',
      from: { pathNot: '^src/platform/db/' },
      to: { path: '(^|/)node_modules/pg/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.ts$' },
  },
};
