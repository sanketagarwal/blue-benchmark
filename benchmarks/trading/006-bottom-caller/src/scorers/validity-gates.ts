import { computeStandardDeviation } from '../diagnostics/prediction-diagnostics.js';
import { TIMEFRAME_IDS } from '../timeframe-config.js';

import type { TimeframeId } from '../timeframe-config.js';

export interface ValidityConfig {
  minCoverage: number;
  maxFailureRate: number;
  constantPredictor: {
    maxUniqueP: number;
    maxPStdDev: number;
  };
  extremeWrongRate: number;
  extremeThresholds: {
    high: number;
    low: number;
  };
}

export type ValidityFailureReason =
  | 'coverage'
  | 'failure_rate'
  | 'constant_predictor'
  | 'extreme_predictions'
  | 'extreme_wrong_rate';

export interface HorizonValidityResult {
  horizon: TimeframeId;
  isValid: boolean;
  failureReasons: ValidityFailureReason[];
  metrics: {
    effectiveN: number;
    totalN: number;
    coverage: number;
    failureRate: number;
    uniqueP: number;
    pStdDev: number;
    extremePredictionRate: number;
    confidentWrongRate: number;
  };
}

export interface ModelValidityResult {
  modelId: string;
  validHorizons: TimeframeId[];
  invalidHorizons: Map<TimeframeId, HorizonValidityResult>;
  isFullyInvalid: boolean;
}

export function getDefaultValidityConfig(): ValidityConfig {
  return {
    minCoverage: 0.8,
    maxFailureRate: 0.1,
    constantPredictor: {
      maxUniqueP: 2,
      maxPStdDev: 0.02,
    },
    extremeWrongRate: 0.2,
    extremeThresholds: {
      high: 0.9,
      low: 0.1,
    },
  };
}

function countUniquePredictions(predictions: number[]): number {
  const unique = new Set(predictions.map((p) => p.toFixed(6)));
  return unique.size;
}

function countExtremePredictions(
  predictions: number[],
  high: number,
  low: number
): number {
  return predictions.filter((p) => p >= high || p <= low).length;
}

function countConfidentWrong(predictions: number[], labels: boolean[]): number {
  let count = 0;
  for (const [index, p] of predictions.entries()) {
    // eslint-disable-next-line security/detect-object-injection -- index from entries() iteration
    const y = labels[index];
    if (y === undefined) {
      continue;
    }
    const confidentTrue = p > 0.8 && !y;
    const confidentFalse = p < 0.2 && y;
    if (confidentTrue || confidentFalse) {
      count++;
    }
  }
  return count;
}

function computeMetrics(
  predictions: number[],
  labels: boolean[],
  failedRounds: number,
  totalRounds: number,
  config: ValidityConfig
): HorizonValidityResult['metrics'] {
  const effectiveN = predictions.length;
  const totalN = totalRounds;
  const coverage = totalN > 0 ? effectiveN / totalN : 0;
  const failureRate = totalRounds > 0 ? failedRounds / totalRounds : 0;

  const uniqueP = countUniquePredictions(predictions);
  const standardDeviation = computeStandardDeviation(predictions);

  const extremeCount = countExtremePredictions(
    predictions,
    config.extremeThresholds.high,
    config.extremeThresholds.low
  );
  const extremePredictionRate = effectiveN > 0 ? extremeCount / effectiveN : 0;

  const confidentWrongCount = countConfidentWrong(predictions, labels);
  const confidentWrongRate =
    effectiveN > 0 ? confidentWrongCount / effectiveN : 0;

  return {
    effectiveN,
    totalN,
    coverage,
    failureRate,
    uniqueP,
    pStdDev: standardDeviation,
    extremePredictionRate,
    confidentWrongRate,
  };
}

function detectFailures(
  metrics: HorizonValidityResult['metrics'],
  config: ValidityConfig
): ValidityFailureReason[] {
  const failureReasons: ValidityFailureReason[] = [];

  if (metrics.coverage < config.minCoverage) {
    failureReasons.push('coverage');
  }

  if (metrics.failureRate > config.maxFailureRate) {
    failureReasons.push('failure_rate');
  }

  const isConstantPredictor =
    metrics.uniqueP <= config.constantPredictor.maxUniqueP &&
    metrics.pStdDev <= config.constantPredictor.maxPStdDev;
  if (isConstantPredictor && metrics.effectiveN > 1) {
    failureReasons.push('constant_predictor');
  }

  if (metrics.extremePredictionRate > 0.9) {
    failureReasons.push('extreme_predictions');
  }

  if (metrics.confidentWrongRate > config.extremeWrongRate) {
    failureReasons.push('extreme_wrong_rate');
  }

  return failureReasons;
}

export function checkHorizonValidity(
  predictions: number[],
  labels: boolean[],
  failedRounds: number,
  totalRounds: number,
  horizon: TimeframeId,
  config: ValidityConfig
): HorizonValidityResult {
  const metrics = computeMetrics(
    predictions,
    labels,
    failedRounds,
    totalRounds,
    config
  );
  const failureReasons = detectFailures(metrics, config);

  return {
    horizon,
    isValid: failureReasons.length === 0,
    failureReasons,
    metrics,
  };
}

export function checkModelValidity(
  modelId: string,
  predictionsByHorizon: Record<TimeframeId, number[]>,
  labelsByHorizon: Record<TimeframeId, boolean[]>,
  failedRoundsByHorizon: Record<TimeframeId, number>,
  totalRounds: number,
  config: ValidityConfig
): ModelValidityResult {
  const validHorizons: TimeframeId[] = [];
  const invalidHorizons = new Map<TimeframeId, HorizonValidityResult>();

  for (const horizon of TIMEFRAME_IDS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const predictions = predictionsByHorizon[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const labels = labelsByHorizon[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const failedRounds = failedRoundsByHorizon[horizon];

    const result = checkHorizonValidity(
      predictions,
      labels,
      failedRounds,
      totalRounds,
      horizon,
      config
    );

    if (result.isValid) {
      validHorizons.push(horizon);
    } else {
      invalidHorizons.set(horizon, result);
    }
  }

  return {
    modelId,
    validHorizons,
    invalidHorizons,
    isFullyInvalid: validHorizons.length === 0,
  };
}
