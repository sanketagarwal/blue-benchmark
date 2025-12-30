import type { DeltaMidContractId, DeltaMidContractScore } from './types';

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
