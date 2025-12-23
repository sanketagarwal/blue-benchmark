import vitest from "eslint-plugin-vitest";
import testingLibrary from "eslint-plugin-testing-library";

import { config as baseConfig } from "./base.js";

/**
 * ESLint configuration for test files.
 * Extends base config with Vitest and Testing Library rules.
 * Relaxes some TypeScript strictness rules that are overly burdensome in tests.
 * All rules are set to 'error', not 'warn'.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  ...baseConfig,

  // Apply to test files only
  {
    files: [
      "**/*.test.{js,jsx,ts,tsx}",
      "**/*.spec.{js,jsx,ts,tsx}",
      "**/__tests__/**/*.{js,jsx,ts,tsx}",
    ],

    plugins: {
      vitest,
    },

    rules: {
      // Vitest plugin rules - all as errors, stricter than defaults
      "vitest/expect-expect": "error",
      "vitest/no-alias-methods": "error",
      "vitest/no-commented-out-tests": "error",
      "vitest/no-conditional-expect": "error",
      "vitest/no-conditional-in-test": "error",
      "vitest/no-conditional-tests": "error",
      "vitest/no-disabled-tests": "error",
      "vitest/no-done-callback": "error",
      "vitest/no-duplicate-hooks": "error",
      "vitest/no-focused-tests": "error",
      "vitest/no-identical-title": "error",
      "vitest/no-interpolation-in-snapshots": "error",
      "vitest/no-mocks-import": "error",
      "vitest/no-standalone-expect": "error",
      "vitest/no-test-prefixes": "error",
      "vitest/no-test-return-statement": "error",
      "vitest/prefer-called-with": "error",
      "vitest/prefer-comparison-matcher": "error",
      "vitest/prefer-each": "error",
      "vitest/prefer-equality-matcher": "error",
      "vitest/prefer-expect-resolves": "error",
      "vitest/prefer-hooks-in-order": "error",
      "vitest/prefer-hooks-on-top": "error",
      "vitest/prefer-lowercase-title": "error",
      "vitest/prefer-mock-promise-shorthand": "error",
      "vitest/prefer-snapshot-hint": "error",
      "vitest/prefer-spy-on": "error",
      "vitest/prefer-strict-equal": "error",
      "vitest/prefer-to-be": "error",
      "vitest/prefer-to-be-falsy": "error",
      "vitest/prefer-to-be-object": "error",
      "vitest/prefer-to-be-truthy": "error",
      "vitest/prefer-to-contain": "error",
      "vitest/prefer-to-have-length": "error",
      "vitest/prefer-todo": "error",
      "vitest/require-hook": "error",
      "vitest/require-to-throw-message": "error",
      "vitest/require-top-level-describe": "error",
      "vitest/valid-describe-callback": "error",
      "vitest/valid-expect": "error",
      "vitest/valid-title": "error",

      // Stricter rules than defaults
      "vitest/max-expects": ["error", { max: 5 }],
      "vitest/max-nested-describe": ["error", { max: 2 }],
      "vitest/no-large-snapshots": ["error", { maxSize: 50 }],

      // Relaxations for test files
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/unbound-method": "off",
      "jsdoc/require-jsdoc": "off",
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/require-param-description": "off",
      "jsdoc/require-returns-description": "off",
      "sonarjs/no-duplicate-string": "off",
      "unicorn/no-null": "off",
      "security/detect-object-injection": "off",
    },
  },

  // Testing Library rules for React test files
  {
    files: [
      "**/*.test.{jsx,tsx}",
      "**/*.spec.{jsx,tsx}",
      "**/__tests__/**/*.{jsx,tsx}",
    ],

    plugins: {
      "testing-library": testingLibrary,
    },

    rules: {
      // Testing Library plugin rules - all as errors
      "testing-library/await-async-queries": "error",
      "testing-library/await-async-utils": "error",
      "testing-library/no-await-sync-queries": "error",
      "testing-library/no-container": "error",
      "testing-library/no-debugging-utils": "error",
      "testing-library/no-dom-import": "error",
      "testing-library/no-global-regexp-flag-in-query": "error",
      "testing-library/no-manual-cleanup": "error",
      "testing-library/no-node-access": "error",
      "testing-library/no-promise-in-fire-event": "error",
      "testing-library/no-render-in-lifecycle": "error",
      "testing-library/no-unnecessary-act": "error",
      "testing-library/no-wait-for-multiple-assertions": "error",
      "testing-library/no-wait-for-side-effects": "error",
      "testing-library/no-wait-for-snapshot": "error",
      "testing-library/prefer-find-by": "error",
      "testing-library/prefer-presence-queries": "error",
      "testing-library/prefer-query-by-disappearance": "error",
      "testing-library/prefer-screen-queries": "error",
      "testing-library/render-result-naming-convention": "error",
    },
  },
];
