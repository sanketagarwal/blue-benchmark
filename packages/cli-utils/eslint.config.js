import { config as baseConfig } from '@nullagent/eslint-config/base';
import { config as libraryConfig } from '@nullagent/eslint-config/library';
import { config as testingConfig } from '@nullagent/eslint-config/testing';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...baseConfig,
  ...libraryConfig,
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.config.ts', '**/*.config.js', '__tests__/**'],
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      // Disable turbo env var checking for library packages
      'turbo/no-undeclared-env-vars': 'off',
      // Library functions often have obvious parameters from their context
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
      // Allow nullable checks as they're clear and concise
      '@typescript-eslint/strict-boolean-expressions': 'off',
      // Allow implicit return types when obvious
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Security warnings handled by TypeScript strict mode
      'security/detect-object-injection': 'off',
      // This is a CLI library - console.log is the intended output mechanism
      'no-console': 'off',
    },
  },
  {
    files: ['__tests__/**/*.test.ts'],
    ...testingConfig[0],
  }
);
