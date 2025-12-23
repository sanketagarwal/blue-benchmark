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
        '**/*.config.ts',
        '**/*.config.js',
        '**/*.config.mjs',
        '.next/**',
        '**/dist/**',
        '**/coverage/**',
        'packages/eslint-config/**',
        'packages/typescript-config/**',
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
