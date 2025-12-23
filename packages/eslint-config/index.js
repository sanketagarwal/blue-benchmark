/**
 * @nullagent/eslint-config
 *
 * Comprehensive, maximally strict ESLint 9.x flat configurations.
 * All rules are set to 'error', not 'warn'.
 *
 * Available configurations:
 * - base: Core TypeScript configuration with all strict plugins
 * - nextjs: Base + React, React Hooks, jsx-a11y, and Next.js rules
 * - testing: Test-specific configuration with Vitest and Testing Library
 * - library: Library-specific configuration with enhanced documentation requirements
 *
 * @example
 * ```js
 * import { config as baseConfig } from "@nullagent/eslint-config/base";
 * export default baseConfig;
 * ```
 *
 * @example
 * ```js
 * import { config as nextjsConfig } from "@nullagent/eslint-config/nextjs";
 * export default nextjsConfig;
 * ```
 *
 * @example
 * ```js
 * import { config as baseConfig } from "@nullagent/eslint-config/base";
 * import { config as testingConfig } from "@nullagent/eslint-config/testing";
 * export default [...baseConfig, ...testingConfig];
 * ```
 */

export { config as base } from "./base.js";
export { config as nextjs } from "./nextjs.js";
export { config as testing } from "./testing.js";
export { config as library } from "./library.js";
