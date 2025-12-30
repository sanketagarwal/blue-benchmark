import type { Horizon } from '../horizon-config.js';

export interface Phase2ModelScore {
  modelId: string;
  regretByHorizon: Record<Horizon, number>;
  stabilityByHorizon: Record<Horizon, number>;
  bestWindowByHorizon?: Record<Horizon, number>;
  worstWindowByHorizon?: Record<Horizon, number>;
  timeToPivotRatioByHorizon?: Record<Horizon, number>;
}

export interface StabilityMetrics {
  bestWindow: number;
  worstWindow: number;
  variance: number;
}

const HORIZONS: Horizon[] = ['15m', '1h', '24h', '7d'];
const WINDOW_SIZE = 6;

/**
 * Compute rolling window averages
 * @param roundLosses - Array of round losses
 * @param windowSize - Size of rolling window (default 6)
 * @returns Array of window averages
 */
export function computeRollingWindows(
  roundLosses: number[],
  windowSize: number = WINDOW_SIZE
): number[] {
  const windows: number[] = [];

  for (let index = 0; index <= roundLosses.length - windowSize; index++) {
    const windowSlice = roundLosses.slice(index, index + windowSize);
    const avg = windowSlice.reduce((a, b) => a + b, 0) / windowSlice.length;
    windows.push(avg);
  }

  return windows;
}

/**
 * Compute stability metrics from round losses
 * @param roundLosses - Array of round losses
 * @returns Stability metrics (best/worst window, variance)
 */
export function computeStabilityMetrics(roundLosses: number[]): StabilityMetrics {
  const windows = computeRollingWindows(roundLosses);

  if (windows.length === 0) {
    return { bestWindow: 0, worstWindow: 0, variance: 0 };
  }

  const bestWindow = Math.min(...windows);
  const worstWindow = Math.max(...windows);

  // Variance of rolling performance
  const mean = windows.reduce((a, b) => a + b, 0) / windows.length;
  const variance = windows.reduce((sum, w) => sum + (w - mean) ** 2, 0) / windows.length;

  return { bestWindow, worstWindow, variance };
}

/**
 * Compute regret: model's worstWindow / median of all worstWindows
 * @param modelWorstWindow - Model's worst window value
 * @param medianWorstWindow - Median worst window across cohort
 * @returns Regret value
 */
export function computeRegret(
  modelWorstWindow: number,
  medianWorstWindow: number
): number {
  if (medianWorstWindow === 0) {
    return 1;
  }
  return modelWorstWindow / medianWorstWindow;
}

/**
 * Determine if model should be eliminated in Phase 2
 * @param modelScore - Model's Phase 2 score
 * @param medianStability - Median stability values per horizon
 * @returns True if model should be eliminated
 */
export function shouldEliminatePhase2(
  modelScore: Phase2ModelScore,
  medianStability: Record<Horizon, number>
): boolean {
  // Count horizons with regret > 1.5
  const horizonsHighRegret = HORIZONS.filter(
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    h => modelScore.regretByHorizon[h] > 1.5
  ).length;

  // Eliminate if regret > 1.5 on 2+ horizons
  if (horizonsHighRegret >= 2) {
    return true;
  }

  // Count horizons with stability > 2x median
  const horizonsUnstable = HORIZONS.filter(
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    h => modelScore.stabilityByHorizon[h] > 2 * medianStability[h]
  ).length;

  // Eliminate if stability > 2x median on 3+ horizons
  if (horizonsUnstable >= 3) {
    return true;
  }

  return false;
}

const MEDIAN_UNDEFINED_ERROR = 'Unexpected undefined in median calculation';

/**
 * Compute median of array
 * @param values - Array of numbers
 * @returns Median value
 */
export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const lower = sorted.at(mid - 1);
    const upper = sorted.at(mid);
    if (lower === undefined || upper === undefined) {
      throw new Error(MEDIAN_UNDEFINED_ERROR);
    }
    return (lower + upper) / 2;
  }
  const middle = sorted.at(mid);
  if (middle === undefined) {
    throw new Error(MEDIAN_UNDEFINED_ERROR);
  }
  return middle;
}
