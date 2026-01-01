import { config as nextjs } from '@nullagent/eslint-config/nextjs';
import { config as testing } from '@nullagent/eslint-config/testing';

export default [
  ...nextjs,
  {
    files: ['**/__tests__/**/*.ts', '**/*.test.ts'],
    ...testing[0],
  },
];
