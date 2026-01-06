/**
 * Dataset diagnostics for understanding label distribution and baseline performance.
 * These metrics are essential for interpreting model performance.
 */

import type { TimeframeId } from '../timeframe-config.js';

/**
 * Label distribution for a single horizon
 */
export interface HorizonLabelDistribution {
  /** Total examples scored */
  n: number;
  /** Count of noNewLow = true labels */
  countTrue: number;
  /** Count of noNewLow = false labels */
  countFalse: number;
  /** Prevalence: countTrue / n */
  pTrue: number;
}

/**
 * Baseline log loss values for comparison
 */
export interface BaselineMetrics {
  /** Random baseline (p=0.5 for all): always log(2) ≈ 0.693 */
  randomLogLoss: number;
  /** Prevalence baseline (predict pTrue for all): optimal constant predictor */
  prevalenceLogLoss: number;
}

/**
 * Complete dataset diagnostics for a horizon
 */
export interface HorizonDatasetDiagnostics {
  horizon: TimeframeId;
  labels: HorizonLabelDistribution;
  baselines: BaselineMetrics;
}

/**
 * Dataset diagnostics for all horizons
 */
export interface DatasetDiagnostics {
  byHorizon: Record<TimeframeId, HorizonDatasetDiagnostics>;
  /** Total rounds across all horizons */
  totalRounds: number;
}

const EPSILON = 1e-15;
const LOG_2 = Math.log(2);

/**
 * Compute log loss for a single prediction
 * @param probability - Predicted probability
 * @param actualLabel - Ground truth label
 * @returns Log loss value
 */
function logLoss(probability: number, actualLabel: boolean): number {
  const pClipped = Math.max(EPSILON, Math.min(1 - EPSILON, probability));
  return actualLabel ? -Math.log(pClipped) : -Math.log(1 - pClipped);
}

/**
 * Compute label distribution from an array of boolean labels
 * @param labels - Array of ground truth labels
 * @returns Label distribution statistics
 */
export function computeLabelDistribution(labels: boolean[]): HorizonLabelDistribution {
  const n = labels.length;
  if (n === 0) {
    return { n: 0, countTrue: 0, countFalse: 0, pTrue: 0 };
  }

  const countTrue = labels.filter(Boolean).length;
  const countFalse = n - countTrue;
  const pTrue = countTrue / n;

  return { n, countTrue, countFalse, pTrue };
}

/**
 * Compute baseline log loss values
 * @param labels - Array of ground truth labels
 * @returns Baseline metrics for comparison
 */
export function computeBaselineMetrics(labels: boolean[]): BaselineMetrics {
  if (labels.length === 0) {
    return { randomLogLoss: LOG_2, prevalenceLogLoss: LOG_2 };
  }

  const randomLogLoss = LOG_2;

  const pTrue = labels.filter(Boolean).length / labels.length;

  let prevalenceSum = 0;
  for (const label of labels) {
    prevalenceSum += logLoss(pTrue, label);
  }
  const prevalenceLogLoss = prevalenceSum / labels.length;

  return { randomLogLoss, prevalenceLogLoss };
}

/**
 * Compute dataset diagnostics for a single horizon
 * @param horizon - Timeframe ID
 * @param labels - Array of ground truth labels for this horizon
 * @returns Complete horizon diagnostics
 */
export function computeHorizonDiagnostics(
  horizon: TimeframeId,
  labels: boolean[]
): HorizonDatasetDiagnostics {
  const labelDistribution = computeLabelDistribution(labels);
  const baselines = computeBaselineMetrics(labels);

  return {
    horizon,
    labels: labelDistribution,
    baselines,
  };
}

/**
 * Compute dataset diagnostics for all horizons
 * @param labelsByHorizon - Record mapping timeframe IDs to label arrays
 * @returns Complete dataset diagnostics
 */
export function computeDatasetDiagnostics(
  labelsByHorizon: Record<TimeframeId, boolean[]>
): DatasetDiagnostics {
  const horizons: TimeframeId[] = ['15m', '1h', '4h', '24h'];
  const byHorizon: Record<TimeframeId, HorizonDatasetDiagnostics> = {} as Record<TimeframeId, HorizonDatasetDiagnostics>;

  let totalRounds = 0;

  for (const horizon of horizons) {
    // eslint-disable-next-line security/detect-object-injection -- horizon is from typed constant array
    const labels = labelsByHorizon[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon is from typed constant array
    byHorizon[horizon] = computeHorizonDiagnostics(horizon, labels);
    totalRounds = Math.max(totalRounds, labels.length);
  }

  return { byHorizon, totalRounds };
}

/**
 * Format dataset diagnostics as a human-readable string
 * @param diagnostics - Dataset diagnostics to format
 * @returns Human-readable string representation
 */
export function formatDatasetDiagnostics(diagnostics: DatasetDiagnostics): string {
  const lines: string[] = [];
  lines.push('=== Dataset Diagnostics ===');
  lines.push(`Total rounds: ${String(diagnostics.totalRounds)}`);
  lines.push('');

  for (const horizon of ['15m', '1h', '4h', '24h'] as TimeframeId[]) {
    // eslint-disable-next-line security/detect-object-injection -- horizon is from typed constant array
    const d = diagnostics.byHorizon[horizon];
    lines.push(`${horizon} horizon:`);
    lines.push(`  N=${String(d.labels.n)}, True=${String(d.labels.countTrue)}, False=${String(d.labels.countFalse)}, pTrue=${d.labels.pTrue.toFixed(3)}`);
    lines.push(`  Baselines: random=${d.baselines.randomLogLoss.toFixed(3)}, prevalence=${d.baselines.prevalenceLogLoss.toFixed(3)}`);
  }

  return lines.join('\n');
}
