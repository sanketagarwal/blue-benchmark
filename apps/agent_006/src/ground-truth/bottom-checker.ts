import {
  getLocalExtremaAnnotations,
  filterPivotLows,
} from '../replay-lab/annotations.js';
import { getTimeframeConfig } from '../timeframe-config.js';

import type { TimeframeId, PivotConfig } from '../timeframe-config.js';

/** Result for a single pivot method */
export interface PivotMethodResult {
  /** Did a structural bottom (pivot low) occur in the window? */
  hasStructuralBottom: boolean;
  /** Label for scoring: 1 if bottom occurred, 0 otherwise */
  label: 0 | 1;
  /** Time to first pivot as ratio of horizon duration */
  timeToPivotRatio?: number;
  /** Timestamp of first pivot low (if any) */
  firstPivotAt?: Date;
  /** Method used for this result */
  method: 'fractal' | 'zigzag';
}

/** Dual ground truth result with both fractal and zigzag labels */
export interface DualGroundTruthResult {
  /** Primary method result (used for scoring/elimination) */
  primary: PivotMethodResult;
  /** Secondary method result (for comparison data collection) */
  secondary: PivotMethodResult;
}

/**
 * Resolve ground truth for a single pivot method
 * @param symbolId - Trading symbol
 * @param pivotConfig - Pivot configuration with method and params
 * @param predictedAt - Time prediction was made
 * @param closesAt - Time window closes
 * @param durationMs - Window duration in milliseconds
 * @returns Pivot method result with label and timing metrics
 */
async function resolveWithMethod(
  symbolId: string,
  pivotConfig: PivotConfig,
  predictedAt: Date,
  closesAt: Date,
  durationMs: number
): Promise<PivotMethodResult> {
  const method = pivotConfig.spec.method;
  const candleTimeframe = pivotConfig.barTimeframe;

  // Build params based on method
  const params = pivotConfig.spec.params;
  const annotationParams =
    method === 'fractal'
      ? { L: (params as { L: number }).L, candleTimeframe }
      : {
          deviationPct: (params as { deviationPct: number }).deviationPct,
          candleTimeframe,
        };

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
  const label: 0 | 1 = hasStructuralBottom ? 1 : 0;

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
      method,
    };
  }

  return {
    hasStructuralBottom,
    label,
    method,
  };
}

/**
 * Resolve dual ground truth for a bottom prediction.
 *
 * Returns BOTH fractal and zigzag labels for every prediction,
 * allowing comparison of methods with real data.
 *
 * Primary method is used for scoring/elimination.
 * Secondary method is captured for analysis.
 *
 * @param symbolId - Trading symbol
 * @param timeframeId - Prediction timeframe
 * @param predictedAt - Time prediction was made (snapTime)
 * @returns Dual ground truth result with both method labels
 */
export async function resolveDualGroundTruth(
  symbolId: string,
  timeframeId: TimeframeId,
  predictedAt: Date
): Promise<DualGroundTruthResult> {
  const config = getTimeframeConfig(timeframeId);
  const durationMs = config.groundTruth.window.durationMinutes * 60_000;
  const closesAt = new Date(predictedAt.getTime() + durationMs);

  // Resolve both methods in parallel
  const [primary, secondary] = await Promise.all([
    resolveWithMethod(
      symbolId,
      config.groundTruth.pivot,
      predictedAt,
      closesAt,
      durationMs
    ),
    resolveWithMethod(
      symbolId,
      config.groundTruth.secondaryPivot,
      predictedAt,
      closesAt,
      durationMs
    ),
  ]);

  return { primary, secondary };
}

/** @deprecated Use resolveDualGroundTruth instead */
export interface GroundTruthResult {
  hasStructuralBottom: boolean;
  label: 0 | 1;
  timeToPivotRatio?: number | undefined;
  firstPivotAt?: Date | undefined;
}

/**
 * @deprecated Use resolveDualGroundTruth instead
 * Resolve ground truth for a bottom prediction using primary method only.
 * @param symbolId - Trading symbol
 * @param timeframeId - Prediction timeframe
 * @param predictedAt - Time prediction was made
 * @returns Ground truth result with label and timing metrics
 */
export async function resolveBottomGroundTruth(
  symbolId: string,
  timeframeId: TimeframeId,
  predictedAt: Date
// eslint-disable-next-line @typescript-eslint/no-deprecated -- legacy wrapper returns deprecated type
): Promise<GroundTruthResult> {
  const result = await resolveDualGroundTruth(symbolId, timeframeId, predictedAt);
  return {
    hasStructuralBottom: result.primary.hasStructuralBottom,
    label: result.primary.label,
    timeToPivotRatio: result.primary.timeToPivotRatio,
    firstPivotAt: result.primary.firstPivotAt,
  };
}
