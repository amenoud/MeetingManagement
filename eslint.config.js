import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['tests/fixtures/', 'node_modules/', 'dist/', 'coverage/', '.next/', 'pnpm-lock.yaml'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-expect-error': 'allow-with-description',
          minimumDescriptionLength: 10,
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'pg',
              message: 'Only src/platform/db may import pg: use withTenant() (ADR-0002).',
            },
          ],
          patterns: [
            {
              regex: '^(@/|\\.\\./)+modules/[^/]+/.+',
              message: 'Import a module only through its public index.ts (see ADR-0001).',
            },
          ],
        },
      ],
    },
  },
  {
    // Configuration is read once, validated, in src/platform/config.ts (PLAN-PLT-01).
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read configuration through getConfig() (src/platform/config.ts).',
        },
      ],
      'no-console': 'error', // use getLogger(): logs are scrubbed and carry the request context
    },
  },
  {
    // Explicit exceptions: the configuration module and the PostgreSQL tool selection (PG_* variables).
    files: ['src/platform/config.ts', 'src/platform/db/backup.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    // The database layer, its scripts and the integration tests may talk to pg directly.
    files: [
      'src/platform/db/**/*.ts',
      'scripts/**/*.ts',
      'tests/integration/**/*.ts',
      'tests/isolation/**/*.ts',
      'tests/helpers/**/*.ts',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['*.{js,cjs,mjs}', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
