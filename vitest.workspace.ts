import { defineWorkspace } from 'vitest/config';

// eslint-disable-next-line import-x/no-default-export -- vitest requires default export for config
export default defineWorkspace([
  // All packages
  'packages/*/vitest.config.ts',
  // All apps
  'apps/*/vitest.config.ts',
]);
