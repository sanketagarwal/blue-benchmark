import {
  aggregatePhase0Scores,
  shouldEliminatePhase0,
  RANDOM_BASELINE,
  type Phase0RoundScore,
} from '../scorers/phase-0-scorer.js';
import {
  computePercentileRanks,
  shouldEliminatePhase1,
  type Phase1ModelScore,
} from '../scorers/phase-1-scorer.js';
import {
  computeStabilityMetrics,
  computeRegret,
  shouldEliminatePhase2,
  median,
  type Phase2ModelScore,
} from '../scorers/phase-2-scorer.js';
import {
  rankModels,
  type Phase3ModelMetrics,
} from '../scorers/phase-3-scorer.js';

import type { Horizon } from '../horizon-config.js';
import type { ModelState, ModelStateManager, RoundScore } from '../state/model-state.js';

const HORIZONS: Horizon[] = ['15m', '1h', '24h', '7d'];

function getPhase0Reason(aggregate: ReturnType<typeof aggregatePhase0Scores>): string {
  if (aggregate.degeneratePattern) {
    return 'Degenerate pattern';
  }
  const threshold = RANDOM_BASELINE * 1.1;
  // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
  const badHorizons = HORIZONS.filter(h => aggregate.meanLogLoss[h] > threshold);
  if (badHorizons.length >= 2) {
    return `High log loss on ${badHorizons.join(', ')}`;
  }
  // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
  const extremeHorizons = HORIZONS.filter(h => aggregate.extremeErrorRate[h] > 0.2);
  if (extremeHorizons.length > 0) {
    return `Extreme errors on ${extremeHorizons.join(', ')}`;
  }
  return 'Failed sanity check';
}

function getPhase1Reason(percentiles: Record<Horizon, number>): string {
  // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
  const weakHorizons = HORIZONS.filter(h => percentiles[h] < 25);
  if (weakHorizons.length >= 2) {
    return `Bottom quartile on ${weakHorizons.join(', ')}`;
  }
  // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
  const hasStrength = HORIZONS.some(h => percentiles[h] >= 75);
  if (!hasStrength) {
    return 'No horizon strength';
  }
  return 'Failed competence filter';
}

function getPhase2Reason(
  score: Phase2ModelScore,
  medianStability: Record<Horizon, number>
): string {
  // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
  const highRegret = HORIZONS.filter(h => score.regretByHorizon[h] > 1.5);
  if (highRegret.length >= 2) {
    return `High regret on ${highRegret.join(', ')}`;
  }
  // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
  const unstable = HORIZONS.filter(h => score.stabilityByHorizon[h] > 2 * medianStability[h]);
  if (unstable.length >= 3) {
    return `Unstable on ${unstable.join(', ')}`;
  }
  return 'Failed stability filter';
}

function buildExtremeErrors(
  predictions: Record<Horizon, number>,
  labels: Record<Horizon, boolean> | undefined
): Record<Horizon, boolean> {
  const result: Partial<Record<Horizon, boolean>> = {};
  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const prediction = predictions[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const label = labels?.[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    result[horizon] = prediction > 0.8 && label === false;
  }
  return result as Record<Horizon, boolean>;
}

function convertToPhase0Round(round: RoundScore): Phase0RoundScore | undefined {
  if (round.logLossByHorizon === undefined || round.predictions === undefined) {
    return undefined;
  }
  return {
    logLossByHorizon: round.logLossByHorizon,
    extremeErrors: buildExtremeErrors(round.predictions, round.labels),
    predictions: round.predictions,
  };
}

function processModelForPhase0(
  state: ModelState,
  manager: ModelStateManager
): void {
  const phase0Rounds: Phase0RoundScore[] = [];
  for (const round of state.roundScores) {
    const converted = convertToPhase0Round(round);
    if (converted !== undefined) {
      phase0Rounds.push(converted);
    }
  }

  if (phase0Rounds.length < 6) {
    return;
  }

  const aggregate = aggregatePhase0Scores(phase0Rounds);

  if (shouldEliminatePhase0(aggregate)) {
    manager.eliminateModel(state.modelId, 0, getPhase0Reason(aggregate));
  }
}

/**
 * Run Phase 0 elimination on accumulated scores
 * @param manager - Model state manager
 */
export function runPhase0(manager: ModelStateManager): void {
  const activeModels = manager.getActiveModels();

  for (const modelId of activeModels) {
    const state = manager.getModelState(modelId);
    if (state !== undefined) {
      processModelForPhase0(state, manager);
    }
  }
}

function computeMeanLogLossForModel(state: ModelState): Phase1ModelScore | undefined {
  const meanLogLoss: Record<Horizon, number> = { '15m': 0, '1h': 0, '24h': 0, '7d': 0 };
  let count = 0;

  for (const round of state.roundScores) {
    if (round.logLossByHorizon !== undefined) {
      for (const h of HORIZONS) {
        // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
        meanLogLoss[h] += round.logLossByHorizon[h];
      }
      count++;
    }
  }

  if (count === 0) {
    return undefined;
  }

  for (const h of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    meanLogLoss[h] /= count;
  }

  return { modelId: state.modelId, meanLogLoss };
}

/**
 * Run Phase 1 elimination on accumulated scores
 * @param manager - Model state manager
 */
export function runPhase1(manager: ModelStateManager): void {
  const activeModels = manager.getActiveModels();
  const phase1Scores: Phase1ModelScore[] = [];

  for (const modelId of activeModels) {
    const state = manager.getModelState(modelId);
    if (state !== undefined) {
      const score = computeMeanLogLossForModel(state);
      if (score !== undefined) {
        phase1Scores.push(score);
      }
    }
  }

  const percentileRanks = computePercentileRanks(phase1Scores);

  for (const modelId of activeModels) {
    const percentiles = percentileRanks.get(modelId);
    if (percentiles !== undefined && shouldEliminatePhase1(percentiles)) {
      manager.eliminateModel(modelId, 1, getPhase1Reason(percentiles));
    }
  }
}

function getLossesForHorizon(state: ModelState, horizon: Horizon): number[] {
  const losses: number[] = [];
  for (const round of state.roundScores) {
    if (round.logLossByHorizon !== undefined) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      losses.push(round.logLossByHorizon[horizon]);
    }
  }
  return losses;
}

