# @nullagent/eslint-config

Comprehensive, maximally strict ESLint 9.x flat configurations for TypeScript projects.

## Philosophy

This configuration package enforces **maximum strictness** with all rules set to `error`, not `warn`. The goal is to catch issues early, enforce best practices, and maintain consistent, high-quality code across the codebase.

## Features

- **ESLint 9.x flat config format** - Modern, composable configuration
- **TypeScript strict mode** - All strict type checking rules enabled
- **Comprehensive plugin coverage**:
  - `typescript-eslint` - Strict and stylistic TypeScript rules
  - `import-x` - Import ordering, cycle detection, and module resolution
  - `unicorn` - Modern JavaScript best practices (kebab-case files, no abbreviations)
  - `sonarjs` - Cognitive complexity ≤ 10, duplicate string threshold ≤ 2
  - `security` - Security vulnerability detection
  - `no-secrets` - Prevent accidental secret commits
  - `promise` - Promise best practices and async/await patterns
  - `jsdoc` - Documentation requirements for public APIs
  - `eslint-comments` - Proper usage of eslint disable comments
  - `react` - React best practices (nextjs config only)
  - `react-hooks` - React Hooks rules (nextjs config only)
  - `jsx-a11y` - Accessibility rules (nextjs config only)
  - `@next/next` - Next.js specific rules (nextjs config only)
  - `vitest` - Test best practices (testing config only)
  - `testing-library` - Testing Library best practices (testing config only)

## Installation

```bash
pnpm add -D @nullagent/eslint-config eslint typescript
```

## Available Configurations

### Base Configuration

Core TypeScript configuration with all strict plugins. Use this for Node.js projects, libraries, or as a foundation for other configs.

```js
import { config } from "@nullagent/eslint-config/base";

export default config;
```

**Includes:**
- Strict TypeScript type checking
- Import ordering and cycle detection
- Security and secret detection
- Promise handling best practices
- JSDoc documentation requirements
- SonarJS complexity rules (cognitive complexity ≤ 10, duplicate strings ≤ 2)
- Unicorn modern JavaScript practices (kebab-case files, no abbreviations)

### Next.js Configuration

Extends base with React, React Hooks, JSX accessibility, and Next.js rules.

```js
import { config } from "@nullagent/eslint-config/nextjs";

export default config;
```

**Includes everything from base, plus:**
- React best practices and strict rules
- React Hooks exhaustive dependencies
- Full JSX accessibility checking
- Next.js specific optimizations and rules
- Automatic default export allowance for Next.js pages/layouts/routes

### Testing Configuration

Configuration for test files with strict Vitest and Testing Library rules, but relaxed TypeScript strictness where appropriate.

```js
import { config as baseConfig } from "@nullagent/eslint-config/base";
import { config as testingConfig } from "@nullagent/eslint-config/testing";

export default [...baseConfig, ...testingConfig];
```

**Includes:**
- Vitest rules with stricter limits (max 5 expects per test, max 2 nested describes)
- Testing Library best practices for React tests
- Relaxed TypeScript rules: allows `any`, non-null assertions, no explicit return types
- Disabled JSDoc requirements in tests

### Library Configuration

Extends base with enhanced documentation requirements for library packages.

```js
import { config } from "@nullagent/eslint-config/library";

export default config;
```

**Includes everything from base, plus:**
- Required JSDoc for all public APIs (functions, classes, interfaces, types)
- Explicit module boundary types
- Enforced named exports (except in index files)
- Extra caution around console and process.exit

## Combining Configurations

You can combine configurations for projects that need multiple rulesets:

```js
import { config as nextjsConfig } from "@nullagent/eslint-config/nextjs";
import { config as testingConfig } from "@nullagent/eslint-config/testing";

export default [
  ...nextjsConfig,
  ...testingConfig, // Applies to test files only
];
```

## Key Rules and Thresholds

### TypeScript Strictness
- ❌ `no-explicit-any` - No `any` types allowed
- ✅ `explicit-function-return-type` - All functions must have return types
- ✅ `no-floating-promises` - All promises must be awaited or handled
- ✅ `strict-boolean-expressions` - No truthy/falsy coercion
- ✅ `consistent-type-imports` - Use `type` imports for types
- ✅ `consistent-type-definitions` - Use `interface` over `type`

### Code Quality
- 🎯 **Cognitive complexity ≤ 10** (SonarJS) - STRICTER than most projects
- 🎯 **Duplicate string threshold ≤ 2** (SonarJS) - STRICTER than most projects
- 🔒 All security plugin rules enabled as errors
- 🔑 Secret detection with tolerance 4.5
- 📦 Import cycle detection enabled
- 🎨 Import ordering enforced (builtin → external → internal)

### File Naming
- 📁 **kebab-case** required for all files
- 🚫 No abbreviations (except common ones like `props`, `ref`, `params`)

### Testing
- 🧪 Max 5 expects per test (Vitest)
- 🧪 Max 2 nested describes (Vitest)
- 🧪 Max 50 line snapshots (Vitest)
- ✅ All Testing Library best practices enforced

## Migration from Existing Configs

### From `eslint-plugin-only-warn`
This package removes `eslint-plugin-only-warn` entirely. All rules are errors. Review your code carefully and fix issues incrementally.

### From Legacy ESLint Configs
ESLint 9 uses flat config format. Your existing `.eslintrc.*` files won't work. Replace them with `eslint.config.js` files using the examples above.

### Handling Strictness
If the strictness is too high for your current codebase:

1. **Start with base config only** - Add React/Next.js rules later
2. **Use inline disables with descriptions** - `eslint-comments/require-description` enforces this
3. **Fix incrementally** - Focus on one rule category at a time
4. **Consider the testing config** - Tests have relaxed rules by design

## Disabling Rules

When you must disable a rule, you MUST provide a description:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Third-party API requires any type
const data: any = await externalApi();
```

Without a description, `eslint-comments/require-description` will error.

## Project Ignores

The following directories are ignored by default:
- `node_modules`
- `dist`, `build`, `out`
- `.next`, `.turbo`, `.vercel`
- `coverage`
- `next-env.d.ts`

## Version Requirements

- ESLint: `^9.0.0`
- TypeScript: `^5.0.0`
- Node.js: `>=18`

## License

MIT
