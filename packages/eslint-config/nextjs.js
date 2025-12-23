import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import pluginNext from "@next/eslint-plugin-next";
import globals from "globals";

import { config as baseConfig } from "./base.js";

/**
 * Maximally strict ESLint configuration for Next.js projects.
 * Extends base config with React, React Hooks, jsx-a11y, and Next.js rules.
 * All rules are set to 'error', not 'warn'.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  ...baseConfig,

  // React plugin configuration
  {
    ...pluginReact.configs.flat.recommended,
    ...pluginReact.configs.flat["jsx-runtime"],
    plugins: {
      react: pluginReact,
    },
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // Override any warnings to errors and add strict React rules
      "react/react-in-jsx-scope": "off", // Not needed with new JSX transform
      "react/jsx-no-target-blank": "error",
      "react/jsx-key": "error",
      "react/jsx-no-comment-textnodes": "error",
      "react/jsx-no-duplicate-props": "error",
      "react/jsx-no-undef": "error",
      "react/jsx-uses-react": "off", // Not needed with new JSX transform
      "react/jsx-uses-vars": "error",
      "react/no-children-prop": "error",
      "react/no-danger-with-children": "error",
      "react/no-deprecated": "error",
      "react/no-direct-mutation-state": "error",
      "react/no-find-dom-node": "error",
      "react/no-is-mounted": "error",
      "react/no-render-return-value": "error",
      "react/no-string-refs": "error",
      "react/no-unescaped-entities": "error",
      "react/no-unknown-property": "error",
      "react/no-unsafe": "error",
      "react/prop-types": "off", // Using TypeScript instead
      "react/require-render-return": "error",
      "react/self-closing-comp": "error",
      "react/jsx-boolean-value": ["error", "never"],
      "react/jsx-curly-brace-presence": [
        "error",
        { props: "never", children: "never" },
      ],
      "react/jsx-fragments": ["error", "syntax"],
      "react/jsx-no-leaked-render": "error",
      "react/jsx-no-useless-fragment": "error",
      "react/jsx-pascal-case": "error",
      "react/no-array-index-key": "error",
      "react/no-unstable-nested-components": "error",
      "react/void-dom-elements-no-children": "error",
      "react/jsx-props-no-spreading": "error",
      "react/function-component-definition": [
        "error",
        {
          namedComponents: "function-declaration",
          unnamedComponents: "arrow-function",
        },
      ],
      "react/hook-use-state": "error",
      "react/iframe-missing-sandbox": "error",
      "react/jsx-no-constructed-context-values": "error",
      "react/jsx-no-script-url": "error",
      "react/no-danger": "error",
      "react/no-namespace": "error",
      "react/prefer-stateless-function": "error",
    },
  },

  // React Hooks plugin configuration
  {
    plugins: {
      "react-hooks": pluginReactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },

  // JSX Accessibility plugin configuration
  {
    plugins: {
      "jsx-a11y": jsxA11y,
    },
    rules: {
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/aria-activedescendant-has-tabindex": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/autocomplete-valid": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/control-has-associated-label": "error",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/html-has-lang": "error",
      "jsx-a11y/iframe-has-title": "error",
      "jsx-a11y/img-redundant-alt": "error",
      "jsx-a11y/interactive-supports-focus": "error",
      "jsx-a11y/label-has-associated-control": "error",
      "jsx-a11y/lang": "error",
      "jsx-a11y/media-has-caption": "error",
      "jsx-a11y/mouse-events-have-key-events": "error",
      "jsx-a11y/no-access-key": "error",
      "jsx-a11y/no-aria-hidden-on-focusable": "error",
      "jsx-a11y/no-autofocus": "error",
      "jsx-a11y/no-distracting-elements": "error",
      "jsx-a11y/no-interactive-element-to-noninteractive-role": "error",
      "jsx-a11y/no-noninteractive-element-interactions": "error",
      "jsx-a11y/no-noninteractive-element-to-interactive-role": "error",
      "jsx-a11y/no-noninteractive-tabindex": "error",
      "jsx-a11y/no-redundant-roles": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/prefer-tag-over-role": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      "jsx-a11y/scope": "error",
      "jsx-a11y/tabindex-no-positive": "error",
    },
  },

  // Next.js plugin configuration
  {
    plugins: {
      "@next/next": pluginNext,
    },
    rules: {
      // Convert all Next.js rules to errors
      "@next/next/google-font-display": "error",
      "@next/next/google-font-preconnect": "error",
      "@next/next/inline-script-id": "error",
      "@next/next/next-script-for-ga": "error",
      "@next/next/no-assign-module-variable": "error",
      "@next/next/no-async-client-component": "error",
      "@next/next/no-before-interactive-script-outside-document": "error",
      "@next/next/no-css-tags": "error",
      "@next/next/no-document-import-in-page": "error",
      "@next/next/no-duplicate-head": "error",
      "@next/next/no-head-element": "error",
      "@next/next/no-head-import-in-document": "error",
      "@next/next/no-html-link-for-pages": "error",
      "@next/next/no-img-element": "error",
      "@next/next/no-page-custom-font": "error",
      "@next/next/no-script-component-in-head": "error",
      "@next/next/no-styled-jsx-in-document": "error",
      "@next/next/no-sync-scripts": "error",
      "@next/next/no-title-in-document-head": "error",
      "@next/next/no-typos": "error",
      "@next/next/no-unwanted-polyfillio": "error",
    },
  },

  // Overrides for Next.js specific patterns
  {
    files: [
      "**/app/**/layout.{js,jsx,ts,tsx}",
      "**/app/**/page.{js,jsx,ts,tsx}",
      "**/app/**/loading.{js,jsx,ts,tsx}",
      "**/app/**/error.{js,jsx,ts,tsx}",
      "**/app/**/not-found.{js,jsx,ts,tsx}",
      "**/app/**/template.{js,jsx,ts,tsx}",
      "**/app/**/default.{js,jsx,ts,tsx}",
      "**/app/**/route.{js,ts}",
      "**/pages/**/*.{js,jsx,ts,tsx}",
      "**/next.config.{js,mjs}",
      "**/middleware.{js,ts}",
    ],
    rules: {
      // Next.js requires default exports for pages, layouts, etc.
      "import-x/no-default-export": "off",
      // Next.js config files commonly use require
      "unicorn/prefer-module": "off",
    },
  },

  // Additional ignores for Next.js
  {
    ignores: [
      "**/.next/**",
      "**/out/**",
      "**/next-env.d.ts",
      "**/.vercel/**",
      "**/public/**",
    ],
  },
];
