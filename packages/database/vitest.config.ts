import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      lines: 90,
      functions: 90,
      branches: 90,
      statements: 90,
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/__tests__/**',
        '**/drizzle.config.ts',
        '**/eslint.config.js',
        '**/vitest.config.ts',
        '**/index.ts',
      ],
    },
  },
});
