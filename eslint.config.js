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
    // The database layer, its scripts and the integration tests may talk to pg directly.
    files: ['src/platform/db/**/*.ts', 'scripts/**/*.ts', 'tests/integration/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['*.{js,cjs,mjs}', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
