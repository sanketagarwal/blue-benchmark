import {
  MAX_DRAWDOWN,
  getHorizonDuration,
  getAnnotationMethod,
} from '../horizon-config.js';
import {
  getLocalExtremaAnnotations,
  filterPivotLows,
} from '../replay-lab/annotations.js';
import { getMidPriceAtTime } from '../replay-lab/mid-price.js';

import type { Horizon } from '../horizon-config.js';
import type { Trade } from '../replay-lab/trades.js';

export interface GroundTruthResult {
  hasStructuralBottom: boolean;
  maxDrawdownPct: number;
  isValid: boolean;
  timeToPivotRatio?: number;
}

/**
 * Compute max drawdown as positive magnitude.
 * Drawdown = (entryPrice - lowestPrice) / entryPrice
 * @param trades - Array of trades in the window
 * @param entryPrice - Entry price at prediction time
 * @returns Max drawdown as positive decimal (e.g., 0.02 = 2%)
 */
export function computeMaxDrawdown(trades: Trade[], entryPrice: number): number {
  if (trades.length === 0) {
    return 0;
  }

  const lowestPrice = Math.min(...trades.map((t) => t.price));
  const drawdown = (entryPrice - lowestPrice) / entryPrice;

  return Math.max(0, drawdown);
}

/**
 * Resolve ground truth for a bottom prediction.
 *
 * A prediction is valid (label = 1) if:
 * 1. A local_extrema pivot LOW exists within [predictedAt, closesAt]
 * 2. Max drawdown from predictedAt does not exceed the horizon threshold
 *
 * @param symbolId - Trading symbol
 * @param horizon - Prediction horizon
 * @param predictedAt - Time prediction was made
 * @param trades - Trades covering the full window
 * @returns Ground truth result
 */
export async function resolveBottomGroundTruth(
  symbolId: string,
  horizon: Horizon,
  predictedAt: Date,
  trades: Trade[]
): Promise<GroundTruthResult> {
  const horizonDuration = getHorizonDuration(horizon);
  const closesAt = new Date(predictedAt.getTime() + horizonDuration);
  // eslint-disable-next-line security/detect-object-injection -- horizon is typed union
  const maxAllowedDrawdown = MAX_DRAWDOWN[horizon];
  const { method, params } = getAnnotationMethod(horizon);

  // 1. Fetch local_extrema annotations confirmed by closesAt
  const allAnnotations = await getLocalExtremaAnnotations(
    symbolId,
    method,
    params,
    predictedAt,
    closesAt,
    closesAt
  );

  // 2. Filter to pivot LOWs only
  const pivotLows = filterPivotLows(allAnnotations);
  const hasStructuralBottom = pivotLows.length > 0;

  // 3. Compute entry price and max drawdown
  const entryPrice = getMidPriceAtTime(trades, predictedAt);

  // If we can't determine entry price, we can't validate the prediction
  if (entryPrice === undefined) {
    return {
      hasStructuralBottom,
      maxDrawdownPct: 0,
      isValid: false,
    };
  }

  // Filter trades to the prediction window
  const windowTrades = trades.filter((t) => {
    const tradeTime = t.timestamp.getTime();
    return tradeTime >= predictedAt.getTime() && tradeTime <= closesAt.getTime();
  });
  const maxDrawdownPct = computeMaxDrawdown(windowTrades, entryPrice);

  // 4. Determine validity
  const isValid = hasStructuralBottom && maxDrawdownPct <= maxAllowedDrawdown;

  // 5. Compute time to pivot ratio for Phase 3 early bonus
  if (hasStructuralBottom && pivotLows.length > 0) {
    const pivotTimes = pivotLows.map((p) => new Date(p.time_start).getTime());
    const earliestPivot = Math.min(...pivotTimes);
    const timeToPivot = earliestPivot - predictedAt.getTime();
    const timeToPivotRatio = timeToPivot / horizonDuration;

    return {
      hasStructuralBottom,
      maxDrawdownPct,
      isValid,
      timeToPivotRatio,
    };
  }

  return {
    hasStructuralBottom,
    maxDrawdownPct,
    isValid,
  };
}
