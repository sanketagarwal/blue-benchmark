import { logLoss } from './log-loss-scorer.js';

import type { BottomContractId } from '../bottom-caller.js';
import type { Horizon } from '../horizon-config.js';

export const RANDOM_BASELINE = Math.log(2);

export interface Phase0RoundScore {
  logLossByHorizon: Record<Horizon, number>;
  extremeErrors: Record<Horizon, boolean>;
  predictions: Record<Horizon, number>;
}

export interface Phase0AggregateScore {
  meanLogLoss: Record<Horizon, number>;
  extremeErrorRate: Record<Horizon, number>;
  degeneratePattern: boolean;
}

const HORIZONS: Horizon[] = ['15m', '1h', '24h', '7d'];

/**
 * Score a single round for Phase 0 metrics
 * @param predictions - Model predictions by contract ID
 * @param labels - Ground truth labels by horizon
 * @returns Phase 0 round score
 */
export function scorePhase0Round(
  predictions: Record<BottomContractId, number>,
  labels: Record<Horizon, boolean>
): Phase0RoundScore {
  const logLossByHorizon: Record<string, number> = {};
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
    predictionsByHorizon[horizon] = prediction;

    // Extreme error: confident wrong (p > 0.8 when label = false)
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    extremeErrors[horizon] = prediction > 0.8 && !label;
  }

  return {
    logLossByHorizon: logLossByHorizon as Record<Horizon, number>,
    extremeErrors: extremeErrors as Record<Horizon, boolean>,
    predictions: predictionsByHorizon as Record<Horizon, number>,
  };
}

/**
 * Aggregate Phase 0 scores across rounds
 * @param rounds - Array of round scores
 * @returns Aggregate Phase 0 score
 */
export function aggregatePhase0Scores(rounds: Phase0RoundScore[]): Phase0AggregateScore {
  const meanLogLoss: Record<string, number> = {};
  const extremeErrorRate: Record<string, number> = {};

  for (const horizon of HORIZONS) {
    // Mean log loss
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const losses = rounds.map(r => r.logLossByHorizon[horizon]);
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    meanLogLoss[horizon] = losses.reduce((a, b) => a + b, 0) / losses.length;

    // Extreme error rate
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const errors = rounds.filter(r => r.extremeErrors[horizon]).length;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    extremeErrorRate[horizon] = errors / rounds.length;
  }

  // Degenerate pattern: always > 0.9 or always < 0.1
  const allPredictions = rounds.flatMap(r => Object.values(r.predictions));
  const alwaysHigh = allPredictions.every(p => p > 0.9);
  const alwaysLow = allPredictions.every(p => p < 0.1);
  const degeneratePattern = alwaysHigh || alwaysLow;

  return {
    meanLogLoss: meanLogLoss as Record<Horizon, number>,
    extremeErrorRate: extremeErrorRate as Record<Horizon, number>,
    degeneratePattern,
  };
}

/**
 * Determine if model should be eliminated in Phase 0
 * @param score - Aggregate Phase 0 score
 * @returns True if model should be eliminated
 */
export function shouldEliminatePhase0(score: Phase0AggregateScore): boolean {
  const threshold = RANDOM_BASELINE * 1.1;

  // Count horizons with log loss above threshold
  const horizonsAboveThreshold = HORIZONS.filter(
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    h => score.meanLogLoss[h] > threshold
  ).length;

  // Eliminate if:
  // 1. meanLogLoss > baseline * 1.1 on 2+ horizons
  if (horizonsAboveThreshold >= 2) {
    return true;
  }

  // 2. degeneratePattern = true
  if (score.degeneratePattern) {
    return true;
  }

  // 3. extremeErrorRate > 0.2 on any horizon
  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    if (score.extremeErrorRate[horizon] > 0.2) {
      return true;
    }
  }

  return false;
}
