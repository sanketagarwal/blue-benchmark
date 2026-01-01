import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/__tests__/**',
        '**/dist/**',
        '**/.next/**',
        '**/next.config.ts',
        '**/next-env.d.ts',
        '**/vitest.config.ts',
        '**/eslint.config.js',
        '**/src/app/layout.tsx',
        '**/src/app/page.tsx',
        '**/src/app/api/**',
        '**/src/benchmark.ts',
        '**/src/prefetch-warmup.ts',
        '**/src/persist-results.ts',
        '**/src/scorers/timing-metrics.ts',
        '**/scripts/**',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
