import { defineConfig } from 'vitest/config';

// Integration tests run against a real PostgreSQL (no mocks). Start it with `pnpm docker:up`.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
