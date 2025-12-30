import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";
import unicorn from "eslint-plugin-unicorn";
import sonarjs from "eslint-plugin-sonarjs";
import security from "eslint-plugin-security";
import noSecrets from "eslint-plugin-no-secrets";
import promisePlugin from "eslint-plugin-promise";
import jsdoc from "eslint-plugin-jsdoc";
import eslintComments from "eslint-plugin-eslint-comments";
import turboPlugin from "eslint-plugin-turbo";
import boundaries from "eslint-plugin-boundaries";

/**
 * A maximally strict ESLint configuration for TypeScript projects.
 * All rules are set to 'error', not 'warn'.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  // Base configs
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintConfigPrettier,

  // Language options
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Import plugin configuration
  {
    plugins: {
      "import-x": importX,
    },
    settings: {
      "import-x/resolver": {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
    rules: {
      // Import ordering and organization
      "import-x/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "object",
            "type",
          ],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
      "import-x/no-duplicates": "error",
      "import-x/no-cycle": "error",
      "import-x/no-self-import": "error",
      "import-x/no-useless-path-segments": "error",
      "import-x/no-unresolved": "error",
      "import-x/no-absolute-path": "error",
      "import-x/no-dynamic-require": "error",
      "import-x/no-webpack-loader-syntax": "error",
      "import-x/no-named-as-default": "error",
      "import-x/no-named-as-default-member": "error",
      "import-x/no-deprecated": "error",
      "import-x/no-mutable-exports": "error",
      "import-x/first": "error",
      "import-x/no-namespace": "error",
      "import-x/newline-after-import": "error",
      "import-x/no-default-export": "error",
    },
  },

  // Unicorn plugin configuration
  {
    plugins: {
      unicorn,
    },
    rules: {
      "unicorn/prefer-node-protocol": "error",
      "unicorn/filename-case": [
        "error",
        {
          case: "kebabCase",
        },
      ],
      "unicorn/prevent-abbreviations": [
        "error",
        {
          replacements: {
            props: false,
            ref: false,
            params: false,
          },
        },
      ],
      "unicorn/no-null": "error",
      "unicorn/prefer-module": "error",
      "unicorn/prefer-top-level-await": "error",
      "unicorn/prefer-ternary": "error",
      "unicorn/better-regex": "error",
      "unicorn/catch-error-name": "error",
      "unicorn/consistent-function-scoping": "error",
      "unicorn/custom-error-definition": "error",
      "unicorn/error-message": "error",
      "unicorn/escape-case": "error",
      "unicorn/expiring-todo-comments": "error",
      "unicorn/explicit-length-check": "error",
      "unicorn/new-for-builtins": "error",
      "unicorn/no-abusive-eslint-disable": "error",
      "unicorn/no-array-for-each": "error",
      "unicorn/no-array-reduce": "error",
      "unicorn/no-await-expression-member": "error",
      "unicorn/no-console-spaces": "error",
      "unicorn/no-for-loop": "error",
      "unicorn/no-hex-escape": "error",
      "unicorn/no-instanceof-array": "error",
      "unicorn/no-lonely-if": "error",
      "unicorn/no-negated-condition": "error",
      "unicorn/no-nested-ternary": "error",
      "unicorn/no-new-array": "error",
      "unicorn/no-new-buffer": "error",
      "unicorn/no-object-as-default-parameter": "error",
      "unicorn/no-process-exit": "error",
      "unicorn/no-static-only-class": "error",
      "unicorn/no-thenable": "error",
      "unicorn/no-this-assignment": "error",
      "unicorn/no-unreadable-array-destructuring": "error",
      "unicorn/no-unreadable-iife": "error",
      "unicorn/no-useless-fallback-in-spread": "error",
      "unicorn/no-useless-length-check": "error",
      "unicorn/no-useless-promise-resolve-reject": "error",
      "unicorn/no-useless-spread": "error",
      "unicorn/no-useless-switch-case": "error",
      "unicorn/no-useless-undefined": "error",
      "unicorn/no-zero-fractions": "error",
      "unicorn/number-literal-case": "error",
      "unicorn/numeric-separators-style": "error",
      "unicorn/prefer-add-event-listener": "error",
      "unicorn/prefer-array-find": "error",
      "unicorn/prefer-array-flat": "error",
      "unicorn/prefer-array-flat-map": "error",
      "unicorn/prefer-array-index-of": "error",
      "unicorn/prefer-array-some": "error",
      "unicorn/prefer-at": "error",
      "unicorn/prefer-code-point": "error",
      "unicorn/prefer-date-now": "error",
      "unicorn/prefer-default-parameters": "error",
      "unicorn/prefer-dom-node-append": "error",
      "unicorn/prefer-dom-node-dataset": "error",
      "unicorn/prefer-dom-node-remove": "error",
      "unicorn/prefer-dom-node-text-content": "error",
      "unicorn/prefer-event-target": "error",
      "unicorn/prefer-includes": "error",
      "unicorn/prefer-keyboard-event-key": "error",
      "unicorn/prefer-math-trunc": "error",
      "unicorn/prefer-modern-dom-apis": "error",
      "unicorn/prefer-modern-math-apis": "error",
      "unicorn/prefer-native-coercion-functions": "error",
      "unicorn/prefer-negative-index": "error",
      "unicorn/prefer-number-properties": "error",
      "unicorn/prefer-object-from-entries": "error",
      "unicorn/prefer-prototype-methods": "error",
      "unicorn/prefer-query-selector": "error",
      "unicorn/prefer-reflect-apply": "error",
      "unicorn/prefer-regexp-test": "error",
      "unicorn/prefer-set-has": "error",
      "unicorn/prefer-set-size": "error",
      "unicorn/prefer-spread": "error",
      "unicorn/prefer-string-replace-all": "error",
      "unicorn/prefer-string-slice": "error",
      "unicorn/prefer-string-starts-ends-with": "error",
      "unicorn/prefer-string-trim-start-end": "error",
      "unicorn/prefer-switch": "error",
      "unicorn/prefer-type-error": "error",
      "unicorn/relative-url-style": "error",
      "unicorn/require-array-join-separator": "error",
      "unicorn/require-number-to-fixed-digits-argument": "error",
      "unicorn/require-post-message-target-origin": "error",
      "unicorn/text-encoding-identifier-case": "error",
      "unicorn/throw-new-error": "error",
    },
  },

  // SonarJS plugin configuration
  {
    plugins: {
      sonarjs,
    },
    rules: {
      "sonarjs/cognitive-complexity": ["error", 10],
      "sonarjs/no-duplicate-string": ["error", { threshold: 2 }],
      "sonarjs/no-all-duplicated-branches": "error",
      "sonarjs/no-collapsible-if": "error",
      "sonarjs/no-collection-size-mischeck": "error",
      "sonarjs/no-duplicated-branches": "error",
      "sonarjs/no-element-overwrite": "error",
      "sonarjs/no-empty-collection": "error",
      "sonarjs/no-extra-arguments": "error",
      "sonarjs/no-gratuitous-expressions": "error",
      "sonarjs/no-identical-conditions": "error",
      "sonarjs/no-identical-expressions": "error",
      "sonarjs/no-identical-functions": "error",
      "sonarjs/no-ignored-return": "error",
      "sonarjs/no-inverted-boolean-check": "error",
      "sonarjs/no-nested-switch": "error",
      "sonarjs/no-nested-template-literals": "error",
      "sonarjs/no-redundant-boolean": "error",
      "sonarjs/no-redundant-jump": "error",
      "sonarjs/no-same-line-conditional": "error",
      "sonarjs/no-small-switch": "error",
      "sonarjs/no-unused-collection": "error",
      "sonarjs/no-use-of-empty-return-value": "error",
      "sonarjs/no-useless-catch": "error",
      "sonarjs/prefer-immediate-return": "error",
      "sonarjs/prefer-object-literal": "error",
      "sonarjs/prefer-single-boolean-return": "error",
      "sonarjs/prefer-while": "error",
    },
  },

  // Security plugin configuration
  {
    plugins: {
      security,
    },
    rules: {
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "error",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-new-buffer": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-non-literal-fs-filename": "error",
      "security/detect-non-literal-regexp": "error",
      "security/detect-non-literal-require": "error",
      "security/detect-object-injection": "error",
      "security/detect-possible-timing-attacks": "error",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-unsafe-regex": "error",
    },
  },

  // No Secrets plugin configuration
  {
    plugins: {
      "no-secrets": noSecrets,
    },
    rules: {
      "no-secrets/no-secrets": ["error", { tolerance: 4.5 }],
    },
  },

  // Promise plugin configuration
  {
    plugins: {
      promise: promisePlugin,
    },
    rules: {
      "promise/always-return": "error",
      "promise/no-return-wrap": "error",
      "promise/param-names": "error",
      "promise/catch-or-return": "error",
      "promise/no-native": "off",
      "promise/no-nesting": "error",
      "promise/no-promise-in-callback": "error",
      "promise/no-callback-in-promise": "error",
      "promise/avoid-new": "off",
      "promise/no-new-statics": "error",
      "promise/no-return-in-finally": "error",
      "promise/valid-params": "error",
      "promise/prefer-await-to-then": "error",
      "promise/prefer-await-to-callbacks": "error",
    },
  },

  // JSDoc plugin configuration
  {
    plugins: {
      jsdoc,
    },
    rules: {
      "jsdoc/check-access": "error",
      "jsdoc/check-alignment": "error",
      "jsdoc/check-param-names": "error",
      "jsdoc/check-property-names": "error",
      "jsdoc/check-tag-names": "error",
      "jsdoc/check-types": "error",
      "jsdoc/check-values": "error",
      "jsdoc/empty-tags": "error",
      "jsdoc/implements-on-classes": "error",
      "jsdoc/no-undefined-types": "error",
      "jsdoc/require-param": "error",
      "jsdoc/require-param-description": "error",
      "jsdoc/require-param-name": "error",
      "jsdoc/require-param-type": "off", // TypeScript handles types
      "jsdoc/require-property": "error",
      "jsdoc/require-property-description": "error",
      "jsdoc/require-property-name": "error",
      "jsdoc/require-property-type": "off", // TypeScript handles types
      "jsdoc/require-returns": "error",
      "jsdoc/require-returns-check": "error",
      "jsdoc/require-returns-description": "error",
      "jsdoc/require-returns-type": "off", // TypeScript handles types
      "jsdoc/require-yields": "error",
      "jsdoc/require-yields-check": "error",
      "jsdoc/valid-types": "error",
    },
  },

  // ESLint Comments plugin configuration
  {
    plugins: {
      "eslint-comments": eslintComments,
    },
    rules: {
      "eslint-comments/disable-enable-pair": "error",
      "eslint-comments/no-duplicate-disable": "error",
      "eslint-comments/no-unlimited-disable": "error",
      "eslint-comments/no-unused-disable": "error",
      "eslint-comments/no-unused-enable": "error",
      "eslint-comments/require-description": "error",
    },
  },

  // Turbo plugin configuration
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "error",
    },
  },

  // Boundaries plugin configuration - Enforce package dependency rules
  {
    plugins: {
      boundaries,
    },
    settings: {
      "boundaries/elements": [
        // Foundation layer - zero internal dependencies
        {
          type: "core-types",
          pattern: ["packages/core-types/**"],
          mode: "full",
        },
        // Data layer - depends only on core-types
        {
          type: "database",
          pattern: ["packages/database/**"],
          mode: "full",
        },
        // Contract layer - depends only on core-types
        {
          type: "contracts",
          pattern: ["packages/contracts/**"],
          mode: "full",
        },
        // UI layer - depends on core-types, contracts
        {
          type: "ui",
          pattern: ["packages/ui/**"],
          mode: "full",
        },
        // Config packages - no restrictions
        {
          type: "config",
          pattern: ["packages/eslint-config/**", "packages/typescript-config/**"],
          mode: "full",
        },
        // App layer - can depend on anything
        {
          type: "app",
          pattern: ["apps/**"],
          mode: "full",
        },
      ],
      "boundaries/ignore": ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            // core-types: CANNOT import from any @nullagent package (leaf node)
            {
              from: "core-types",
              allow: [],
              message: "@nullagent/core-types must have zero internal dependencies",
            },
            // database: can ONLY import from core-types
            {
              from: "database",
              allow: ["core-types"],
              message: "@nullagent/database can only import from @nullagent/core-types",
            },
            // contracts: can ONLY import from core-types (NOT database)
            {
              from: "contracts",
              allow: ["core-types"],
              message: "@nullagent/contracts can only import from @nullagent/core-types",
            },
            // ui: can import from core-types, contracts (NOT database)
            {
              from: "ui",
              allow: ["core-types", "contracts"],
              message: "@nullagent/ui can only import from @nullagent/core-types and @nullagent/contracts",
            },
            // apps: can import from all packages
            {
              from: "app",
              allow: ["core-types", "database", "contracts", "ui"],
            },
            // config packages: no restrictions
            {
              from: "config",
              allow: ["core-types", "database", "contracts", "ui", "config"],
            },
          ],
        },
      ],
      // Disabled: doesn't work well with per-package linting
      "boundaries/no-unknown": "off",
      "boundaries/no-unknown-files": "off",
    },
  },

  // TypeScript strict rules
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/strict-boolean-expressions": [
        "error",
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: false,
          allowNullableBoolean: false,
          allowNullableString: false,
          allowNullableNumber: false,
          allowAny: false,
        },
      ],
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/restrict-template-expressions": "error",
      "@typescript-eslint/no-confusing-void-expression": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/return-await": ["error", "always"],
      "@typescript-eslint/promise-function-async": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/prefer-readonly-parameter-types": "off", // Too strict for most cases
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },

  // General ESLint rules
  {
    rules: {
      // Ban console.log/warn/info - use BenchmarkLogger from @nullagent/cli-utils instead
      // console.error is allowed for fatal errors only
      "no-console": ["error", { allow: ["error"] }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='console'][callee.property.name='log']",
          message: "Use BenchmarkLogger from @nullagent/cli-utils instead of console.log. Import with: import { createBenchmarkLogger } from '@nullagent/cli-utils'",
        },
        {
          selector: "CallExpression[callee.object.name='console'][callee.property.name='warn']",
          message: "Use BenchmarkLogger from @nullagent/cli-utils instead of console.warn. Import with: import { createBenchmarkLogger } from '@nullagent/cli-utils'",
        },
        {
          selector: "CallExpression[callee.object.name='console'][callee.property.name='info']",
          message: "Use BenchmarkLogger from @nullagent/cli-utils instead of console.info. Import with: import { createBenchmarkLogger } from '@nullagent/cli-utils'",
        },
      ],
      "no-debugger": "error",
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "no-throw-literal": "error",
      "no-unused-expressions": "error",
      "no-unused-labels": "error",
      "no-useless-catch": "error",
      "no-useless-return": "error",
      "prefer-promise-reject-errors": "error",
      "require-atomic-updates": "error",
      "no-shadow": "off",
      "@typescript-eslint/no-shadow": "error",
      "no-use-before-define": "off",
      "@typescript-eslint/no-use-before-define": "error",
    },
  },

  // Global ignores
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/out/**",
      "**/.turbo/**",
      "**/coverage/**",
    ],
  },
];
