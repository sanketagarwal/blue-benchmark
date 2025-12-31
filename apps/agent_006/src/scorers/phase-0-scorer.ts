import { brierScore } from './brier-scorer.js';
import { logLoss } from './log-loss-scorer.js';

import type { BottomContractId } from '../bottom-caller.js';
import type { TimeframeId } from '../timeframe-config.js';

export const RANDOM_BASELINE = Math.log(2);

/**
 * Small epsilon to prevent log(0) in baseline calculations
 */
const BASELINE_EPSILON = 1e-15;

/**
 * Baseline log loss values for comparison
 */
export interface BaselineLogLoss {
  /** Random baseline: always 0.5 prediction = log(2) */
  random: number;
  /** Always-false baseline: predict 0 for all samples */
  alwaysFalse: number;
  /** Always-true baseline: predict 1 for all samples */
  alwaysTrue: number;
  /** Best trivial baseline: min(alwaysFalse, alwaysTrue) */
  trivialBest: number;
}

/**
 * Compute baseline log loss values for a set of labels
 * These baselines represent the performance of trivial strategies:
 * - Random: always predict 0.5
 * - Always-false: always predict 0 (epsilon)
 * - Always-true: always predict 1 (1-epsilon)
 *
 * @param labels - Array of observed boolean labels
 * @returns Baseline log loss values for comparison
 */
export function computeBaselineLogLoss(labels: boolean[]): BaselineLogLoss {
  // Random baseline is always log(2) regardless of label distribution
  const random = RANDOM_BASELINE;

  if (labels.length === 0) {
    return { random, alwaysFalse: 0, alwaysTrue: 0, trivialBest: 0 };
  }

  // Always-false: predict epsilon (near 0) for all samples
  let alwaysFalseSum = 0;
  for (const label of labels) {
    alwaysFalseSum += logLoss(BASELINE_EPSILON, label);
  }
  const alwaysFalse = alwaysFalseSum / labels.length;

  // Always-true: predict 1-epsilon (near 1) for all samples
  let alwaysTrueSum = 0;
  for (const label of labels) {
    alwaysTrueSum += logLoss(1 - BASELINE_EPSILON, label);
  }
  const alwaysTrue = alwaysTrueSum / labels.length;

  // Trivial best is the better of the two constant strategies
  const trivialBest = Math.min(alwaysFalse, alwaysTrue);

  return { random, alwaysFalse, alwaysTrue, trivialBest };
}

export interface Phase0RoundScore {
  logLossByHorizon: Record<TimeframeId, number>;
  brierByHorizon: Record<TimeframeId, number>;
  extremeErrors: Record<TimeframeId, boolean>;
  predictions: Record<TimeframeId, number>;
}

export interface Phase0AggregateScore {
  meanLogLoss: Record<TimeframeId, number>;
  meanBrier: Record<TimeframeId, number>;
  extremeErrorRate: Record<TimeframeId, number>;
  degenerateByHorizon: Record<TimeframeId, boolean>;
}

const HORIZONS: TimeframeId[] = ['15m', '1h', '4h', '24h'];

/**
 * Score a single round for Phase 0 metrics
 * @param predictions - Model predictions by contract ID
 * @param labels - Ground truth labels by horizon
 * @returns Phase 0 round score
 */
export function scorePhase0Round(
  predictions: Record<BottomContractId, number>,
  labels: Record<TimeframeId, boolean>
): Phase0RoundScore {
  const logLossByHorizon: Record<string, number> = {};
  const brierByHorizon: Record<string, number> = {};
  const extremeErrors: Record<string, boolean> = {};
  const predictionsByHorizon: Record<string, number> = {};

  for (const horizon of HORIZONS) {
    const contractId: BottomContractId = `bottom-${horizon}`;
    // eslint-disable-next-line security/detect-object-injection -- contractId from controlled constant
    const prediction = predictions[contractId];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const label = labels[horizon];

    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    logLossByHorizon[horizon] = logLoss(prediction, label);
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    brierByHorizon[horizon] = brierScore(prediction, label);
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    predictionsByHorizon[horizon] = prediction;

    // Extreme error: confident wrong (p > 0.8 when label = false)
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    extremeErrors[horizon] = prediction > 0.8 && !label;
  }

  return {
    logLossByHorizon: logLossByHorizon as Record<TimeframeId, number>,
    brierByHorizon: brierByHorizon as Record<TimeframeId, number>,
    extremeErrors: extremeErrors as Record<TimeframeId, boolean>,
    predictions: predictionsByHorizon as Record<TimeframeId, number>,
  };
}

/**
 * Aggregate Phase 0 scores across rounds
 * @param rounds - Array of round scores
 * @returns Aggregate Phase 0 score
 */
