import { config as baseConfig } from "./base.js";

/**
 * ESLint configuration for library packages.
 * Extends base config with appropriate settings for reusable library code.
 * All rules are set to 'error', not 'warn'.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  ...baseConfig,

  // Library-specific configuration
  {
    rules: {
      // Libraries should have comprehensive JSDoc documentation
      "jsdoc/require-jsdoc": [
        "error",
        {
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
          },
          publicOnly: true,
          contexts: [
            "TSInterfaceDeclaration",
            "TSTypeAliasDeclaration",
            "TSEnumDeclaration",
          ],
        },
      ],
      "jsdoc/require-description": "error",
      "jsdoc/require-example": "off", // Too strict for all cases

      // Libraries should be extra careful about public APIs
      "@typescript-eslint/explicit-module-boundary-types": "error",

      // Libraries should avoid console usage
      "no-console": "error",

      // Libraries should be cautious about process.exit
      "unicorn/no-process-exit": "error",

      // Libraries should prefer named exports for better tree-shaking
      "import-x/no-default-export": "error",
    },
  },

  // Allow default exports in index files for convenience
  {
    files: ["**/index.{js,jsx,ts,tsx}"],
    rules: {
      "import-x/no-default-export": "off",
    },
  },
];
