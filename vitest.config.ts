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
        'apps/**/src/benchmark.ts',
        // agent_000 game state is simpler and not unit tested
        'apps/agent_000/src/game-state.ts',
        // agent_004 has no unit tests yet (matrix benchmark tool)
        'apps/agent_004/src/**/*.ts',
        // agent_005 benchmark helper files (tested via integration)
        'apps/agent_005/src/matrix.ts',
        'apps/agent_005/src/results.ts',
        'apps/agent_005/src/table.ts',
        // Script files for generating chart URLs
        'apps/**/scripts/**',
        // Next.js API routes (tested via e2e)
        'apps/**/src/app/api/**',
        // Market maker agent template code (tested via benchmark)
        'apps/agent_005/src/market-maker.ts',
      ],
    },
    include: [
      'packages/**/src/**/*.test.ts',
      'packages/**/src/**/*.test.tsx',
      'packages/**/__tests__/**/*.test.ts',
      'packages/**/__tests__/**/*.test.tsx',
      'apps/**/src/**/*.test.ts',
      'apps/**/src/**/*.test.tsx',
      'apps/**/__tests__/**/*.test.ts',
      'apps/**/__tests__/**/*.test.tsx',
    ],
    exclude: [
      'node_modules',
      '.next',
      '**/node_modules/**',
    ],
  },
});
