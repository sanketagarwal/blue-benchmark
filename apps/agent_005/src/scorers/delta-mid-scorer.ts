import type {
  DeltaMidContractId,
  DeltaMidContractScore,
  ExtendedDeltaMidContractScore,
  ExtendedDeltaMidScorerResult,
  ExtendedDeltaMidAggregates,
} from './types';

/**
 * Calculate absolute error between predicted and actual values
 * |predicted - actual|
 *
 * @param predicted - The predicted value
 * @param actual - The actual observed value
 * @returns Absolute difference between predicted and actual
 */
export function absoluteError(predicted: number, actual: number): number {
  return Math.abs(predicted - actual);
}

/**
 * Calculate squared error between predicted and actual values
 * (predicted - actual)^2
 *
 * @param predicted - The predicted value
 * @param actual - The actual observed value
 * @returns Squared difference between predicted and actual
 */
export function squaredError(predicted: number, actual: number): number {
  return (predicted - actual) ** 2;
}

/**
 * Calculate signed error between predicted and actual values
 * predicted - actual (for bias calculation)
 *
 * @param predicted - The predicted value
 * @param actual - The actual observed value
 * @returns Signed difference (positive = overprediction, negative = underprediction)
 */
export function signedError(predicted: number, actual: number): number {
  return predicted - actual;
}

/**
 * Score a single delta-mid prediction
 * Returns a score object containing all error metrics
 *
 * @param contractId - The delta-mid contract ID
 * @param predicted - The predicted delta-mid value in bps
 * @param actual - The actual observed delta-mid value in bps
 * @returns DeltaMidContractScore with all error metrics
 */
export function scoreDeltaMidPrediction(
  contractId: DeltaMidContractId,
  predicted: number,
  actual: number
): DeltaMidContractScore {
  return {
    contractId,
    predicted,
    actual,
    absoluteError: absoluteError(predicted, actual),
    squaredError: squaredError(predicted, actual),
    signedError: signedError(predicted, actual),
  };
}

/**
 * Aggregated metrics for delta-mid predictions
 */
export interface DeltaMidAggregates {
  meanMAE: number;
  meanMSE: number;
  meanBias: number;
  sampleCount: number;
}

/**
 * Result from scoring multiple delta-mid predictions
 */
export interface DeltaMidScorerResult {
  scores: DeltaMidContractScore[];
  aggregates: DeltaMidAggregates;
}

/**
 * Score multiple delta-mid predictions
 * Only scores contracts where actual is defined (fill occurred)
 *
 * @param predictions - Map of contract ID to predicted delta-mid value
 * @param actuals - Map of contract ID to actual delta-mid value (undefined if no fill)
 * @returns Per-contract scores and aggregated metrics
 */
export function scoreDeltaMidPredictions(
  predictions: Record<string, number>,
  actuals: Record<string, number | undefined>
): DeltaMidScorerResult {
  const scores: DeltaMidContractScore[] = [];

  // Only score contracts where we have both prediction and actual (fill occurred)
  for (const [contractId, predicted] of Object.entries(predictions)) {
    // eslint-disable-next-line security/detect-object-injection -- Safe: iterating over known object keys
    const actual = actuals[contractId];
    if (actual !== undefined) {
      scores.push(
        scoreDeltaMidPrediction(contractId as DeltaMidContractId, predicted, actual)
      );
    }
  }

  // Calculate aggregates
  if (scores.length === 0) {
    return {
      scores,
      aggregates: {
        meanMAE: 0,
        meanMSE: 0,
        meanBias: 0,
        sampleCount: 0,
      },
    };
  }

  let totalAbsoluteError = 0;
  let totalSquaredError = 0;
  let totalSignedError = 0;

  for (const score of scores) {
    totalAbsoluteError += score.absoluteError;
    totalSquaredError += score.squaredError;
    totalSignedError += score.signedError;
  }

  return {
    scores,
    aggregates: {
      meanMAE: totalAbsoluteError / scores.length,
      meanMSE: totalSquaredError / scores.length,
      meanBias: totalSignedError / scores.length,
      sampleCount: scores.length,
    },
  };
}

type Side = 'bid' | 'ask';

interface SideTotals {
  totalNormError: number;
  totalNormSigned: number;
  count: number;
}

function extractSide(contractId: string): Side {
  return contractId.startsWith('bid') ? 'bid' : 'ask';
}

/**
 * Compute mean from total and count, returning 0 if count is 0
 *
 * @param total - The sum of values
 * @param count - The number of values
 * @returns The mean value, or 0 if count is 0
 */
function safeMean(total: number, count: number): number {
  return count > 0 ? total / count : 0;
}

/**
 * Build per-side aggregate metrics from accumulated totals
 *
 * @param totals - The accumulated totals for a side
 * @returns Object containing mean normalized MAE, bias, and sample count
 */
function buildSideAggregates(totals: SideTotals): {
  meanNormalizedMAE: number;
  meanNormalizedBias: number;
  sampleCount: number;
} {
  return {
    meanNormalizedMAE: safeMean(totals.totalNormError, totals.count),
    meanNormalizedBias: safeMean(totals.totalNormSigned, totals.count),
    sampleCount: totals.count,
  };
}

