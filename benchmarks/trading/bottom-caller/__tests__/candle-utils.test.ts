import { describe, expect, it } from 'vitest';

import {
  getCandleEndFromStart,
  getCandleStartFromEnd,
  getCandleTimeframeDurationMs,
  getLastClosedCandleEnd,
  isCandleClosed,
} from '../src/candle-utils.js';

describe('getCandleTimeframeDurationMs', () => {
  it('returns correct duration for 1m', () => {
    expect(getCandleTimeframeDurationMs('1m')).toBe(60_000);
  });

  it('returns correct duration for 5m', () => {
    expect(getCandleTimeframeDurationMs('5m')).toBe(5 * 60_000);
  });

  it('returns correct duration for 15m', () => {
    expect(getCandleTimeframeDurationMs('15m')).toBe(15 * 60_000);
  });

  it('returns correct duration for 1h', () => {
    expect(getCandleTimeframeDurationMs('1h')).toBe(60 * 60_000);
  });

  it('returns correct duration for 4h', () => {
    expect(getCandleTimeframeDurationMs('4h')).toBe(4 * 60 * 60_000);
  });
});

describe('getLastClosedCandleEnd', () => {
  it('returns aligned time for 5m candles when snapTime is aligned', () => {
    const snapTime = new Date('2025-01-01T00:00:00.000Z');
    const result = getLastClosedCandleEnd('5m', snapTime);
    expect(result.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  it('returns previous candle for mid-candle snapTime', () => {
    const snapTime = new Date('2025-01-01T00:02:30.000Z');
    const result = getLastClosedCandleEnd('5m', snapTime);
    expect(result.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  it('handles 1m candles correctly', () => {
    const snapTime = new Date('2025-01-01T00:00:30.000Z');
    const result = getLastClosedCandleEnd('1m', snapTime);
    expect(result.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  it('handles 15m candles correctly', () => {
    const snapTime = new Date('2025-01-01T00:20:00.000Z');
    const result = getLastClosedCandleEnd('15m', snapTime);
    expect(result.toISOString()).toBe('2025-01-01T00:15:00.000Z');
  });

  it('handles 1h candles correctly', () => {
    const snapTime = new Date('2025-01-01T01:30:00.000Z');
    const result = getLastClosedCandleEnd('1h', snapTime);
    expect(result.toISOString()).toBe('2025-01-01T01:00:00.000Z');
  });

  it('handles 4h candles correctly', () => {
    const snapTime = new Date('2025-01-01T05:00:00.000Z');
    const result = getLastClosedCandleEnd('4h', snapTime);
    expect(result.toISOString()).toBe('2025-01-01T04:00:00.000Z');
  });

  it('returns exact boundary when snapTime is exactly on boundary', () => {
    const snapTime = new Date('2025-01-01T04:00:00.000Z');
    const result = getLastClosedCandleEnd('4h', snapTime);
    expect(result.toISOString()).toBe('2025-01-01T04:00:00.000Z');
  });
});

describe('getCandleStartFromEnd', () => {
  it('returns correct start for 5m candle', () => {
    const candleEnd = new Date('2025-01-01T00:05:00.000Z');
    const result = getCandleStartFromEnd(candleEnd, '5m');
    expect(result.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  it('returns correct start for 4h candle', () => {
    const candleEnd = new Date('2025-01-01T08:00:00.000Z');
    const result = getCandleStartFromEnd(candleEnd, '4h');
    expect(result.toISOString()).toBe('2025-01-01T04:00:00.000Z');
  });
});

describe('getCandleEndFromStart', () => {
  it('returns correct end for 5m candle', () => {
    const candleStart = new Date('2025-01-01T00:00:00.000Z');
    const result = getCandleEndFromStart(candleStart, '5m');
    expect(result.toISOString()).toBe('2025-01-01T00:05:00.000Z');
  });

  it('returns correct end for 4h candle', () => {
    const candleStart = new Date('2025-01-01T04:00:00.000Z');
    const result = getCandleEndFromStart(candleStart, '4h');
    expect(result.toISOString()).toBe('2025-01-01T08:00:00.000Z');
  });
});

describe('isCandleClosed', () => {
  it('returns true when candle end equals snapTime', () => {
    const candleEnd = new Date('2025-01-01T00:05:00.000Z');
    const snapTime = new Date('2025-01-01T00:05:00.000Z');
    expect(isCandleClosed(candleEnd, snapTime)).toBe(true);
  });

  it('returns true when candle end is before snapTime', () => {
    const candleEnd = new Date('2025-01-01T00:05:00.000Z');
    const snapTime = new Date('2025-01-01T00:10:00.000Z');
    expect(isCandleClosed(candleEnd, snapTime)).toBe(true);
  });

  it('returns false when candle end is after snapTime', () => {
    const candleEnd = new Date('2025-01-01T00:10:00.000Z');
    const snapTime = new Date('2025-01-01T00:05:00.000Z');
    expect(isCandleClosed(candleEnd, snapTime)).toBe(false);
  });
});
