import type { Scorer, ScorerResult } from './types.js';

/**
 * Factory function to create a scorer
 * @param definition - The scorer definition
 * @returns A scorer instance
 */
export function defineScorer<TInput, TResult extends ScorerResult = ScorerResult>(
  definition: Scorer<TInput, TResult>
): Scorer<TInput, TResult> {
  return definition;
}
