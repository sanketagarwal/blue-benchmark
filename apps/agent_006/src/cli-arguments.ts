/**
 * CLI argument parsing utilities for benchmark
 */

/**
 * Parse --model argument(s) from CLI arguments
 * Supports:
 * - Single model: --model model-name
 * - Comma-separated: --model a,b,c
 * - Multiple flags: --model a --model b
 *
 * @param arguments_ - Command line arguments (typically process.argv)
 * @returns Array of model IDs if --model was specified, undefined otherwise
 */
export function parseModelArgument(arguments_: string[]): string[] | undefined {
  const models: string[] = [];
  for (let index = 0; index < arguments_.length; index++) {
    // eslint-disable-next-line security/detect-object-injection -- index is bounded integer
    const current = arguments_[index];
    const nextValue = arguments_[index + 1];
    if (current === '--model' && nextValue !== undefined && nextValue !== '') {
      // Handle comma-separated values
      models.push(...nextValue.split(',').map(m => m.trim()));
    }
  }
  return models.length > 0 ? models : undefined;
}
