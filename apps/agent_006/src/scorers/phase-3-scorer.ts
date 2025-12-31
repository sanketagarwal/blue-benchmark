import type { Horizon } from '../horizon-config.js';

export interface Phase3ModelMetrics {
  avgPercentileRank: number;
  avgBestWindow: number;
  avgStability: number;
  avgTimeToPivotRatio: number;
}

export interface NormalizationRanges {
  bestWindowRange: { min: number; max: number };
  stabilityRange: { min: number; max: number };
}

const ARENA_SIZE = 8;

/**
 * Winsorize values to 5th-95th percentile
 * @param values - Array of values to winsorize
 * @returns Winsorized array
 */
export function winsorize(values: number[]): number[] {
  if (values.length === 0) {
    return [];
  }

  const sorted = [...values].sort((a, b) => a - b);
  // For 5th percentile: floor(n * 0.05) gives the index
  // For 95th percentile: floor(n * 0.95) - 1 gives the index, but min 0
  const p5Index = Math.floor(values.length * 0.05);
  const p95Index = Math.max(0, Math.floor(values.length * 0.95) - 1);

  // Safe to use .at() since we already checked values.length > 0
  const p5 = sorted.at(p5Index) ?? sorted.at(0);
  const p95 = sorted.at(p95Index) ?? sorted.at(-1);

  if (p5 === undefined || p95 === undefined) {
    throw new Error('Unexpected undefined value in winsorize');
  }

  return values.map(v => Math.max(p5, Math.min(p95, v)));
}

/**
 * Normalize values to 0-1 range
 * @param values - Array of values to normalize
 * @returns Normalized array
 */
