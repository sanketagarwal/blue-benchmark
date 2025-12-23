/**
 * Base result type that all scorers must return
 */
export interface ScorerResult {
  score: number;
  [key: string]: unknown;
}

/**
 * Scorer definition
 */
export interface Scorer<TInput, TResult extends ScorerResult = ScorerResult> {
  id: string;
  name: string;
  score(input: TInput): TResult | Promise<TResult>;
}

/**
 * Parameters for saving a score to the database
 */
export interface SaveScoreParams {
  traceId: string;
  agentId: string;
  roundNumber: number;
  scorerId: string;
  result: ScorerResult;
}
