import {
  getBottomHoldAnnotations,
  didBottomHold,
  type BottomHoldAnnotation,
} from '../replay-lab/annotations.js';
import { getTimeframeConfig } from '../timeframe-config.js';

import type { TimeframeId, TimeframeConfig } from '../timeframe-config.js';

export interface BottomHoldResult {
  hasHeldBottom: boolean;
  label: 0 | 1;
  timeToPivotRatio?: number;
  firstBottomAt?: Date;
}

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

async function resolveBottomHold(
  symbolId: string,
  config: TimeframeConfig,
  predictedAt: Date,
  closesAt: Date,
  durationMs: number
): Promise<BottomHoldResult> {
  const horizonBars = config.task.forwardWindowMinutes / config.chart.barSizeMinutes;
  const lookbackBars = config.chart.range.fromMinutesAgo / config.chart.barSizeMinutes;

  const params = {
    lookbackCandles: lookbackBars,
    horizonCandles: horizonBars,
    maxDrawdownFrac: config.task.maxDrawdown,
    candleTimeframe: config.chart.barTimeframe,
  };

  const annotations = await getBottomHoldAnnotations(
    symbolId,
    params,
    predictedAt,
    closesAt,
    closesAt // availableAt = closesAt to prevent lookahead
  );

  const heldBottoms = annotations.filter(didBottomHold);
  const hasHeldBottom = heldBottoms.length > 0;
  const label: 0 | 1 = hasHeldBottom ? 1 : 0;

  const firstHeldBottom = heldBottoms[0];
  if (hasHeldBottom && firstHeldBottom !== undefined) {
    let earliest = firstHeldBottom;
    for (const a of heldBottoms) {
      if (new Date(a.time_start) < new Date(earliest.time_start)) {
        earliest = a;
      }
    }
    const bottomTime = new Date(earliest.time_start);
    const timeToPivotRatio = (bottomTime.getTime() - predictedAt.getTime()) / durationMs;

    return {
      hasHeldBottom,
      label,
      timeToPivotRatio,
      firstBottomAt: bottomTime,
    };
  }

  return { hasHeldBottom, label };
}

/**
 * Resolve dual ground truth for a bottom prediction.
 *
 * Uses bottom_hold method to determine if price held above the lookback low.
 * Returns same structure for backwards compatibility with dual-method interface.
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

  const result = await resolveBottomHold(symbolId, config, predictedAt, closesAt, durationMs);

  const pivotResult: PivotMethodResult = {
    hasStructuralBottom: result.hasHeldBottom,
    label: result.label,
    method: 'fractal', // Legacy field, not meaningful for bottom_hold
  };

  if (result.timeToPivotRatio !== undefined) {
    pivotResult.timeToPivotRatio = result.timeToPivotRatio;
  }
  if (result.firstBottomAt !== undefined) {
    pivotResult.firstPivotAt = result.firstBottomAt;
  }

  return { primary: pivotResult, secondary: pivotResult };
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

export type { BottomHoldAnnotation };
