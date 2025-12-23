/**
 * Lint-staged configuration
 * Runs ESLint on staged files
 */
export default {
  '**/*.{ts,tsx,js,jsx}': [
    'pnpm exec eslint --max-warnings=0',
  ],
};