export function normalize(values: number[]): number[] {
  if (values.length === 0) {
    return [];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (max === min) {
    return values.map(() => 0.5);
  }

  return values.map(v => (v - min) / (max - min));
}

/**
 * Compute composite score for a model
 *
 * Weights:
 * - 40% avgPercentileRank (higher is better)
 * - 30% avgBestWindow (lower is better, inverted)
 * - 20% avgStability (lower is better, inverted)
 * - 10% avgTimeToPivotRatio (lower is better, inverted = early bonus)
 *
 * @param metrics - Model metrics
 * @param ranges - Normalization ranges from cohort
 * @returns Composite score (0-1, higher is better)
 */
export function computeCompositeScore(
  metrics: Phase3ModelMetrics,
  ranges: NormalizationRanges
): number {
  // Normalize percentile rank (0-100 to 0-1)
  const normalizedRank = metrics.avgPercentileRank / 100;

  // Normalize and invert best window (lower is better)
  const bestWindowNorm =
    (metrics.avgBestWindow - ranges.bestWindowRange.min) /
    (ranges.bestWindowRange.max - ranges.bestWindowRange.min);
  const bestWindowScore = 1 - Math.max(0, Math.min(1, bestWindowNorm));

  // Normalize and invert stability (lower is better)
  const stabilityNorm =
    (metrics.avgStability - ranges.stabilityRange.min) /
    (ranges.stabilityRange.max - ranges.stabilityRange.min);
  const stabilityScore = 1 - Math.max(0, Math.min(1, stabilityNorm));

  // Time to pivot ratio is already 0-1, invert (lower = earlier = better)
  const earlyBonus = 1 - metrics.avgTimeToPivotRatio;

  // Weighted composite
  return 0.4 * normalizedRank +
    0.3 * bestWindowScore +
    0.2 * stabilityScore +
    0.1 * earlyBonus;
}

/**
 * Rank models and return top 8 arena competitors
 * @param models - Array of models with metrics
 * @returns Top 8 models sorted by composite score descending
 * @deprecated Use rankModelsForHorizon or rankModelsPerHorizon for per-horizon rankings
 */
export function rankModels(
  models: { modelId: string; metrics: Phase3ModelMetrics }[]
): { modelId: string; score: number }[] {
  // Compute normalization ranges from cohort
  const bestWindows = models.map(m => m.metrics.avgBestWindow);
  const stabilities = models.map(m => m.metrics.avgStability);

  // Winsorize before computing ranges
  const winsorizedBW = winsorize(bestWindows);
  const winsorizedStab = winsorize(stabilities);

  const ranges: NormalizationRanges = {
    bestWindowRange: {
      min: Math.min(...winsorizedBW),
      max: Math.max(...winsorizedBW),
    },
    stabilityRange: {
      min: Math.min(...winsorizedStab),
      max: Math.max(...winsorizedStab),
    },
  };

  // Score each model
  const scored = models.map(m => ({
    modelId: m.modelId,
    score: computeCompositeScore(m.metrics, ranges),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return top 8
  return scored.slice(0, ARENA_SIZE);
}

export interface HorizonMetrics {
  logLoss: number;
  bestWindow: number;
  stability: number;
}

export interface HorizonRanking {
  modelId: string;
  score: number;
  logLoss: number;
  bestWindow: number;
  stability: number;
}

export interface PerHorizonRankings {
  '15m': HorizonRanking[];
  '1h': HorizonRanking[];
  '24h': HorizonRanking[];
  '7d': HorizonRanking[];
}

export interface ModelWithHorizonMetrics {
  modelId: string;
  metrics: Phase3ModelMetrics;
  horizonMetrics: Record<Horizon, HorizonMetrics>;
  qualifiedHorizons: Set<Horizon>;
}

interface HorizonScoreRanges {
  logLossRange: { min: number; max: number };
  bestWindowRange: { min: number; max: number };
  stabilityRange: { min: number; max: number };
}

/**
 * Compute score for a model at a specific horizon
 *
 * Weights:
 * - 50% logLoss (lower is better, inverted)
 * - 30% bestWindow (lower is better, inverted)
 * - 20% stability (lower is better, inverted)
 *
 * @param horizonMetrics - Metrics for the specific horizon
 * @param ranges - Normalization ranges from cohort
 * @returns Score (0-1, higher is better)
 */
function computeHorizonScore(
  horizonMetrics: HorizonMetrics,
  ranges: HorizonScoreRanges
): number {
  // Normalize and invert log loss (lower is better)
  const logLossNorm =
    ranges.logLossRange.max === ranges.logLossRange.min
      ? 0.5
      : (horizonMetrics.logLoss - ranges.logLossRange.min) /
        (ranges.logLossRange.max - ranges.logLossRange.min);
  const logLossScore = 1 - Math.max(0, Math.min(1, logLossNorm));

  // Normalize and invert best window (lower is better)
  const bestWindowNorm =
    ranges.bestWindowRange.max === ranges.bestWindowRange.min
      ? 0.5
      : (horizonMetrics.bestWindow - ranges.bestWindowRange.min) /
        (ranges.bestWindowRange.max - ranges.bestWindowRange.min);
  const bestWindowScore = 1 - Math.max(0, Math.min(1, bestWindowNorm));

  // Normalize and invert stability (lower is better)
  const stabilityNorm =
    ranges.stabilityRange.max === ranges.stabilityRange.min
      ? 0.5
      : (horizonMetrics.stability - ranges.stabilityRange.min) /
        (ranges.stabilityRange.max - ranges.stabilityRange.min);
  const stabilityScore = 1 - Math.max(0, Math.min(1, stabilityNorm));

  // Weighted composite
  return 0.5 * logLossScore + 0.3 * bestWindowScore + 0.2 * stabilityScore;
}

/**
 * Rank models for a specific horizon
 * @param models - Array of model metrics
 * @param horizon - The horizon to rank for
 * @returns Sorted array of rankings for that horizon (best first)
 */
export function rankModelsForHorizon(
  models: ModelWithHorizonMetrics[],
  horizon: Horizon
): HorizonRanking[] {
  // Filter to models that are qualified for this horizon AND have valid data
  const validModels = models.filter(m => {
    // Must be qualified for this horizon
    if (!m.qualifiedHorizons.has(horizon)) {
      return false;
    }
    // eslint-disable-next-line security/detect-object-injection -- Horizon is a typed union, not user input
    const hm = m.horizonMetrics[horizon];
    return (
      Number.isFinite(hm.logLoss) &&
      Number.isFinite(hm.bestWindow) &&
      Number.isFinite(hm.stability)
    );
  });

  if (validModels.length === 0) {
    return [];
  }

  // Extract metrics for this horizon
  // eslint-disable-next-line security/detect-object-injection -- Horizon is a typed union, not user input
  const logLosses = validModels.map(m => m.horizonMetrics[horizon].logLoss);
  // eslint-disable-next-line security/detect-object-injection -- Horizon is a typed union, not user input
  const bestWindows = validModels.map(m => m.horizonMetrics[horizon].bestWindow);
  // eslint-disable-next-line security/detect-object-injection -- Horizon is a typed union, not user input
  const stabilities = validModels.map(m => m.horizonMetrics[horizon].stability);

  // Winsorize before computing ranges
  const winsorizedLL = winsorize(logLosses);
  const winsorizedBW = winsorize(bestWindows);
  const winsorizedStab = winsorize(stabilities);

  const ranges = {
    logLossRange: {
      min: Math.min(...winsorizedLL),
      max: Math.max(...winsorizedLL),
    },
    bestWindowRange: {
      min: Math.min(...winsorizedBW),
      max: Math.max(...winsorizedBW),
    },
    stabilityRange: {
      min: Math.min(...winsorizedStab),
      max: Math.max(...winsorizedStab),
    },
  };

  // Score each model
  const scored = validModels.map(m => {
    // eslint-disable-next-line security/detect-object-injection -- Horizon is a typed union, not user input
    const hm = m.horizonMetrics[horizon];
    return {
      modelId: m.modelId,
      score: computeHorizonScore(hm, ranges),
      logLoss: hm.logLoss,
      bestWindow: hm.bestWindow,
      stability: hm.stability,
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return top 8
  return scored.slice(0, ARENA_SIZE);
}

/**
 * Rank models for all horizons
 * @param models - Array of models with horizon metrics
 * @returns Rankings for each horizon
 */
export function rankModelsPerHorizon(
  models: ModelWithHorizonMetrics[]
): PerHorizonRankings {
  return {
    '15m': rankModelsForHorizon(models, '15m'),
    '1h': rankModelsForHorizon(models, '1h'),
    '24h': rankModelsForHorizon(models, '24h'),
    '7d': rankModelsForHorizon(models, '7d'),
  };
}
