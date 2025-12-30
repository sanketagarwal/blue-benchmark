import type { Horizon } from '../horizon-config.js';

export interface Phase1ModelScore {
  modelId: string;
  meanLogLoss: Record<Horizon, number>;
}

const HORIZONS: Horizon[] = ['15m', '1h', '24h', '7d'];

/**
 * Compute percentile ranks for each model per horizon.
 * Lower log loss = higher percentile (better).
 * @param modelScores - Array of model scores
 * @returns Map of model ID to percentile ranks by horizon
 */
export function computePercentileRanks(
  modelScores: Phase1ModelScore[]
): Map<string, Record<Horizon, number>> {
  const ranks = new Map<string, Record<Horizon, number>>();

  // Initialize
  for (const score of modelScores) {
    ranks.set(score.modelId, { '15m': 0, '1h': 0, '24h': 0, '7d': 0 });
  }

  // Compute percentile per horizon
  for (const horizon of HORIZONS) {
    // Sort by log loss ascending (best first)
    const sorted = [...modelScores].sort(
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      (a, b) => a.meanLogLoss[horizon] - b.meanLogLoss[horizon]
    );

    const n = sorted.length;
    for (let index = 0; index < n; index++) {
      // eslint-disable-next-line security/detect-object-injection -- index from controlled loop
      const model = sorted[index];
      if (model === undefined) {
        continue;
      }

      // Percentile: 100 * (n - rank) / n
      // Best (rank 0) gets ~100, worst gets ~0
      const percentile = (100 * (n - 1 - index)) / (n - 1);
      const modelRanks = ranks.get(model.modelId);
      if (modelRanks !== undefined) {
        // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
        modelRanks[horizon] = percentile;
      }
    }
  }

  return ranks;
}

/**
 * Determine if model should be eliminated in Phase 1
 * @param percentiles - Percentile ranks by horizon
 * @returns True if model should be eliminated
 */
export function shouldEliminatePhase1(percentiles: Record<Horizon, number>): boolean {
  // Count horizons with percentile < 25 (bottom quartile)
  const horizonsBelowThreshold = HORIZONS.filter(
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    (h) => percentiles[h] < 25
  ).length;

  // Eliminate if bottom quartile on 2+ horizons
  if (horizonsBelowThreshold >= 2) {
    return true;
  }

  // Check if any horizon has percentile >= 75 (top quartile strength)
  // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
  const hasStrength = HORIZONS.some((h) => percentiles[h] >= 75);

  // Eliminate if no horizon shows strength
  if (!hasStrength) {
    return true;
  }

  return false;
}
