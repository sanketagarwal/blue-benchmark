/**
 * Prediction diversity diagnostics for detecting constant/cached predictions.
 * These metrics help identify models that are not actually responding to inputs.
 */

import type { TimeframeId } from '../timeframe-config.js';

/**
 * Prediction diversity metrics for a single horizon
 */
export interface HorizonPredictionDiversity {
  /** Number of predictions analyzed */
  n: number;
  /** Number of unique probability values */
  uniquePCount: number;
  /** Minimum probability */
  pMin: number;
  /** Maximum probability */
  pMax: number;
  /** Mean probability */
  pMean: number;
  /** Standard deviation of probabilities */
  pStdDev: number;
  /** Standard deviation of confidence values */
  confidenceStdDev: number;
  /** Rate of noNewLow=true predictions */
  noNewLowTrueRate: number;
}

/**
 * Prediction diversity for all horizons
 */
export interface ModelPredictionDiversity {
  modelId: string;
  byHorizon: Record<TimeframeId, HorizonPredictionDiversity>;
}

/**
 * Single prediction record for analysis
 */
export interface PredictionRecord {
  noNewLow: boolean;
  confidence: number;
  /** Computed probability: noNewLow ? confidence : 1 - confidence */
  probability: number;
}

const HORIZONS: TimeframeId[] = ['15m', '1h', '4h', '24h'];

/**
 * Compute standard deviation of an array of numbers.
 * @param values - Array of numeric values to analyze
 * @returns Standard deviation of the values, or 0 if empty or single value
 */
export function computeStandardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  if (values.length === 1) {
    return 0;
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Compute prediction diversity metrics for a single horizon.
 * @param predictions - Array of prediction records to analyze
 * @returns Diversity metrics including unique count, range, and rates
 */
export function computeHorizonPredictionDiversity(
  predictions: PredictionRecord[]
): HorizonPredictionDiversity {
  const n = predictions.length;

  if (n === 0) {
    return {
      n: 0,
      uniquePCount: 0,
      pMin: 0,
      pMax: 0,
      pMean: 0,
      pStdDev: 0,
      confidenceStdDev: 0,
      noNewLowTrueRate: 0,
    };
  }

  const probabilities = predictions.map((p) => p.probability);
  const confidences = predictions.map((p) => p.confidence);
  const noNewLowTrueCount = predictions.filter((p) => p.noNewLow).length;

  // Count unique probabilities (round to 6 decimal places for comparison)
  const uniquePs = new Set(probabilities.map((p) => p.toFixed(6)));

  // Compute mean probability
  const pMean = probabilities.reduce((a, b) => a + b, 0) / n;

  return {
    n,
    uniquePCount: uniquePs.size,
    pMin: Math.min(...probabilities),
    pMax: Math.max(...probabilities),
    pMean,
    pStdDev: computeStandardDeviation(probabilities),
    confidenceStdDev: computeStandardDeviation(confidences),
    noNewLowTrueRate: noNewLowTrueCount / n,
  };
}

/**
 * Compute prediction diversity for all horizons for a single model.
 * @param modelId - Identifier for the model being analyzed
 * @param predictionsByHorizon - Map of horizon IDs to prediction records
 * @returns Model diversity metrics across all horizons
 */
export function computeModelPredictionDiversity(
  modelId: string,
  predictionsByHorizon: Record<TimeframeId, PredictionRecord[]>
): ModelPredictionDiversity {
  const byHorizon = {} as Record<TimeframeId, HorizonPredictionDiversity>;

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const horizonPredictions = predictionsByHorizon[horizon] as
      | PredictionRecord[]
      | undefined;
    const predictions = horizonPredictions ?? [];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    byHorizon[horizon] = computeHorizonPredictionDiversity(predictions);
  }

  return { modelId, byHorizon };
}

/**
 * Check if a model appears to be outputting constant predictions.
 * This indicates caching or fallback behavior.
 * @param diversity - Horizon diversity metrics to analyze
 * @returns True if all predictions are identical (constant predictor)
 */
export function isConstantPredictor(
  diversity: HorizonPredictionDiversity
): boolean {
  // If all predictions are the same, uniquePCount = 1
  return diversity.uniquePCount <= 1 && diversity.n > 1;
}

/**
 * Format prediction diversity as a human-readable string.
 * @param diversity - Model diversity metrics to format
 * @returns Multi-line string with formatted diversity info
 */
export function formatPredictionDiversity(
  diversity: ModelPredictionDiversity
): string {
  const lines: string[] = [];
  lines.push(`Model: ${diversity.modelId}`);

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const d = diversity.byHorizon[horizon];
    const constantWarning = isConstantPredictor(d) ? ' ⚠️ CONSTANT' : '';
    lines.push(
      `  ${horizon}: n=${String(d.n)}, unique=${String(d.uniquePCount)}, ` +
        `range=[${d.pMin.toFixed(3)}, ${d.pMax.toFixed(3)}], ` +
        `σ=${d.pStdDev.toFixed(3)}, noNewLowRate=${d.noNewLowTrueRate.toFixed(2)}${constantWarning}`
    );
  }

  return lines.join('\n');
}
