import type { ScorerResult } from '@nullagent/scorers';

/**
 * Contract ID type - must match the 9 contracts exactly
 */
export type ContractId =
  | 'dump-simple-15m-1pct'
  | 'dump-simple-15m-3pct'
  | 'dump-simple-15m-5pct'
  | 'dump-simple-1h-0.5pct'
  | 'dump-simple-1h-1pct'
  | 'dump-vol-adjusted-15m-z2'
  | 'dump-vol-adjusted-1h-z2'
  | 'dump-drawdown-1pct'
  | 'dump-drawdown-3pct';

/**
 * Input for forecast scoring
 */
export interface ForecastScorerInput {
  predictions: Record<ContractId, number>;
  actuals: Record<ContractId, boolean>;
  predictionTime: Date;
  symbolId: string;
}

/**
 * Score for an individual contract
 */
export interface ContractScore {
  contractId: ContractId;
  predicted: number;
  actual: boolean;
  brierScore: number;
  logLoss: number;
}

/**
 * Monotonicity violation
 */
export interface MonotonicityViolation {
  type: 'threshold' | 'horizon';
  contract1: ContractId;
  contract2: ContractId;
  p1: number;
  p2: number;
  expected: 'p1 >= p2' | 'p1 <= p2';
}

/**
 * Result from scoring a forecast
 */
export interface ForecastScoreResult extends ScorerResult {
  score: number;
  aggregates: {
    meanBrierScore: number;
    meanLogLoss: number;
    accuracy: number;
    eventsOccurred: number;
    monotonicityViolations: number;
  };
  perContract: ContractScore[];
  violations: MonotonicityViolation[];
}

/**
 * Running tally of scores across multiple rounds
 */
export interface RunningTally {
  roundsCompleted: number;
  cumulativeBrierScore: number;
  cumulativeLogLoss: number;
  cumulativeAccuracy: number;
  totalEventsOccurred: number;
  totalViolations: number;
  perContract: Record<
    ContractId,
    {
      totalPredictions: number;
      totalBrierScore: number;
      totalLogLoss: number;
      timesEventOccurred: number;
    }
  >;
}
