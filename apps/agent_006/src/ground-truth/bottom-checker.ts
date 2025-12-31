import {
  getLocalExtremaAnnotations,
  filterPivotLows,
} from '../replay-lab/annotations.js';
import { getTimeframeConfig } from '../timeframe-config.js';

import type { TimeframeId } from '../timeframe-config.js';

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
 * Uses Williams Fractal for short timeframes (15m, 1h) and
 * Zigzag for longer timeframes (24h, 7d).
 *
 * @param symbolId - Trading symbol
 * @param timeframeId - Prediction timeframe
 * @param predictedAt - Time prediction was made
 * @returns Ground truth result
 */
export async function resolveBottomGroundTruth(
  symbolId: string,
  timeframeId: TimeframeId,
  predictedAt: Date
): Promise<GroundTruthResult> {
  const config = getTimeframeConfig(timeframeId);
  const durationMs = config.groundTruth.window.durationMinutes * 60_000;
  const closesAt = new Date(predictedAt.getTime() + durationMs);

  const pivotConfig = config.groundTruth.pivot;
  const method = pivotConfig.spec.method;
  const candleTimeframe = pivotConfig.barTimeframe;

  // Build params based on method
  const params = pivotConfig.spec.params;
  const annotationParams =
    method === 'fractal'
      ? { L: (params as { L: number }).L, candleTimeframe }
      : { deviationPct: (params as { deviationPct: number }).deviationPct, candleTimeframe };

  // Fetch local_extrema annotations confirmed by closesAt
  const allAnnotations = await getLocalExtremaAnnotations(
    symbolId,
    method,
    annotationParams,
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
    const timeToPivotRatio = timeToPivot / durationMs;

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
