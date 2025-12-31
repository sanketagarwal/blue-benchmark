import { config as base } from '@nullagent/eslint-config/base';
import { config as testing } from '@nullagent/eslint-config/testing';

export default [
  ...base,
  {
    files: ['**/__tests__/**/*.ts', '**/*.test.ts'],
    ...testing[0],
  },
];
