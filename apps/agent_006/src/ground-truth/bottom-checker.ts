import {
  getHorizonDuration,
  getAnnotationMethod,
} from '../horizon-config.js';
import {
  getLocalExtremaAnnotations,
  filterPivotLows,
} from '../replay-lab/annotations.js';

import type { Horizon } from '../horizon-config.js';

export interface GroundTruthResult {
  /** Did a structural bottom (pivot low) occur in the window? */
  hasStructuralBottom: boolean;
  /** Label for scoring: 1 if bottom occurred, 0 otherwise */
  label: 0 | 1;
  /** Time to first pivot as ratio of horizon duration (for Phase 3 early bonus) */
  timeToPivotRatio?: number;
  /** Timestamp of first pivot low (if any) */
  firstPivotAt?: Date;
}

/**
 * Resolve ground truth for a bottom prediction.
 *
 * A prediction is correct (label = 1) if a local_extrema pivot LOW
 * exists within [predictedAt, closesAt].
 *
 * Uses Williams Fractal for short horizons (15m, 1h) and
 * Zigzag for longer horizons (24h, 7d).
 *
 * @param symbolId - Trading symbol
 * @param horizon - Prediction horizon
 * @param predictedAt - Time prediction was made
 * @returns Ground truth result
 */
export async function resolveBottomGroundTruth(
  symbolId: string,
  horizon: Horizon,
  predictedAt: Date
): Promise<GroundTruthResult> {
  const horizonDuration = getHorizonDuration(horizon);
  const closesAt = new Date(predictedAt.getTime() + horizonDuration);
  const { method, params } = getAnnotationMethod(horizon);

  // Fetch local_extrema annotations confirmed by closesAt
  const allAnnotations = await getLocalExtremaAnnotations(
    symbolId,
    method,
    params,
    predictedAt,
    closesAt,
    closesAt // availableAt = closesAt to prevent lookahead
  );

  // Filter to pivot LOWs only
  const pivotLows = filterPivotLows(allAnnotations);
  const hasStructuralBottom = pivotLows.length > 0;
  const label = hasStructuralBottom ? 1 : 0;

  // Compute timing metrics if pivot occurred
  if (hasStructuralBottom && pivotLows.length > 0) {
    const pivotTimes = pivotLows.map((p) => new Date(p.time_start).getTime());
    const earliestPivotMs = Math.min(...pivotTimes);
    const firstPivotAt = new Date(earliestPivotMs);
    const timeToPivot = earliestPivotMs - predictedAt.getTime();
    const timeToPivotRatio = timeToPivot / horizonDuration;

    return {
      hasStructuralBottom,
      label,
      timeToPivotRatio,
      firstPivotAt,
    };
  }

  return {
    hasStructuralBottom,
    label,
  };
}
