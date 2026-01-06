import { describe, expect, it } from 'vitest';

import {
  GOLDEN_SNAP_TIME,
  GOLDEN_EXPECTED,
  buildLookbackCandles,
  buildForwardCandles,
  buildHorizonCandles,
  buildAllGoldenCandles,
} from './golden-path-candles.js';
import type { TimeframeId } from '../../src/timeframe-config.js';

const HORIZONS: TimeframeId[] = ['15m', '1h', '4h', '24h'];

const EXPECTED_COUNTS: Record<TimeframeId, { lookback: number; forward: number }> = {
  '15m': { lookback: 24, forward: 3 },
  '1h': { lookback: 32, forward: 4 },
  '4h': { lookback: 32, forward: 4 },
  '24h': { lookback: 48, forward: 6 },
};

describe('golden-path-candles', () => {
  describe('buildLookbackCandles', () => {
    it.each(HORIZONS)('%s: has correct number of candles', (horizon) => {
      const candles = buildLookbackCandles(horizon, GOLDEN_SNAP_TIME);
      expect(candles.length).toBe(EXPECTED_COUNTS[horizon].lookback);
    });

    it.each(HORIZONS)('%s: reference low at correct candlesBack', (horizon) => {
      const candles = buildLookbackCandles(horizon, GOLDEN_SNAP_TIME);
      const expected = GOLDEN_EXPECTED[horizon];

      const lows = candles.map((c) => c.low);
      const minLow = Math.min(...lows);
      expect(minLow).toBe(expected.refLowPrice);

      const minIndex = lows.lastIndexOf(minLow);
      const candlesBack = candles.length - 1 - minIndex;
      expect(candlesBack).toBe(expected.refLowCandlesBack);
    });

    it.each(HORIZONS)('%s: last candle timestamp is snapTime', (horizon) => {
      const candles = buildLookbackCandles(horizon, GOLDEN_SNAP_TIME);
      const lastCandle = candles[candles.length - 1];
      expect(lastCandle.timestamp.getTime()).toBe(GOLDEN_SNAP_TIME.getTime());
    });
  });

  describe('buildForwardCandles', () => {
    it.each(HORIZONS)('%s: has correct number of candles', (horizon) => {
      const candles = buildForwardCandles(horizon, GOLDEN_SNAP_TIME);
      expect(candles.length).toBe(EXPECTED_COUNTS[horizon].forward);
    });

    it.each(HORIZONS)('%s: forward low is in window', (horizon) => {
      const candles = buildForwardCandles(horizon, GOLDEN_SNAP_TIME);
      const expected = GOLDEN_EXPECTED[horizon];

      const lows = candles.map((c) => c.low);
      const minLow = Math.min(...lows);
      expect(minLow).toBe(expected.forwardLowPrice);
    });

    it.each(HORIZONS)('%s: all candles after snapTime', (horizon) => {
      const candles = buildForwardCandles(horizon, GOLDEN_SNAP_TIME);
      for (const candle of candles) {
        expect(candle.timestamp.getTime()).toBeGreaterThan(GOLDEN_SNAP_TIME.getTime());
      }
    });
  });

  describe('buildHorizonCandles', () => {
    it.each(HORIZONS)('%s: returns both lookback and forward', (horizon) => {
      const result = buildHorizonCandles(horizon, GOLDEN_SNAP_TIME);
      expect(result.lookback).toBeDefined();
      expect(result.forward).toBeDefined();
      expect(result.lookback.length).toBe(EXPECTED_COUNTS[horizon].lookback);
      expect(result.forward.length).toBe(EXPECTED_COUNTS[horizon].forward);
    });
  });

  describe('buildAllGoldenCandles', () => {
    it('returns all four horizons', () => {
      const result = buildAllGoldenCandles();
      for (const horizon of HORIZONS) {
        expect(result[horizon]).toBeDefined();
      }
    });

    it('uses GOLDEN_SNAP_TIME by default', () => {
      const result = buildAllGoldenCandles();
      for (const horizon of HORIZONS) {
        const lastLookback = result[horizon].lookback[result[horizon].lookback.length - 1];
        expect(lastLookback.timestamp.getTime()).toBe(GOLDEN_SNAP_TIME.getTime());
      }
    });
  });

  describe('expected labels', () => {
    it('15m: label FALSE (new low 99.50 < ref 100.00)', () => {
      const expected = GOLDEN_EXPECTED['15m'];
      expect(expected.labelNoNewLow).toBe(false);
      expect(expected.forwardLowPrice).toBeLessThan(expected.refLowPrice);
    });

    it('1h: label TRUE (forward 200.00 >= ref 200.00)', () => {
      const expected = GOLDEN_EXPECTED['1h'];
      expect(expected.labelNoNewLow).toBe(true);
      expect(expected.forwardLowPrice).toBeGreaterThanOrEqual(expected.refLowPrice);
    });

    it('4h: label FALSE (new low 299.00 < ref 300.00)', () => {
      const expected = GOLDEN_EXPECTED['4h'];
      expect(expected.labelNoNewLow).toBe(false);
      expect(expected.forwardLowPrice).toBeLessThan(expected.refLowPrice);
    });

    it('24h: label TRUE (forward 401.00 > ref 400.00)', () => {
      const expected = GOLDEN_EXPECTED['24h'];
      expect(expected.labelNoNewLow).toBe(true);
      expect(expected.forwardLowPrice).toBeGreaterThan(expected.refLowPrice);
    });
  });
});
