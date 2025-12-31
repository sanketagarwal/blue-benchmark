/**
 * EV (Expected Value) Calculator for trading decisions
 *
 * Calculates expected value based on fill probability and price predictions.
 * EV is a standard financial term and should not be expanded.
 *
 * IMPORTANT: Delta-mid predictions are clipped to [-MAX_ATR_MULTIPLE, +MAX_ATR_MULTIPLE] * ATR
 * to prevent hallucinated magnitude from dominating EV calculations. This constraint mirrors
 * real trading systems where position limits and risk controls prevent unbounded exposure.
 */
// eslint-disable-next-line eslint-comments/disable-enable-pair -- File-wide disable for domain term
/* eslint-disable unicorn/prevent-abbreviations -- EV is a standard financial term */
import { FIXED_FEE } from './types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum ATR multiple for delta-mid clipping.
 * Predictions beyond [-3, +3] ATR are clipped to this range.
 * This prevents hallucinated magnitude from dominating EV calculations.
 */
export const MAX_ATR_MULTIPLE = 3;

// ============================================================================
// Types
// ============================================================================

export type Side = 'bid' | 'ask';
export type Horizon = '1m' | '5m' | '15m';

export interface EVInput {
  side: Side;
  horizon: Horizon;
  fillProb: number; // Predicted fill probability
  deltaMid: number; // Predicted mid price change if filled
  fillPrice: number; // Entry price (best bid/ask at prediction time)
}

export interface EVResult {
  side: Side;
  horizon: Horizon;
  predictedFillProb: number;
  predictedDeltaMid: number;
  ev: number;
}

export interface EVAggregate {
  meanEV: number;
  totalEV: number;
  evBySide: Record<Side, number>;
  evByHorizon: Record<Horizon, number>;
}