export function aggregatePhase0Scores(rounds: Phase0RoundScore[]): Phase0AggregateScore {
  const meanLogLoss: Record<TimeframeId, number> = { '15m': 0, '1h': 0, '4h': 0, '24h': 0 };
  const meanBrier: Record<TimeframeId, number> = { '15m': 0, '1h': 0, '4h': 0, '24h': 0 };
  const extremeErrorRate: Record<TimeframeId, number> = { '15m': 0, '1h': 0, '4h': 0, '24h': 0 };
  const degenerateByHorizon: Record<TimeframeId, boolean> = {
    '15m': false,
    '1h': false,
    '4h': false,
    '24h': false,
  };

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const horizonLosses = rounds.map(r => r.logLossByHorizon[horizon]);
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const horizonBriers = rounds.map(r => r.brierByHorizon[horizon]);
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const horizonErrors = rounds.map(r => r.extremeErrors[horizon]);
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const horizonPredictions = rounds.map(r => r.predictions[horizon]);

    // Mean log loss per horizon
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    meanLogLoss[horizon] = horizonLosses.reduce((a, b) => a + b, 0) / horizonLosses.length;

    // Mean Brier score per horizon
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    meanBrier[horizon] = horizonBriers.reduce((a, b) => a + b, 0) / horizonBriers.length;

    // Extreme error rate per horizon
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    extremeErrorRate[horizon] = horizonErrors.filter(Boolean).length / horizonErrors.length;

    // Degenerate check PER HORIZON (not cross-horizon)
    const alwaysHigh = horizonPredictions.every(p => p > 0.9);
    const alwaysLow = horizonPredictions.every(p => p < 0.1);
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    degenerateByHorizon[horizon] = alwaysHigh || alwaysLow;
  }

  return { meanLogLoss, meanBrier, extremeErrorRate, degenerateByHorizon };
}

/**
 * Get horizons that should be disqualified in Phase 0
 * Returns set of horizons to disqualify (not global elimination)
 * @param aggregateScore - Aggregate Phase 0 score
 * @returns Set of horizons to disqualify
 */
export function getPhase0DisqualifiedHorizons(
  aggregateScore: Phase0AggregateScore
): Set<TimeframeId> {
  const threshold = RANDOM_BASELINE * 1.1;
  const disqualified = new Set<TimeframeId>();

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const meanLL = aggregateScore.meanLogLoss[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const degenerate = aggregateScore.degenerateByHorizon[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const extremeRate = aggregateScore.extremeErrorRate[horizon];

    // Disqualify from this horizon if: worse than random OR degenerate OR high extreme error rate
    if (meanLL > threshold || degenerate || extremeRate > 0.2) {
      disqualified.add(horizon);
    }
  }

  return disqualified;
}

/**
 * Determine if model should be eliminated in Phase 0
 * Note: Consider using getPhase0DisqualifiedHorizons for per-horizon elimination
 * @param score - Aggregate Phase 0 score
 * @returns True if model should be eliminated (disqualified from ALL horizons)
 */
export function shouldEliminatePhase0(score: Phase0AggregateScore): boolean {
  const disqualified = getPhase0DisqualifiedHorizons(score);
  // Only fully eliminate if disqualified from ALL horizons
  return disqualified.size === 4;
}

/**
 * Minimum improvement required over trivial baseline to demonstrate skill
 * Model must beat trivial baseline by at least this margin
 */
const SKILL_MARGIN = 0.1;

/**
 * Get horizons that should be disqualified in Phase 0 using baseline comparison
 * This version uses relative thresholds: model must significantly beat trivial baseline
 *
 * A model that merely matches always-false when labels are mostly false shows no skill.
 *
 * @param aggregateScore - Aggregate Phase 0 score
 * @param baselines - Baseline log loss values for each horizon
 * @returns Set of horizons to disqualify
 */
export function getPhase0DisqualifiedHorizonsWithBaselines(
  aggregateScore: Phase0AggregateScore,
  baselines: Record<TimeframeId, BaselineLogLoss>
): Set<TimeframeId> {
  const disqualified = new Set<TimeframeId>();

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const meanLL = aggregateScore.meanLogLoss[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const degenerate = aggregateScore.degenerateByHorizon[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const extremeRate = aggregateScore.extremeErrorRate[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const baseline = baselines[horizon];

    // Disqualify if degenerate or high extreme error rate (unchanged)
    if (degenerate || extremeRate > 0.2) {
      disqualified.add(horizon);
      continue;
    }

    // Disqualify if not significantly better than trivial baseline
    // Model must beat trivialBest by SKILL_MARGIN, otherwise it's just luck
    const skillThreshold = baseline.trivialBest + SKILL_MARGIN;

    // Also still check random baseline (model shouldn't be worse than random)
    const randomThreshold = baseline.random * 1.1;

    if (meanLL > randomThreshold || meanLL >= skillThreshold) {
      disqualified.add(horizon);
    }
  }

  return disqualified;
}
