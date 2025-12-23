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
      // Allow type assertions needed for AI SDK compatibility
      '@typescript-eslint/no-unsafe-assignment': 'off',
      // Library functions often have obvious parameters from their context
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns': 'off',
      // Allow nullable checks as they're clear and concise
      '@typescript-eslint/strict-boolean-expressions': 'off',
      // Allow implicit return types when obvious
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Type parameters are sometimes needed for generic constraints
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      // Optional chain not always more readable
      '@typescript-eslint/prefer-optional-chain': 'off',
      // Cognitive complexity is subjective for orchestration functions
      'sonarjs/cognitive-complexity': ['error', 15],
      // Security warnings handled by TypeScript strict mode
      'security/detect-object-injection': 'off',
      // Unnecessary conditional check is sometimes needed for exhaustiveness
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
  {
    files: ['__tests__/**/*.test.ts'],
    ...testingConfig[0],
  }
);