export interface EVPnLGapResult {
  gap: number;
  gapVariance: number;
  systematicOverestimation: boolean;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Calculate Expected Value for a single trade decision
 *
 * EV Formula:
 * - For bids: EV = fillProb * deltaMid - (fillProb * fillPrice * FIXED_FEE)
 *   Positive deltaMid means price goes up after buying = good for bid
 * - For asks: EV = fillProb * (-deltaMid) - (fillProb * fillPrice * FIXED_FEE)
 *   Negative deltaMid means price goes down after selling = good for ask
 *   We flip the sign because for asks, we WANT price to go down
 *
 * @param input - EVInput containing side, horizon, fillProb, deltaMid, fillPrice
 * @returns EVResult with calculated expected value
 */
export function calculateEV(input: EVInput): EVResult {
  const { side, horizon, fillProb, deltaMid, fillPrice } = input;

  // Calculate expected fee
  const expectedFee = fillProb * fillPrice * FIXED_FEE;

  // Calculate raw EV based on side
  // For bid: positive deltaMid is good (price goes up after buying)
  // For ask: negative deltaMid is good (price goes down after selling), so we flip sign
  const adjustedDeltaMid = side === 'bid' ? deltaMid : -deltaMid;
  const expectedValue = fillProb * adjustedDeltaMid - expectedFee;

  return {
    side,
    horizon,
    predictedFillProb: fillProb,
    predictedDeltaMid: deltaMid,
    ev: expectedValue,
  };
}

/**
 * Clip a delta-mid prediction to a reasonable ATR-normalized range.
 * Without clipping, models can hallucinate arbitrarily large values that
 * dominate EV calculations, making directional skill meaningless.
 *
 * @param deltaMid - Raw delta-mid prediction
 * @param atr - ATR value for the contract (undefined means no clipping)
 * @returns Clipped delta-mid value
 */
export function clipDeltaMid(deltaMid: number, atr: number | undefined): number {
  if (atr === undefined || atr <= 0) {
    return deltaMid;
  }
  const maxDelta = MAX_ATR_MULTIPLE * atr;
  return Math.max(-maxDelta, Math.min(maxDelta, deltaMid));
}

/**
 * Calculate EV for all 6 contracts (bid/ask x 1m/5m/15m)
 *
 * Delta-mid predictions are clipped to [-3, +3] ATR before EV calculation.
 * This prevents hallucinated magnitude from dominating results.
 *
 * @param fillPredictions - Record mapping contract IDs to fill probabilities
 * @param deltaMidPredictions - Record mapping contract IDs to delta-mid predictions
 * @param fillPrices - Object containing best bid and ask prices
 * @param fillPrices.bestBid - Best bid price at prediction time
 * @param fillPrices.bestAsk - Best ask price at prediction time
 * @param deltaMidATRs - Optional ATR values for clipping delta-mid predictions
 * @returns Array of EVResult for all 6 contracts
 */
export function calculateAllEV(
  fillPredictions: Record<string, number>,
  deltaMidPredictions: Record<string, number>,
  fillPrices: { bestBid: number; bestAsk: number },
  deltaMidATRs?: Record<string, number | undefined>
): EVResult[] {
  const sides: Side[] = ['bid', 'ask'];
  const horizons: Horizon[] = ['1m', '5m', '15m'];

  const results: EVResult[] = [];

  for (const side of sides) {
    for (const horizon of horizons) {
      const fillContractId = `${side}-fill-${horizon}`;
      const deltaMidContractId = `${side}-delta-mid-${horizon}`;

      // eslint-disable-next-line security/detect-object-injection -- Contract IDs are constructed from known enum values
      const fillProb = fillPredictions[fillContractId];
      // eslint-disable-next-line security/detect-object-injection -- Contract IDs are constructed from known enum values
      const rawDeltaMid = deltaMidPredictions[deltaMidContractId];
      const fillPrice = side === 'bid' ? fillPrices.bestBid : fillPrices.bestAsk;

      if (fillProb === undefined || rawDeltaMid === undefined) {
        throw new Error(`Missing prediction for ${fillContractId} or ${deltaMidContractId}`);
      }

      // Clip delta-mid to [-3, +3] ATR to prevent hallucinated magnitude
      // eslint-disable-next-line security/detect-object-injection -- Contract IDs are constructed from known enum values
      const atr = deltaMidATRs?.[deltaMidContractId];
      const deltaMid = clipDeltaMid(rawDeltaMid, atr);

      results.push(
        calculateEV({
          side,
          horizon,
          fillProb,
          deltaMid,
          fillPrice,
        })
      );
    }
  }

  return results;
}

/**
 * Aggregate EV results into summary statistics
 *
 * @param results - Array of EVResult to aggregate
 * @returns EVAggregate with mean, total, and breakdowns by side and horizon
 */
export function aggregateEV(results: EVResult[]): EVAggregate {
  if (results.length === 0) {
    return {
      meanEV: 0,
      totalEV: 0,
      evBySide: { bid: 0, ask: 0 },
      evByHorizon: { '1m': 0, '5m': 0, '15m': 0 },
    };
  }

  const totalEV = results.reduce((sum, r) => sum + r.ev, 0);
  const meanEV = totalEV / results.length;

  const evBySide: Record<Side, number> = { bid: 0, ask: 0 };
  const evByHorizon: Record<Horizon, number> = { '1m': 0, '5m': 0, '15m': 0 };

  for (const result of results) {
    evBySide[result.side] += result.ev;
    evByHorizon[result.horizon] += result.ev;
  }

  return {
    meanEV,
    totalEV,
    evBySide,
    evByHorizon,
  };
}

/**
 * Calculate the gap between predicted EV and realized PnL
 *
 * @param evResults - Array of EVResult with predicted EVs
 * @param pnlResults - Array of realized PnL results to compare against
 * @returns EVPnLGapResult with gap, variance, and overestimation flag
 */
export function calculateEVPnLGap(
  evResults: EVResult[],
  pnlResults: { side: Side; horizon: Horizon; pnl: number }[]
): EVPnLGapResult {
  if (evResults.length === 0 || pnlResults.length === 0) {
    return {
      gap: 0,
      gapVariance: 0,
      systematicOverestimation: false,
    };
  }

  // Match EV and PnL results by side and horizon
  const gaps: number[] = [];

  for (const evResult of evResults) {
    const matchingPnl = pnlResults.find(
      (p) => p.side === evResult.side && p.horizon === evResult.horizon
    );
    if (matchingPnl !== undefined) {
      gaps.push(evResult.ev - matchingPnl.pnl);
    }
  }

  if (gaps.length === 0) {
    return {
      gap: 0,
      gapVariance: 0,
      systematicOverestimation: false,
    };
  }

  // Calculate mean gap
  const meanGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;

  // Calculate variance of gaps
  const squaredDeviations = gaps.map((g) => (g - meanGap) ** 2);
  const gapVariance = squaredDeviations.reduce((sum, d) => sum + d, 0) / gaps.length;

  // Check for systematic overestimation
  // Statistically significant if gap > 2 * sqrt(variance)
  const threshold = 2 * Math.sqrt(gapVariance);
  const systematicOverestimation = meanGap > 0 && meanGap > threshold;

  return {
    gap: meanGap,
    gapVariance,
    systematicOverestimation,
  };
}
