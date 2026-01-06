import { describe, expect, it } from 'vitest';

import {
  computeReferenceLow,
  computeForwardWindow,
  labelNoNewLow,
  resolveNoNewLowGroundTruth,
} from '../src/ground-truth/no-new-low.js';

import type { Candle } from '../src/replay-lab/ohlcv.js';

function makeCandle(low: number, index = 0): Candle {
  return {
    timestamp: new Date(Date.now() + index * 60_000),
    open: low + 10,
    high: low + 20,
    low,
    close: low + 15,
    volume: 1000,
  };
}

describe('computeReferenceLow', () => {
  it('returns price 0 and index -1 for empty array', () => {
    const result = computeReferenceLow([]);
    expect(result).toEqual({ price: 0, candleIndex: -1, candlesBack: -1 });
  });

  it('finds the minimum low in lookback candles', () => {
    const candles = [
      makeCandle(100, 0),
      makeCandle(90, 1),
      makeCandle(95, 2),
    ];
    const result = computeReferenceLow(candles);
    expect(result).toEqual({ price: 90, candleIndex: 1, candlesBack: 1 });
  });

  it('returns most recent candle when lows are equal (tie-breaking)', () => {
    const candles = [
      makeCandle(100, 0),
      makeCandle(100, 1),
      makeCandle(100, 2),
    ];
    const result = computeReferenceLow(candles);
    expect(result).toEqual({ price: 100, candleIndex: 2, candlesBack: 0 });
  });

  it('computes candlesBack correctly (0 = most recent)', () => {
    const candles = [
      makeCandle(100, 0),
      makeCandle(90, 1),
      makeCandle(95, 2),
      makeCandle(92, 3),
    ];
    const result = computeReferenceLow(candles);
    expect(result.candleIndex).toBe(1);
    expect(result.candlesBack).toBe(2);
  });

  it('chooses most recent when multiple candles share the same low', () => {
    const candles = [
      makeCandle(50, 0),
      makeCandle(100, 1),
      makeCandle(50, 2),
      makeCandle(100, 3),
    ];
    const result = computeReferenceLow(candles);
    expect(result.price).toBe(50);
    expect(result.candleIndex).toBe(2);
    expect(result.candlesBack).toBe(1);
  });
});

describe('computeForwardWindow', () => {
  it('returns Infinity for empty array', () => {
    const result = computeForwardWindow([]);
    expect(result).toEqual({ lowestPrice: Infinity });
  });

  it('finds the minimum low in forward candles', () => {
    const candles = [
      makeCandle(105, 0),
      makeCandle(95, 1),
      makeCandle(100, 2),
    ];
    const result = computeForwardWindow(candles);
    expect(result).toEqual({ lowestPrice: 95 });
  });
});

describe('labelNoNewLow', () => {
  it('returns 1 when forward low is above reference low', () => {
    expect(labelNoNewLow(100, 105)).toBe(1);
  });

  it('returns 1 when forward low equals reference low', () => {
    expect(labelNoNewLow(100, 100)).toBe(1);
  });

  it('returns 0 when forward low is below reference low', () => {
    expect(labelNoNewLow(100, 95)).toBe(0);
  });
});

describe('resolveNoNewLowGroundTruth', () => {
  it('returns label=1 when no new low is made', () => {
    const lookback = [makeCandle(100, 0), makeCandle(90, 1)];
    const forward = [makeCandle(95, 2), makeCandle(92, 3)];
    const result = resolveNoNewLowGroundTruth(lookback, forward);
    expect(result).toEqual({
      refLowPrice: 90,
      refLowCandlesBack: 0,
      forwardLow: 92,
      labelNoNewLow: 1,
    });
  });

  it('returns label=0 when new low is made', () => {
    const lookback = [makeCandle(100, 0), makeCandle(90, 1)];
    const forward = [makeCandle(85, 2), makeCandle(95, 3)];
    const result = resolveNoNewLowGroundTruth(lookback, forward);
    expect(result).toEqual({
      refLowPrice: 90,
      refLowCandlesBack: 0,
      forwardLow: 85,
      labelNoNewLow: 0,
    });
  });

  it('handles empty lookback (ref price 0, forward always higher)', () => {
    const forward = [makeCandle(85, 0)];
    const result = resolveNoNewLowGroundTruth([], forward);
    expect(result.refLowPrice).toBe(0);
    expect(result.refLowCandlesBack).toBe(-1);
    expect(result.labelNoNewLow).toBe(1);
  });

  it('handles empty forward (NaN, missing data flagged)', () => {
    const lookback = [makeCandle(100, 0)];
    const result = resolveNoNewLowGroundTruth(lookback, []);
    expect(result.forwardLow).toBeNaN();
    expect(result.refLowCandlesBack).toBe(0);
    expect(result.labelNoNewLow).toBe(1);
    expect(result.forwardCandlesMissing).toBe(true);
  });

  it('returns correct refLowCandlesBack for reference low in middle of lookback', () => {
    const lookback = [
      makeCandle(100, 0),
      makeCandle(80, 1),
      makeCandle(95, 2),
      makeCandle(90, 3),
    ];
    const forward = [makeCandle(75, 4)];
    const result = resolveNoNewLowGroundTruth(lookback, forward);
    expect(result.refLowPrice).toBe(80);
    expect(result.refLowCandlesBack).toBe(2);
    expect(result.labelNoNewLow).toBe(0);
  });
});