/**
 * Create empty extended aggregates structure
 *
 * @returns Empty ExtendedDeltaMidAggregates with all values set to 0
 */
function createEmptyAggregates(): ExtendedDeltaMidAggregates {
  return {
    meanMAE: 0,
    meanMSE: 0,
    meanBias: 0,
    sampleCount: 0,
    meanNormalizedMAE: 0,
    meanNormalizedBias: 0,
    bySide: {
      bid: { meanNormalizedMAE: 0, meanNormalizedBias: 0, sampleCount: 0 },
      ask: { meanNormalizedMAE: 0, meanNormalizedBias: 0, sampleCount: 0 },
    },
  };
}

/**
 * Accumulate normalized metrics for a score into side totals.
 * IMPORTANT: Only call this when score.normalizedError and score.normalizedSignedError are defined.
 *
 * @param score - The extended delta-mid contract score with defined normalized values
 * @param bySide - Record of side totals to accumulate into
 */
function accumulateNormalizedMetrics(
  score: ExtendedDeltaMidContractScore,
  bySide: Record<Side, SideTotals>
): void {
  const side = extractSide(score.contractId);
  // eslint-disable-next-line security/detect-object-injection -- Safe: side is constrained to 'bid' | 'ask' from extractSide
  const sideTotals = bySide[side];
  // Values are guaranteed to be defined by caller - use ?? 0 to satisfy type checker
  sideTotals.totalNormError += score.normalizedError ?? 0;
  sideTotals.totalNormSigned += score.normalizedSignedError ?? 0;
  sideTotals.count++;
}

/**
 * Calculate extended aggregates with normalization and per-side breakdown
 *
 * @param scores - Array of extended delta-mid contract scores
 * @returns Extended aggregates with normalized metrics and per-side breakdown
 */
function calculateExtendedAggregates(
  scores: ExtendedDeltaMidContractScore[]
): ExtendedDeltaMidAggregates {
  if (scores.length === 0) {
    return createEmptyAggregates();
  }

  // Raw metrics
  let totalAbsoluteError = 0;
  let totalSquaredError = 0;
  let totalSignedError = 0;

  // Normalized metrics
  let totalNormalizedError = 0;
  let totalNormalizedSignedError = 0;
  let normalizedCount = 0;

  // Per-side normalized metrics
  const bySide: Record<Side, SideTotals> = {
    bid: { totalNormError: 0, totalNormSigned: 0, count: 0 },
    ask: { totalNormError: 0, totalNormSigned: 0, count: 0 },
  };

  for (const score of scores) {
    totalAbsoluteError += score.absoluteError;
    totalSquaredError += score.squaredError;
    totalSignedError += score.signedError;

    const hasNormalized =
      score.normalizedError !== undefined &&
      score.normalizedSignedError !== undefined;

    if (hasNormalized) {
      // Values are guaranteed to be defined by hasNormalized check - use ?? 0 to satisfy type checker
      totalNormalizedError += score.normalizedError ?? 0;
      totalNormalizedSignedError += score.normalizedSignedError ?? 0;
      normalizedCount++;
      accumulateNormalizedMetrics(score, bySide);
    }
  }

  return {
    meanMAE: totalAbsoluteError / scores.length,
    meanMSE: totalSquaredError / scores.length,
    meanBias: totalSignedError / scores.length,
    sampleCount: scores.length,
    meanNormalizedMAE: safeMean(totalNormalizedError, normalizedCount),
    meanNormalizedBias: safeMean(totalNormalizedSignedError, normalizedCount),
    bySide: {
      bid: buildSideAggregates(bySide.bid),
      ask: buildSideAggregates(bySide.ask),
    },
  };
}

/**
 * Score normalized delta-mid predictions with ATR normalization and per-side breakdown.
 *
 * @param predictions - Map of contract ID to predicted delta-mid value
 * @param actuals - Map of contract ID to actual delta-mid value (undefined if no fill)
 * @param atrs - Map of contract ID to ATR value for normalization
 * @returns Extended scorer result with normalized metrics and per-side breakdown
 */
export function scoreNormalizedDeltaMidPredictions(
  predictions: Record<string, number>,
  actuals: Record<string, number | undefined>,
  atrs: Record<string, number | undefined>
): ExtendedDeltaMidScorerResult {
  const scores: ExtendedDeltaMidContractScore[] = [];

  for (const [contractId, predicted] of Object.entries(predictions)) {
    // eslint-disable-next-line security/detect-object-injection -- Safe: iterating over known object keys
    const actual = actuals[contractId];
    if (actual === undefined) {
      continue;
    }

    // eslint-disable-next-line security/detect-object-injection -- Safe: iterating over known object keys
    const atr = atrs[contractId];
    const absError = absoluteError(predicted, actual);
    const sgnError = signedError(predicted, actual);

    scores.push({
      contractId: contractId as DeltaMidContractId,
      predicted,
      actual,
      absoluteError: absError,
      squaredError: squaredError(predicted, actual),
      signedError: sgnError,
      atr,
      normalizedError: atr !== undefined && atr > 0 ? absError / atr : undefined,
      normalizedSignedError:
        atr !== undefined && atr > 0 ? sgnError / atr : undefined,
    });
  }

  const aggregates = calculateExtendedAggregates(scores);

  return { scores, aggregates };
}
