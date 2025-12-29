import type { ScorerResult } from '@nullagent/scorers';

/**
 * Fill Contract ID type - must match the 6 fill prediction contracts exactly
 * Predicts probability that a limit order at best bid/ask fills within timeframe
 */
export type FillContractId =
  | 'bid-fill-1m'
  | 'bid-fill-5m'
  | 'bid-fill-15m'
  | 'ask-fill-1m'
  | 'ask-fill-5m'
  | 'ask-fill-15m';

/**
 * Contract ID type alias for compatibility
 */
export type ContractId = FillContractId;

// Contract ID constants to avoid string duplication
const BID_FILL_1M: FillContractId = 'bid-fill-1m';
const BID_FILL_5M: FillContractId = 'bid-fill-5m';
const BID_FILL_15M: FillContractId = 'bid-fill-15m';
const ASK_FILL_1M: FillContractId = 'ask-fill-1m';
const ASK_FILL_5M: FillContractId = 'ask-fill-5m';
const ASK_FILL_15M: FillContractId = 'ask-fill-15m';

/**
 * Fill predictions interface with strong typing for all contracts
 */
export interface FillPredictions {
  [BID_FILL_1M]: number;
  [BID_FILL_5M]: number;
  [BID_FILL_15M]: number;
  [ASK_FILL_1M]: number;
  [ASK_FILL_5M]: number;
  [ASK_FILL_15M]: number;
}

/**
 * Monotonicity rules for fill predictions
 * Each tuple [a, b] means b >= a (longer time = higher fill probability)
 */
export const FILL_MONOTONICITY_RULES: [FillContractId, FillContractId][] = [
  [BID_FILL_1M, BID_FILL_5M], // 5m >= 1m
  [BID_FILL_5M, BID_FILL_15M], // 15m >= 5m
  [ASK_FILL_1M, ASK_FILL_5M], // 5m >= 1m
  [ASK_FILL_5M, ASK_FILL_15M], // 15m >= 5m
];

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
