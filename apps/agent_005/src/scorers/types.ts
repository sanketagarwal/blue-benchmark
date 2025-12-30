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
  // Optional extended inputs for delta-mid, PnL, and EV calculations
  deltaMidPredictions?: Record<string, number>;
  deltaMidActuals?: Record<string, number | undefined>;
  deltaMidATRs?: Record<string, number | undefined>;
  fillDetails?: Record<string, { filled: boolean; fillPrice?: number }>;
  exitMids?: Record<string, number | undefined>;
  fillPrices?: { bestBid: number; bestAsk: number };
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
 * Aggregated PnL result (imported from pnl-calculator)
 */
export interface AggregatedPnL {
  meanPnL: number;
  totalPnL: number;
  filledCount: number;
  pnlBySide: Record<'bid' | 'ask', number>;
  pnlByHorizon: Record<'1m' | '5m' | '15m', number>;
}

/**
 * Aggregated EV result (imported from ev-calculator)
 */
export interface EVAggregate {
  meanEV: number;
  totalEV: number;
  evBySide: Record<'bid' | 'ask', number>;
  evByHorizon: Record<'1m' | '5m' | '15m', number>;
}

/**
 * EV-PnL gap analysis result
 */
export interface EVPnLGapResult {
  gap: number;
  gapVariance: number;
  systematicOverestimation: boolean;
}

/**
 * Delta-mid aggregates
 */
export interface DeltaMidAggregates {
  meanMAE: number;
  meanMSE: number;
  meanBias: number;
  sampleCount: number;
}

/**
 * Delta-mid scorer result
 */
export interface DeltaMidScorerResult {
  scores: DeltaMidContractScore[];
  aggregates: DeltaMidAggregates;
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
  // Optional extended results
  deltaMidScores?: ExtendedDeltaMidScorerResult;
  pnlResults?: AggregatedPnL;
  evResults?: EVAggregate;
  evPnlGap?: EVPnLGapResult;
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

// ============================================================================
// EV Benchmark Extension Types
// ============================================================================

/**
 * Delta-Mid Contract ID type - predicts price movement from mid at fill time
 * Values are in basis points (1 bp = 0.01%)
 */
export type DeltaMidContractId =
  | 'bid-delta-mid-1m'
  | 'bid-delta-mid-5m'
  | 'bid-delta-mid-15m'
  | 'ask-delta-mid-1m'
  | 'ask-delta-mid-5m'
  | 'ask-delta-mid-15m';

/**
 * All contract types - fill probability and delta-mid predictions
 */
export type AllContractId = FillContractId | DeltaMidContractId;

// Delta-Mid Contract ID constants to avoid string duplication
const BID_DELTA_MID_1M: DeltaMidContractId = 'bid-delta-mid-1m';
const BID_DELTA_MID_5M: DeltaMidContractId = 'bid-delta-mid-5m';
const BID_DELTA_MID_15M: DeltaMidContractId = 'bid-delta-mid-15m';
const ASK_DELTA_MID_1M: DeltaMidContractId = 'ask-delta-mid-1m';
const ASK_DELTA_MID_5M: DeltaMidContractId = 'ask-delta-mid-5m';
const ASK_DELTA_MID_15M: DeltaMidContractId = 'ask-delta-mid-15m';

/**
 * Array of all delta-mid contract IDs for iteration
 */
export const DELTA_MID_CONTRACT_IDS: DeltaMidContractId[] = [
  BID_DELTA_MID_1M,
  BID_DELTA_MID_5M,
  BID_DELTA_MID_15M,
  ASK_DELTA_MID_1M,
  ASK_DELTA_MID_5M,
  ASK_DELTA_MID_15M,
];

/**
 * Fixed trading fee in basis points (1 bp = 0.01%)
 */
export const FIXED_FEE_BPS = 1;

/**
 * Fixed trading fee as decimal (1 bp = 0.0001)
 */
export const FIXED_FEE = 0.0001;

/**
 * Delta-Mid predictions interface - predicted price movement in bps
 */
export interface DeltaMidPredictions {
  [BID_DELTA_MID_1M]: number;
  [BID_DELTA_MID_5M]: number;
  [BID_DELTA_MID_15M]: number;
  [ASK_DELTA_MID_1M]: number;
  [ASK_DELTA_MID_5M]: number;
  [ASK_DELTA_MID_15M]: number;
}

/**
 * Delta-Mid ground truth - only populated when fill occurred
 * undefined means no fill happened, so no delta-mid measurement possible
 */
export interface DeltaMidGroundTruth {
  [BID_DELTA_MID_1M]: number | undefined;
  [BID_DELTA_MID_5M]: number | undefined;
  [BID_DELTA_MID_15M]: number | undefined;
  [ASK_DELTA_MID_1M]: number | undefined;
  [ASK_DELTA_MID_5M]: number | undefined;
  [ASK_DELTA_MID_15M]: number | undefined;
}

/**
 * Score for an individual delta-mid contract
 */
export interface DeltaMidContractScore {
  contractId: DeltaMidContractId;
  predicted: number;
  actual: number;
  absoluteError: number;
  squaredError: number;
  signedError: number; // For bias calculation (predicted - actual)
}

/**
 * Extended delta-mid contract score with normalization
 */
export interface ExtendedDeltaMidContractScore extends DeltaMidContractScore {
  atr: number | undefined;
  normalizedError: number | undefined; // absoluteError / ATR
  normalizedSignedError: number | undefined; // signedError / ATR
}

/**
 * Extended delta-mid aggregates with normalization and per-side breakdown
 */
export interface ExtendedDeltaMidAggregates extends DeltaMidAggregates {
  // Normalized metrics (ATR-relative)
  meanNormalizedMAE: number;
  meanNormalizedBias: number;
  // Per-side breakdown
  bySide: {
    bid: { meanNormalizedMAE: number; meanNormalizedBias: number; sampleCount: number };
    ask: { meanNormalizedMAE: number; meanNormalizedBias: number; sampleCount: number };
  };
}

/**
 * Extended delta-mid scorer result
 */
export interface ExtendedDeltaMidScorerResult {
  scores: ExtendedDeltaMidContractScore[];
  aggregates: ExtendedDeltaMidAggregates;
}

/**
 * PnL result for a single trade
 */
export interface PnLResult {
  side: 'bid' | 'ask';
  horizon: '1m' | '5m' | '15m';
  filled: boolean;
  fillPrice?: number;
  exitMid?: number;
  pnl: number; // 0 if no fill
}

/**
 * Expected Value calculation result
 */
export interface EVResult {
  side: 'bid' | 'ask';
  horizon: '1m' | '5m' | '15m';
  predictedFillProb: number;
  predictedDeltaMid: number;
  ev: number;
}

/**
 * Extended forecast score result with EV benchmark metrics
 * @deprecated Use ForecastScoreResult with optional fields instead
 */
export type ExtendedForecastScoreResult = ForecastScoreResult & {
  deltaMidScores: NonNullable<ForecastScoreResult['deltaMidScores']>;
  pnlResults: NonNullable<ForecastScoreResult['pnlResults']>;
  evResults: NonNullable<ForecastScoreResult['evResults']>;
  evPnlGap: NonNullable<ForecastScoreResult['evPnlGap']>;
};
