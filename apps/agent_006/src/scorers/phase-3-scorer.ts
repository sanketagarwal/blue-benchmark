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
