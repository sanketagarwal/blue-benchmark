import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// eslint-disable-next-line import-x/no-default-export -- vitest requires default export for config
export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
        minThreads: 1,
        maxThreads: 4,
      },
    },
    fileParallelism: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
      exclude: [
        'node_modules/**',
        '**/node_modules/**',
        '**/*.d.ts',
        '**/index.ts',
        '**/types.ts', // Type definitions don't need coverage
        '**/*.config.ts',
        '**/*.config.js',
        '**/*.config.mjs',
        '.next/**',
        '**/.next/**', // Next.js build output in any location
        '**/dist/**',
        '**/coverage/**',
        '**/__tests__/**', // Test files don't need coverage
        '**/*.test.ts', // Test files don't need coverage
        '**/*.test.tsx', // Test files don't need coverage
        'packages/eslint-config/**',
        'packages/typescript-config/**',
        // Database schema definitions are declarative, not testable
        'packages/database/src/schema/**',
        // Database operations tested via integration
        'packages/scorers/src/save-score.ts',
        // CLI benchmark entry points don't need unit tests
        'benchmarks/**/src/benchmark.ts',
        // bottom-caller CLI utilities (tested via integration)
        'benchmarks/trading/006-bottom-caller/src/prefetch-warmup.ts',
        'benchmarks/trading/006-bottom-caller/src/persist-results.ts',
        'benchmarks/trading/006-bottom-caller/src/scorers/timing-metrics.ts',
        // twenty-questions game state is simpler and not unit tested
        'benchmarks/tutorials/000-twenty-questions/src/game-state.ts',
        // matrix-eval has no unit tests yet (matrix benchmark tool)
        'benchmarks/tutorials/004-matrix-eval/src/**/*.ts',
        // market-maker benchmark helper files (tested via integration)
        'benchmarks/trading/005-market-maker/src/matrix.ts',
        'benchmarks/trading/005-market-maker/src/results.ts',
        'benchmarks/trading/005-market-maker/src/table.ts',
        // Script files for generating chart URLs
        'benchmarks/**/scripts/**',
        // Next.js API routes (tested via e2e)
        'benchmarks/**/src/app/api/**',
        // Market maker agent template code (tested via benchmark)
        'benchmarks/trading/005-market-maker/src/market-maker.ts',
      ],
    },
    include: [
      'packages/**/src/**/*.test.ts',
      'packages/**/src/**/*.test.tsx',
      'packages/**/__tests__/**/*.test.ts',
      'packages/**/__tests__/**/*.test.tsx',
      'benchmarks/**/src/**/*.test.ts',
      'benchmarks/**/src/**/*.test.tsx',
      'benchmarks/**/__tests__/**/*.test.ts',
      'benchmarks/**/__tests__/**/*.test.tsx',
    ],
    exclude: [
      'node_modules',
      '.next',
      '**/node_modules/**',
    ],
  },
});
