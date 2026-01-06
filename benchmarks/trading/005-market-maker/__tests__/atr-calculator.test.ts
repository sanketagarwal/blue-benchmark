import { describe, expect, it } from 'vitest';
import { buildCandles, calculateATR, getATRForHorizon, type Candle } from '../src/replay-lab/atr-calculator';
import type { Trade } from '../src/replay-lab/trades';

describe('ATR Calculator', () => {
  describe('buildCandles', () => {
    it('builds 1-minute candles from trades', () => {
      const baseTime = new Date('2024-01-01T12:00:00Z');
      const trades: Trade[] = [
        { symbolId: 'BTC', timestamp: new Date(baseTime.getTime() + 10_000), price: 100, size: 1, takerSide: 'BUY', uuid: '1' },
        { symbolId: 'BTC', timestamp: new Date(baseTime.getTime() + 20_000), price: 105, size: 1, takerSide: 'BUY', uuid: '2' },
        { symbolId: 'BTC', timestamp: new Date(baseTime.getTime() + 30_000), price: 98, size: 1, takerSide: 'SELL', uuid: '3' },
        { symbolId: 'BTC', timestamp: new Date(baseTime.getTime() + 70_000), price: 102, size: 1, takerSide: 'BUY', uuid: '4' },
      ];

      const candles = buildCandles(trades, baseTime, 60_000, 2);

      expect(candles).toHaveLength(2);
      expect(candles[0]).toEqual({ open: 100, high: 105, low: 98, close: 98 });
      expect(candles[1]).toEqual({ open: 102, high: 102, low: 102, close: 102 });
    });

    it('returns empty array when no trades in lookback', () => {
      const candles = buildCandles([], new Date(), 60_000, 20);
      expect(candles).toHaveLength(0);
    });
  });

  describe('calculateATR', () => {
    it('computes ATR from candles using Wilder smoothing', () => {
      // 3 candles with known true ranges
      const candles: Candle[] = [
        { open: 100, high: 110, low: 95, close: 105 },  // TR = 15 (high - low)
        { open: 105, high: 112, low: 102, close: 108 }, // TR = max(10, 7, 3) = 10
        { open: 108, high: 115, low: 100, close: 110 }, // TR = max(15, 7, 8) = 15
      ];

      const atr = calculateATR(candles);

      // First ATR = 15 (first TR)
      // Second ATR = (15 * 2 + 10) / 3 = 40/3 ≈ 13.33
      // Third ATR = (13.33 * 2 + 15) / 3 ≈ 13.89
      expect(atr).toBeCloseTo(13.89, 1);
    });

    it('returns undefined for empty candles', () => {
      expect(calculateATR([])).toBeUndefined();
    });

    it('returns first TR for single candle', () => {
      const candles: Candle[] = [{ open: 100, high: 110, low: 95, close: 105 }];
      expect(calculateATR(candles)).toBe(15);
    });
  });

  describe('getATRForHorizon', () => {
    it('computes ATR for 1m horizon using 20 one-minute candles', () => {
      const baseTime = new Date('2024-01-01T12:00:00Z');
      const trades: Trade[] = [];

      // Create 20 minutes of trades with consistent 10-point range
      for (let minute = 0; minute < 20; minute++) {
        const candleStart = baseTime.getTime() - (20 - minute) * 60_000;
        trades.push(
          { symbolId: 'BTC', timestamp: new Date(candleStart + 10_000), price: 100, size: 1, takerSide: 'BUY', uuid: `${minute}-1` },
          { symbolId: 'BTC', timestamp: new Date(candleStart + 30_000), price: 110, size: 1, takerSide: 'BUY', uuid: `${minute}-2` },
          { symbolId: 'BTC', timestamp: new Date(candleStart + 50_000), price: 105, size: 1, takerSide: 'SELL', uuid: `${minute}-3` },
        );
      }

      const atr = getATRForHorizon(trades, baseTime, '1m');

      // Each candle has range of 10, ATR should converge to ~10
      expect(atr).toBeCloseTo(10, 0);
    });

    it('returns undefined when insufficient trade data', () => {
      const atr = getATRForHorizon([], new Date(), '1m');
      expect(atr).toBeUndefined();
    });
  });
});
