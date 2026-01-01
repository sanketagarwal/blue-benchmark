import { defineWorkspace } from 'vitest/config';

// eslint-disable-next-line import-x/no-default-export -- vitest requires default export for config
export default defineWorkspace([
  // All packages
  'packages/*/vitest.config.ts',
  // All benchmarks (3-level deep: benchmarks/category/name)
  'benchmarks/*/*/vitest.config.ts',
]);
