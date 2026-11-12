import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      // Only enforced once business modules exist (empty include => no files, no failure).
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
