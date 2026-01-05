import { logLoss } from '../scorers/log-loss-scorer.js';

import type { TimeframeId } from '../timeframe-config.js';

export interface EnsembleConfig {
  rollingWindowSize: number;
  alpha: number;
  minModels: number;
}

export interface ModelRoundPrediction {
  modelId: string;
  prediction: number;
  failed: boolean;
}

export interface ModelHistory {
  modelId: string;
  logLossByRound: number[];
  effectiveRounds: number;
}

export interface EnsembleRoundResult {
  round: number;
  horizon: TimeframeId;
  pEnsemble: number;
  isScoreable: boolean;
  weights: Map<string, number>;
  contributingModels: number;
  weightEntropy: number;
}

export interface EnsemblePerformance {
  horizon: TimeframeId;
  meanLogLoss: number;
  bestWindowLogLoss: number;
  stability: number;
  roundResults: EnsembleRoundResult[];
}

const DEFAULT_ROLLING_WINDOW_SIZE = 6;
const DEFAULT_ALPHA = 4;
const DEFAULT_MIN_MODELS = 3;

export function getDefaultEnsembleConfig(): EnsembleConfig {
  return {
    rollingWindowSize: DEFAULT_ROLLING_WINDOW_SIZE,
    alpha: DEFAULT_ALPHA,
    minModels: DEFAULT_MIN_MODELS,
  };
}

export function computeRollingMeanLL(
  history: ModelHistory,
  windowSize: number
): number {
  const losses = history.logLossByRound;
  if (losses.length === 0) {
    return Infinity;
  }

  if (losses.length < windowSize) {
    return losses.reduce((sum, ll) => sum + ll, 0) / losses.length;
  }

  const windowStart = losses.length - windowSize;
  let sum = 0;
  for (let index = windowStart; index < losses.length; index++) {
    // eslint-disable-next-line security/detect-object-injection -- index is a controlled loop counter within array bounds
    const loss = losses[index];
    if (loss === undefined) {
      throw new Error(`Unexpected undefined loss at index ${String(index)}`);
    }
    sum += loss;
  }
  return sum / windowSize;
}

export function computeModelWeights(
  histories: ModelHistory[],
  round: number,
  config: EnsembleConfig
): Map<string, number> {
  const weights = new Map<string, number>();

  const truncatedHistories = histories.map(h => ({
    ...h,
    logLossByRound: h.logLossByRound.slice(0, round),
  }));

  const rawWeights = new Map<string, number>();
  let totalRawWeight = 0;

  for (const history of truncatedHistories) {
    if (history.logLossByRound.length === 0) {
      rawWeights.set(history.modelId, 1);
      totalRawWeight += 1;
      continue;
    }

    const rollingLL = computeRollingMeanLL(history, config.rollingWindowSize);

    if (!Number.isFinite(rollingLL)) {
      continue;
    }

    const coverageFactor = Math.min(1, history.effectiveRounds / config.rollingWindowSize);
    const rawWeight = Math.exp(-config.alpha * rollingLL) * coverageFactor;

    rawWeights.set(history.modelId, rawWeight);
    totalRawWeight += rawWeight;
  }

  if (totalRawWeight === 0) {
    for (const history of histories) {
      weights.set(history.modelId, 1 / histories.length);
    }
    return weights;
  }

  for (const [modelId, rawWeight] of rawWeights) {
    weights.set(modelId, rawWeight / totalRawWeight);
  }

  return weights;
}

export function computeWeightEntropy(weights: Map<string, number>): number {
  if (weights.size === 0) {
    return 0;
  }

  let entropy = 0;
  for (const weight of weights.values()) {
    if (weight > 0) {
      entropy -= weight * Math.log(weight);
    }
  }

  return entropy;
}

export function computeEnsemblePrediction(
  predictions: ModelRoundPrediction[],
  weights: Map<string, number>,
  config: EnsembleConfig
): EnsembleRoundResult {
  const validPredictions = predictions.filter(p => !p.failed);

  const isScoreable = validPredictions.length >= config.minModels;

  if (!isScoreable) {
    return {
      round: -1,
      horizon: '15m',
      pEnsemble: 0.5,
      isScoreable: false,
      weights: new Map(),
      contributingModels: validPredictions.length,
      weightEntropy: 0,
    };
  }

  const contributingWeights = new Map<string, number>();
  let totalWeight = 0;

  for (const pred of validPredictions) {
    const weight = weights.get(pred.modelId) ?? 0;
    if (weight > 0) {
      contributingWeights.set(pred.modelId, weight);
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) {
    const uniformWeight = 1 / validPredictions.length;
    for (const pred of validPredictions) {
      contributingWeights.set(pred.modelId, uniformWeight);
    }
    totalWeight = 1;
  }

  const normalizedWeights = new Map<string, number>();
  for (const [modelId, weight] of contributingWeights) {
    normalizedWeights.set(modelId, weight / totalWeight);
  }

  let pEnsemble = 0;
  for (const pred of validPredictions) {
    const normalizedWeight = normalizedWeights.get(pred.modelId) ?? 0;
    pEnsemble += normalizedWeight * pred.prediction;
  }

  pEnsemble = Math.max(0, Math.min(1, pEnsemble));

  return {
    round: -1,
    horizon: '15m',
    pEnsemble,
    isScoreable: true,
    weights: normalizedWeights,
    contributingModels: validPredictions.length,
    weightEntropy: computeWeightEntropy(normalizedWeights),
  };
}

const WINDOW_SIZE = 6;

function computeRollingWindows(roundLosses: number[], windowSize: number = WINDOW_SIZE): number[] {
  const windows: number[] = [];

  for (let index = 0; index <= roundLosses.length - windowSize; index++) {
    const windowSlice = roundLosses.slice(index, index + windowSize);
    const avg = windowSlice.reduce((a, b) => a + b, 0) / windowSlice.length;
    windows.push(avg);
  }

  return windows;
}

export function scoreEnsemble(
  roundResults: EnsembleRoundResult[],
  labels: boolean[],
  horizon: TimeframeId
): EnsemblePerformance {
  const scoreableResults = roundResults.filter(r => r.isScoreable);

  if (scoreableResults.length === 0) {
    return {
      horizon,
      meanLogLoss: Infinity,
      bestWindowLogLoss: Infinity,
      stability: Infinity,
      roundResults,
    };
  }

  const roundLosses: number[] = [];

  for (const result of scoreableResults) {
    const label = labels[result.round];
    if (label === undefined) {
      continue;
    }
    const ll = logLoss(result.pEnsemble, label);
    roundLosses.push(ll);
  }

  if (roundLosses.length === 0) {
    return {
      horizon,
      meanLogLoss: Infinity,
      bestWindowLogLoss: Infinity,
      stability: Infinity,
      roundResults,
    };
  }

  const meanLogLoss = roundLosses.reduce((sum, ll) => sum + ll, 0) / roundLosses.length;

  const windows = computeRollingWindows(roundLosses);
  const bestWindowLogLoss = windows.length > 0 ? Math.min(...windows) : meanLogLoss;

  const mean = meanLogLoss;
  const variance = roundLosses.reduce((sum, ll) => sum + (ll - mean) ** 2, 0) / roundLosses.length;
  const stability = Math.sqrt(variance);

  return {
    horizon,
    meanLogLoss,
    bestWindowLogLoss,
    stability,
    roundResults,
  };
}
