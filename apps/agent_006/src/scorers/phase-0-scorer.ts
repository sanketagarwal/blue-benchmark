import { brierScore } from './brier-scorer.js';
import { logLoss } from './log-loss-scorer.js';

import type { BottomContractId } from '../bottom-caller.js';
import type { TimeframeId } from '../timeframe-config.js';

export const RANDOM_BASELINE = Math.log(2);

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