function computePhase2ScoreForModel(state: ModelState): Phase2ModelScore {
  const regretByHorizon: Record<string, number> = {};
  const stabilityByHorizon: Record<string, number> = {};
  const worstWindowByHorizon: Record<string, number> = {};

  for (const h of HORIZONS) {
    const losses = getLossesForHorizon(state, h);
    const metrics = computeStabilityMetrics(losses);
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    stabilityByHorizon[h] = metrics.variance;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    worstWindowByHorizon[h] = metrics.worstWindow;
  }

  return {
    modelId: state.modelId,
    regretByHorizon: regretByHorizon as Record<Horizon, number>,
    stabilityByHorizon: stabilityByHorizon as Record<Horizon, number>,
    worstWindowByHorizon: worstWindowByHorizon as Record<Horizon, number>,
  };
}

function computeRegretForScores(phase2Scores: Phase2ModelScore[]): void {
  for (const h of HORIZONS) {
    const worstWindows: number[] = [];
    for (const score of phase2Scores) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      worstWindows.push(score.worstWindowByHorizon?.[h] ?? 0);
    }
    const medianWorst = median(worstWindows);

    for (const score of phase2Scores) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      const worstWindow = score.worstWindowByHorizon?.[h] ?? 0;
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      score.regretByHorizon[h] = computeRegret(worstWindow, medianWorst);
    }
  }
}

function computeMedianStabilityAcrossModels(phase2Scores: Phase2ModelScore[]): Record<Horizon, number> {
  const medianStability: Record<Horizon, number> = { '15m': 0, '1h': 0, '24h': 0, '7d': 0 };
  for (const h of HORIZONS) {
    const stabilities: number[] = [];
    for (const score of phase2Scores) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      stabilities.push(score.stabilityByHorizon[h]);
    }
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    medianStability[h] = median(stabilities);
  }
  return medianStability;
}

/**
 * Run Phase 2 elimination on accumulated scores
 * @param manager - Model state manager
 */
export function runPhase2(manager: ModelStateManager): void {
  const activeModels = manager.getActiveModels();
  const phase2Scores: Phase2ModelScore[] = [];

  for (const modelId of activeModels) {
    const state = manager.getModelState(modelId);
    if (state !== undefined) {
      phase2Scores.push(computePhase2ScoreForModel(state));
    }
  }

  computeRegretForScores(phase2Scores);
  const medianStability = computeMedianStabilityAcrossModels(phase2Scores);

  for (const score of phase2Scores) {
    if (shouldEliminatePhase2(score, medianStability)) {
      manager.eliminateModel(score.modelId, 2, getPhase2Reason(score, medianStability));
    }
  }
}

function sumArray(numbers: number[]): number {
  let total = 0;
  for (const n of numbers) {
    total += n;
  }
  return total;
}

function getPivotRatiosForHorizon(state: ModelState, horizon: Horizon): number[] {
  const pivotRatios: number[] = [];
  for (const round of state.roundScores) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const ratio = round.timeToPivotRatio?.[horizon];
    if (ratio !== undefined) {
      pivotRatios.push(ratio);
    }
  }
  return pivotRatios;
}

function computePhase3MetricsForModel(state: ModelState): Phase3ModelMetrics {
  const avgPercentileRank = 50;
  let avgBestWindow = 0;
  let avgStability = 0;
  let avgTimeToPivotRatio = 0.5;
  let horizonCount = 0;

  for (const h of HORIZONS) {
    const losses = getLossesForHorizon(state, h);
    const metrics = computeStabilityMetrics(losses);
    avgBestWindow += metrics.bestWindow;
    avgStability += metrics.variance;

    const pivotRatios = getPivotRatiosForHorizon(state, h);
    if (pivotRatios.length > 0) {
      avgTimeToPivotRatio += sumArray(pivotRatios) / pivotRatios.length;
    }

    horizonCount++;
  }

  if (horizonCount > 0) {
    avgBestWindow /= horizonCount;
    avgStability /= horizonCount;
    avgTimeToPivotRatio /= horizonCount;
  }

  return { avgPercentileRank, avgBestWindow, avgStability, avgTimeToPivotRatio };
}

/**
 * Run Phase 3 ranking (no elimination)
 * @param manager - Model state manager
 * @returns Array of ranked models with scores
 */
export function runPhase3(manager: ModelStateManager): { modelId: string; score: number }[] {
  const activeModels = manager.getActiveModels();
  const phase3Models: { modelId: string; metrics: Phase3ModelMetrics }[] = [];

  for (const modelId of activeModels) {
    const state = manager.getModelState(modelId);
    if (state !== undefined) {
      phase3Models.push({
        modelId,
        metrics: computePhase3MetricsForModel(state),
      });
    }
  }

  return rankModels(phase3Models);
}
