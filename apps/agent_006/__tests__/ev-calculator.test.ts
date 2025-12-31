import { describe, expect, it } from 'vitest';
import {
  calculateEV,
  calculateAllEV,
  aggregateEV,
  calculateEVPnLGap,
  clipDeltaMid,
  MAX_ATR_MULTIPLE,
} from '../src/scorers/ev-calculator';
import { FIXED_FEE } from '../src/scorers/types';
import type { EVInput, EVResult, Side, Horizon } from '../src/scorers/ev-calculator';

// Constants for test values to satisfy sonarjs/no-duplicate-string
const BID: Side = 'bid';
const ASK: Side = 'ask';
const HORIZON_1M: Horizon = '1m';
const HORIZON_5M: Horizon = '5m';
const HORIZON_15M: Horizon = '15m';
const DEFAULT_FILL_PRICE = 50_000;

describe('EV Calculator', () => {
  describe('calculateEV', () => {
    it('returns EV of 0 when fillProb is 0', () => {
      const input: EVInput = {
        side: BID,
        horizon: HORIZON_1M,
        fillProb: 0,
        deltaMid: 0.001,
        fillPrice: DEFAULT_FILL_PRICE,
      };
      const result = calculateEV(input);
      expect(result.ev).toBe(0);
    });

    it('returns positive EV for bid with positive deltaMid and 100% fill', () => {
      const input: EVInput = {
        side: BID,
        horizon: HORIZON_1M,
        fillProb: 1,
        deltaMid: 0.001, // 10 basis points price increase
        fillPrice: DEFAULT_FILL_PRICE,
      };
      const result = calculateEV(input);
      // EV = 1 * 0.001 - (1 * 50000 * 0.0001) = 0.001 - 5 = -4.999
      const expectedFee = 1 * DEFAULT_FILL_PRICE * FIXED_FEE; // 5
      const expectedEV = 0.001 - expectedFee;
      expect(result.ev).toBeCloseTo(expectedEV);
    });

    it('returns positive EV for ask with negative deltaMid and 100% fill', () => {
      const input: EVInput = {
        side: ASK,
        horizon: HORIZON_1M,
        fillProb: 1,
        deltaMid: -0.001, // 10 basis points price decrease (good for ask)
        fillPrice: DEFAULT_FILL_PRICE,
      };
      const result = calculateEV(input);
      // For ask: EV = fillProb * (-deltaMid) - fee
      // EV = 1 * (--0.001) - 5 = 0.001 - 5 = -4.999
      const expectedFee = 1 * DEFAULT_FILL_PRICE * FIXED_FEE; // 5
      const expectedEV = 0.001 - expectedFee; // flipped sign for ask
      expect(result.ev).toBeCloseTo(expectedEV);
    });

    it('scales EV linearly with fillProb', () => {
      const baseInput: EVInput = {
        side: BID,
        horizon: HORIZON_5M,
        fillProb: 1,
        deltaMid: 0.002,
        fillPrice: DEFAULT_FILL_PRICE,
      };
      const halfProbInput: EVInput = { ...baseInput, fillProb: 0.5 };

      const fullResult = calculateEV(baseInput);
      const halfResult = calculateEV(halfProbInput);

      // EV should scale linearly with fillProb
      expect(halfResult.ev).toBeCloseTo(fullResult.ev * 0.5);
    });

    it('subtracts fee correctly from EV', () => {
      const input: EVInput = {
        side: BID,
        horizon: HORIZON_1M,
        fillProb: 1,
        deltaMid: 0.01, // Large enough to be positive after fee
        fillPrice: 100, // Small price to make fee negligible
      };
      const result = calculateEV(input);
      // EV = 1 * 0.01 - (1 * 100 * 0.0001) = 0.01 - 0.01 = 0
      const expectedFee = 1 * 100 * FIXED_FEE;
      const expectedEV = 0.01 - expectedFee;
      expect(result.ev).toBeCloseTo(expectedEV);
    });

    it('returns correct EVResult structure', () => {
      const input: EVInput = {
        side: BID,
        horizon: HORIZON_15M,
        fillProb: 0.7,
        deltaMid: 0.005,
        fillPrice: 60_000,
      };
      const result = calculateEV(input);

      expect(result).toEqual({
        side: BID,
        horizon: HORIZON_15M,
        predictedFillProb: 0.7,
        predictedDeltaMid: 0.005,
        ev: expect.any(Number),
      });
    });

    it('handles bid with negative deltaMid (price goes down after buying)', () => {
      const input: EVInput = {
        side: BID,
        horizon: HORIZON_1M,
        fillProb: 1,
        deltaMid: -0.002, // Price drops after buying = bad for bid
        fillPrice: DEFAULT_FILL_PRICE,
      };
      const result = calculateEV(input);
      // EV = 1 * (-0.002) - (1 * 50000 * 0.0001) = -0.002 - 5 = -5.002
      const expectedFee = DEFAULT_FILL_PRICE * FIXED_FEE;
      const expectedEV = -0.002 - expectedFee;
      expect(result.ev).toBeCloseTo(expectedEV);
    });

    it('handles ask with positive deltaMid (price goes up after selling)', () => {
      const input: EVInput = {
        side: ASK,
        horizon: HORIZON_1M,
        fillProb: 1,
        deltaMid: 0.002, // Price rises after selling = bad for ask
        fillPrice: DEFAULT_FILL_PRICE,
      };
      const result = calculateEV(input);
      // For ask: EV = 1 * (-0.002) - 5 = -0.002 - 5 = -5.002
      const expectedFee = DEFAULT_FILL_PRICE * FIXED_FEE;
      const expectedEV = -0.002 - expectedFee;
      expect(result.ev).toBeCloseTo(expectedEV);
    });
  });

  describe('calculateAllEV', () => {
    it('maps contracts correctly and returns 6 EVResults', () => {
      const fillPredictions: Record<string, number> = {
        'bid-fill-1m': 0.3,
        'bid-fill-5m': 0.5,
        'bid-fill-15m': 0.7,
        'ask-fill-1m': 0.4,
        'ask-fill-5m': 0.6,
        'ask-fill-15m': 0.8,
      };
      const deltaMidPredictions: Record<string, number> = {
        'bid-delta-mid-1m': 0.001,
        'bid-delta-mid-5m': 0.002,
        'bid-delta-mid-15m': 0.003,
        'ask-delta-mid-1m': -0.001,
        'ask-delta-mid-5m': -0.002,
        'ask-delta-mid-15m': -0.003,
      };
      const fillPrices = {
        bestBid: DEFAULT_FILL_PRICE,
        bestAsk: 50_010,
      };

      const results = calculateAllEV(fillPredictions, deltaMidPredictions, fillPrices);

      expect(results).toHaveLength(6);

      // Check bid contracts use bestBid price
      const bidResults = results.filter((r) => r.side === BID);
      expect(bidResults).toHaveLength(3);

      // Check ask contracts use bestAsk price
      const askResults = results.filter((r) => r.side === ASK);
      expect(askResults).toHaveLength(3);

      // Verify horizons are correct
      const horizons = results.map((r) => r.horizon);
      expect(horizons).toContain(HORIZON_1M);
      expect(horizons).toContain(HORIZON_5M);
      expect(horizons).toContain(HORIZON_15M);
    });

    it('uses correct fill prices for each side', () => {
      const fillPredictions: Record<string, number> = {
        'bid-fill-1m': 1,
        'bid-fill-5m': 1,
        'bid-fill-15m': 1,
        'ask-fill-1m': 1,
        'ask-fill-5m': 1,
        'ask-fill-15m': 1,
      };
      const deltaMidPredictions: Record<string, number> = {
        'bid-delta-mid-1m': 0,
        'bid-delta-mid-5m': 0,
        'bid-delta-mid-15m': 0,
        'ask-delta-mid-1m': 0,
        'ask-delta-mid-5m': 0,
        'ask-delta-mid-15m': 0,
      };
      const fillPrices = {
        bestBid: 100,
        bestAsk: 200,
      };

      const results = calculateAllEV(fillPredictions, deltaMidPredictions, fillPrices);

      // With deltaMid=0 and fillProb=1, EV = -fee
      // Bid fee = 100 * 0.0001 = 0.01
      // Ask fee = 200 * 0.0001 = 0.02
      const bidResult = results.find((r) => r.side === BID && r.horizon === HORIZON_1M);
      const askResult = results.find((r) => r.side === ASK && r.horizon === HORIZON_1M);

      expect(bidResult?.ev).toBeCloseTo(-100 * FIXED_FEE);
      expect(askResult?.ev).toBeCloseTo(-200 * FIXED_FEE);
    });
  });

  describe('aggregateEV', () => {
    it('computes correct mean and total EV', () => {
      const results: EVResult[] = [
        { side: BID, horizon: HORIZON_1M, predictedFillProb: 0.5, predictedDeltaMid: 0.001, ev: 0.1 },
        { side: BID, horizon: HORIZON_5M, predictedFillProb: 0.6, predictedDeltaMid: 0.002, ev: 0.2 },
        { side: BID, horizon: HORIZON_15M, predictedFillProb: 0.7, predictedDeltaMid: 0.003, ev: 0.3 },
        { side: ASK, horizon: HORIZON_1M, predictedFillProb: 0.5, predictedDeltaMid: -0.001, ev: 0.15 },
        { side: ASK, horizon: HORIZON_5M, predictedFillProb: 0.6, predictedDeltaMid: -0.002, ev: 0.25 },
        { side: ASK, horizon: HORIZON_15M, predictedFillProb: 0.7, predictedDeltaMid: -0.003, ev: 0.35 },
      ];

      const aggregate = aggregateEV(results);

      expect(aggregate.totalEV).toBeCloseTo(0.1 + 0.2 + 0.3 + 0.15 + 0.25 + 0.35);
      expect(aggregate.meanEV).toBeCloseTo((0.1 + 0.2 + 0.3 + 0.15 + 0.25 + 0.35) / 6);
    });

    it('computes correct EV by side', () => {
      const results: EVResult[] = [
        { side: BID, horizon: HORIZON_1M, predictedFillProb: 0.5, predictedDeltaMid: 0.001, ev: 0.1 },
        { side: BID, horizon: HORIZON_5M, predictedFillProb: 0.6, predictedDeltaMid: 0.002, ev: 0.2 },
        { side: ASK, horizon: HORIZON_1M, predictedFillProb: 0.5, predictedDeltaMid: -0.001, ev: 0.3 },
        { side: ASK, horizon: HORIZON_5M, predictedFillProb: 0.6, predictedDeltaMid: -0.002, ev: 0.4 },
      ];

      const aggregate = aggregateEV(results);

      expect(aggregate.evBySide.bid).toBeCloseTo(0.1 + 0.2);
      expect(aggregate.evBySide.ask).toBeCloseTo(0.3 + 0.4);
    });

    it('computes correct EV by horizon', () => {
      const results: EVResult[] = [
        { side: BID, horizon: HORIZON_1M, predictedFillProb: 0.5, predictedDeltaMid: 0.001, ev: 0.1 },
        { side: ASK, horizon: HORIZON_1M, predictedFillProb: 0.5, predictedDeltaMid: -0.001, ev: 0.2 },
        { side: BID, horizon: HORIZON_5M, predictedFillProb: 0.6, predictedDeltaMid: 0.002, ev: 0.3 },
        { side: ASK, horizon: HORIZON_5M, predictedFillProb: 0.6, predictedDeltaMid: -0.002, ev: 0.4 },
        { side: BID, horizon: HORIZON_15M, predictedFillProb: 0.7, predictedDeltaMid: 0.003, ev: 0.5 },
        { side: ASK, horizon: HORIZON_15M, predictedFillProb: 0.7, predictedDeltaMid: -0.003, ev: 0.6 },
      ];

      const aggregate = aggregateEV(results);

      expect(aggregate.evByHorizon[HORIZON_1M]).toBeCloseTo(0.1 + 0.2);
      expect(aggregate.evByHorizon[HORIZON_5M]).toBeCloseTo(0.3 + 0.4);
      expect(aggregate.evByHorizon[HORIZON_15M]).toBeCloseTo(0.5 + 0.6);
    });

    it('handles empty results array', () => {
      const aggregate = aggregateEV([]);

      expect(aggregate.totalEV).toBe(0);
      expect(aggregate.meanEV).toBe(0);
      expect(aggregate.evBySide.bid).toBe(0);
      expect(aggregate.evBySide.ask).toBe(0);
      expect(aggregate.evByHorizon[HORIZON_1M]).toBe(0);
      expect(aggregate.evByHorizon[HORIZON_5M]).toBe(0);
      expect(aggregate.evByHorizon[HORIZON_15M]).toBe(0);
    });
  });

  describe('calculateEVPnLGap', () => {
    it('calculates gap as mean(EV) - mean(PnL)', () => {
      const evResults: EVResult[] = [
        { side: BID, horizon: HORIZON_1M, predictedFillProb: 0.5, predictedDeltaMid: 0.001, ev: 0.1 },
        { side: ASK, horizon: HORIZON_1M, predictedFillProb: 0.5, predictedDeltaMid: -0.001, ev: 0.2 },
      ];
      const pnlResults = [
        { side: BID as const, horizon: HORIZON_1M as const, pnl: 0.05 },
        { side: ASK as const, horizon: HORIZON_1M as const, pnl: 0.1 },
      ];

      const result = calculateEVPnLGap(evResults, pnlResults);

      // mean(EV) = (0.1 + 0.2) / 2 = 0.15
      // mean(PnL) = (0.05 + 0.1) / 2 = 0.075
      // gap = 0.15 - 0.075 = 0.075
      expect(result.gap).toBeCloseTo(0.075);
    });

    it('calculates gap variance correctly', () => {
      const evResults: EVResult[] = [
        { side: BID, horizon: HORIZON_1M, predictedFillProb: 0.5, predictedDeltaMid: 0.001, ev: 0.1 },
        { side: ASK, horizon: HORIZON_1M, predictedFillProb: 0.5, predictedDeltaMid: -0.001, ev: 0.2 },
      ];
      const pnlResults = [
        { side: BID as const, horizon: HORIZON_1M as const, pnl: 0.05 },
        { side: ASK as const, horizon: HORIZON_1M as const, pnl: 0.1 },
      ];

      const result = calculateEVPnLGap(evResults, pnlResults);

      // Per-decision gaps: [0.1-0.05=0.05, 0.2-0.1=0.1]
      // Mean gap = 0.075
      // Variance = ((0.05-0.075)^2 + (0.1-0.075)^2) / 2 = (0.000625 + 0.000625) / 2 = 0.000625
      expect(result.gapVariance).toBeCloseTo(0.000625);
    });

    it('identifies systematic overestimation when gap > 2 * sqrt(variance)', () => {
      // Create scenario with consistent overestimation
      const evResults: EVResult[] = [
        { side: BID, horizon: HORIZON_1M, predictedFillProb: 0.5, predictedDeltaMid: 0.001, ev: 1.0 },
        { side: BID, horizon: HORIZON_5M, predictedFillProb: 0.5, predictedDeltaMid: 0.001, ev: 1.0 },
        { side: BID, horizon: HORIZON_15M, predictedFillProb: 0.5, predictedDeltaMid: 0.001, ev: 1.0 },
        { side: ASK, horizon: HORIZON_1M, predictedFillProb: 0.5, predictedDeltaMid: -0.001, ev: 1.0 },
      ];
      const pnlResults = [
        { side: BID as const, horizon: HORIZON_1M as const, pnl: 0.1 },
        { side: BID as const, horizon: HORIZON_5M as const, pnl: 0.1 },
        { side: BID as const, horizon: HORIZON_15M as const, pnl: 0.1 },
        { side: ASK as const, horizon: HORIZON_1M as const, pnl: 0.1 },
      ];

      const result = calculateEVPnLGap(evResults, pnlResults);

      // All gaps are 0.9, so variance is 0
      // gap = 0.9 > 2 * sqrt(0) = 0, so systematicOverestimation = true
      expect(result.gap).toBeCloseTo(0.9);
      expect(result.gapVariance).toBeCloseTo(0);
      expect(result.systematicOverestimation).toBe(true);
    });

    it('does not flag overestimation when gap is small', () => {
      const evResults: EVResult[] = [
        { side: BID, horizon: HORIZON_1M, predictedFillProb: 0.5, predictedDeltaMid: 0.001, ev: 0.1 },
        { side: ASK, horizon: HORIZON_1M, predictedFillProb: 0.5, predictedDeltaMid: -0.001, ev: 0.1 },
      ];
      const pnlResults = [
        { side: BID as const, horizon: HORIZON_1M as const, pnl: 0.1 },
        { side: ASK as const, horizon: HORIZON_1M as const, pnl: 0.1 },
      ];

      const result = calculateEVPnLGap(evResults, pnlResults);

      expect(result.gap).toBeCloseTo(0);
      expect(result.systematicOverestimation).toBe(false);
    });

    it('does not flag overestimation when gap is negative (underestimation)', () => {
      const evResults: EVResult[] = [
        { side: BID, horizon: HORIZON_1M, predictedFillProb: 0.5, predictedDeltaMid: 0.001, ev: 0.1 },
      ];
      const pnlResults = [{ side: BID as const, horizon: HORIZON_1M as const, pnl: 0.5 }];

      const result = calculateEVPnLGap(evResults, pnlResults);

      expect(result.gap).toBeLessThan(0);
      expect(result.systematicOverestimation).toBe(false);
    });

    it('handles empty arrays gracefully', () => {
      const result = calculateEVPnLGap([], []);

      expect(result.gap).toBe(0);
      expect(result.gapVariance).toBe(0);
      expect(result.systematicOverestimation).toBe(false);
    });

    it('matches EV and PnL results by side and horizon', () => {
      const evResults: EVResult[] = [
        { side: BID, horizon: HORIZON_1M, predictedFillProb: 0.5, predictedDeltaMid: 0.001, ev: 0.5 },
        { side: ASK, horizon: HORIZON_5M, predictedFillProb: 0.5, predictedDeltaMid: -0.001, ev: 0.3 },
      ];
      const pnlResults = [
        { side: ASK as const, horizon: HORIZON_5M as const, pnl: 0.2 }, // Matches ask-5m
        { side: BID as const, horizon: HORIZON_1M as const, pnl: 0.1 }, // Matches bid-1m
      ];

      const result = calculateEVPnLGap(evResults, pnlResults);

      // Gaps: bid-1m: 0.5-0.1=0.4, ask-5m: 0.3-0.2=0.1
      // Mean gap = (0.4 + 0.1) / 2 = 0.25
      expect(result.gap).toBeCloseTo(0.25);
    });
  });

  describe('clipDeltaMid', () => {
    it('returns original value when ATR is undefined', () => {
      expect(clipDeltaMid(100, undefined)).toBe(100);
      expect(clipDeltaMid(-100, undefined)).toBe(-100);
    });

    it('returns original value when ATR is zero', () => {
      expect(clipDeltaMid(100, 0)).toBe(100);
      expect(clipDeltaMid(-100, 0)).toBe(-100);
    });

    it('returns original value when ATR is negative', () => {
      expect(clipDeltaMid(100, -10)).toBe(100);
    });

    it('returns original value when within ATR bounds', () => {
      const atr = 10;
      const maxDelta = MAX_ATR_MULTIPLE * atr; // 30
      expect(clipDeltaMid(15, atr)).toBe(15);
      expect(clipDeltaMid(-15, atr)).toBe(-15);
      expect(clipDeltaMid(0, atr)).toBe(0);
    });

    it('clips positive values exceeding MAX_ATR_MULTIPLE * ATR', () => {
      const atr = 10;
      const maxDelta = MAX_ATR_MULTIPLE * atr; // 30
      expect(clipDeltaMid(50, atr)).toBe(maxDelta);
      expect(clipDeltaMid(100, atr)).toBe(maxDelta);
      expect(clipDeltaMid(30.001, atr)).toBeCloseTo(maxDelta);
    });

    it('clips negative values exceeding -MAX_ATR_MULTIPLE * ATR', () => {
      const atr = 10;
      const maxDelta = MAX_ATR_MULTIPLE * atr; // 30
      expect(clipDeltaMid(-50, atr)).toBe(-maxDelta);
      expect(clipDeltaMid(-100, atr)).toBe(-maxDelta);
      expect(clipDeltaMid(-30.001, atr)).toBeCloseTo(-maxDelta);
    });

    it('does not clip values at exactly the boundary', () => {
      const atr = 10;
      const maxDelta = MAX_ATR_MULTIPLE * atr; // 30
      expect(clipDeltaMid(maxDelta, atr)).toBe(maxDelta);
      expect(clipDeltaMid(-maxDelta, atr)).toBe(-maxDelta);
    });
  });

  describe('calculateAllEV with ATR clipping', () => {
    const fillPredictions = {
      'bid-fill-1m': 0.5,
      'bid-fill-5m': 0.6,
      'bid-fill-15m': 0.7,
      'ask-fill-1m': 0.4,
      'ask-fill-5m': 0.5,
      'ask-fill-15m': 0.6,
    };
    const fillPrices = { bestBid: 100, bestAsk: 100 };

    it('clips extreme delta-mid predictions when ATRs provided', () => {
      const deltaMidPredictions = {
        'bid-delta-mid-1m': 100, // Way too high
        'bid-delta-mid-5m': -100, // Way too low
        'bid-delta-mid-15m': 0.5,
        'ask-delta-mid-1m': 100,
        'ask-delta-mid-5m': -100,
        'ask-delta-mid-15m': -0.5,
      };
      const deltaMidATRs = {
        'bid-delta-mid-1m': 10,
        'bid-delta-mid-5m': 10,
        'bid-delta-mid-15m': 10,
        'ask-delta-mid-1m': 10,
        'ask-delta-mid-5m': 10,
        'ask-delta-mid-15m': 10,
      };

      const results = calculateAllEV(fillPredictions, deltaMidPredictions, fillPrices, deltaMidATRs);

      // bid-1m: deltaMid should be clipped from 100 to 30
      const bid1m = results.find((r) => r.side === 'bid' && r.horizon === '1m');
      // EV = fillProb * clippedDeltaMid - fee = 0.5 * 30 - (0.5 * 100 * 0.0001)
      expect(bid1m?.ev).toBeCloseTo(0.5 * 30 - 0.5 * 100 * 0.0001);
    });

    it('does not clip when ATRs not provided', () => {
      const deltaMidPredictions = {
        'bid-delta-mid-1m': 100,
        'bid-delta-mid-5m': 0.5,
        'bid-delta-mid-15m': 0.5,
        'ask-delta-mid-1m': -100,
        'ask-delta-mid-5m': -0.5,
        'ask-delta-mid-15m': -0.5,
      };

      const results = calculateAllEV(fillPredictions, deltaMidPredictions, fillPrices);

      // Without ATRs, no clipping occurs
      const bid1m = results.find((r) => r.side === 'bid' && r.horizon === '1m');
      expect(bid1m?.ev).toBeCloseTo(0.5 * 100 - 0.5 * 100 * 0.0001);
    });
  });
});
