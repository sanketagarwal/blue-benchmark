import { describe, it, expect } from 'vitest';
import type { Trade } from '../src/replay-lab/trades';
import { getMidPriceAtTime, getMidPriceChange } from '../src/replay-lab/mid-price';

function createTrade(
  timestamp: Date,
  price: number,
  overrides?: Partial<Trade>
): Trade {
  return {
    symbolId: 'COINBASE_SPOT_ETH_USD',
    timestamp,
    price,
    size: 1.0,
    takerSide: 'BUY',
    uuid: `trade-${timestamp.getTime()}-${price}`,
    ...overrides,
  };
}

describe('Mid Price', () => {
  describe('getMidPriceAtTime', () => {
    it('should return undefined for empty trades array', () => {
      const targetTime = new Date('2025-12-22T10:00:00Z');
      const result = getMidPriceAtTime([], targetTime);
      expect(result).toBeUndefined();
    });

    it('should return correct mid for single trade', () => {
      const targetTime = new Date('2025-12-22T10:00:00Z');
      const trades = [createTrade(new Date('2025-12-22T10:00:30Z'), 100)];

      // Single trade: mid = (min + max) / 2 = (100 + 100) / 2 = 100
      const result = getMidPriceAtTime(trades, targetTime);
      expect(result).toBe(100);
    });

    it('should return average of min/max for multiple trades in window', () => {
      const targetTime = new Date('2025-12-22T10:00:00Z');
      const trades = [
        createTrade(new Date('2025-12-22T10:00:10Z'), 90),  // min
        createTrade(new Date('2025-12-22T10:00:20Z'), 110), // max
        createTrade(new Date('2025-12-22T10:00:30Z'), 100), // middle
      ];

      // mid = (90 + 110) / 2 = 100
      const result = getMidPriceAtTime(trades, targetTime);
      expect(result).toBe(100);
    });

    it('should return undefined if no trades in window', () => {
      const targetTime = new Date('2025-12-22T10:00:00Z');
      const windowMs = 60000; // 1 minute
      const trades = [
        // Trade is 2 minutes after targetTime, outside the 1-minute window
        createTrade(new Date('2025-12-22T10:02:00Z'), 100),
      ];

      const result = getMidPriceAtTime(trades, targetTime, windowMs);
      expect(result).toBeUndefined();
    });

    it('should respect custom windowMs parameter', () => {
      const targetTime = new Date('2025-12-22T10:00:00Z');
      const windowMs = 30000; // 30 seconds
      const trades = [
        createTrade(new Date('2025-12-22T10:00:20Z'), 100), // within 30s window
        createTrade(new Date('2025-12-22T10:00:45Z'), 200), // outside 30s window
      ];

      // Only the first trade is in window, so mid = 100
      const result = getMidPriceAtTime(trades, targetTime, windowMs);
      expect(result).toBe(100);
    });

    it('should include trades exactly at window boundary', () => {
      const targetTime = new Date('2025-12-22T10:00:00Z');
      const windowMs = 60000; // 1 minute
      const trades = [
        createTrade(new Date('2025-12-22T10:01:00Z'), 100), // exactly at boundary
      ];

      const result = getMidPriceAtTime(trades, targetTime, windowMs);
      expect(result).toBe(100);
    });
  });

  describe('getMidPriceChange', () => {
    it('should compute correct price change between two times', () => {
      const fillTime = new Date('2025-12-22T10:00:00Z');
      const horizonMs = 60000; // 1 minute
      const trades = [
        // Trades near fill time
        createTrade(new Date('2025-12-22T10:00:10Z'), 90),
        createTrade(new Date('2025-12-22T10:00:20Z'), 110),
        // Trades near exit time (fill + 1 minute)
        createTrade(new Date('2025-12-22T10:01:10Z'), 100),
        createTrade(new Date('2025-12-22T10:01:20Z'), 120),
      ];

      // Fill mid = (90 + 110) / 2 = 100
      // Exit mid = (100 + 120) / 2 = 110
      // Change = 110 - 100 = 10
      const result = getMidPriceChange(trades, fillTime, horizonMs);
      expect(result).toBe(10);
    });

    it('should return undefined if fill time has no trades', () => {
      const fillTime = new Date('2025-12-22T10:00:00Z');
      const horizonMs = 60000;
      const trades = [
        // Only trades near exit time, none near fill time
        createTrade(new Date('2025-12-22T10:01:10Z'), 100),
      ];

      const result = getMidPriceChange(trades, fillTime, horizonMs);
      expect(result).toBeUndefined();
    });

    it('should return undefined if exit time has no trades', () => {
      const fillTime = new Date('2025-12-22T10:00:00Z');
      const horizonMs = 60000;
      const trades = [
        // Only trades near fill time, none near exit time
        createTrade(new Date('2025-12-22T10:00:10Z'), 100),
      ];

      const result = getMidPriceChange(trades, fillTime, horizonMs);
      expect(result).toBeUndefined();
    });

    it('should return undefined for empty trades array', () => {
      const fillTime = new Date('2025-12-22T10:00:00Z');
      const horizonMs = 60000;

      const result = getMidPriceChange([], fillTime, horizonMs);
      expect(result).toBeUndefined();
    });

    it('should handle negative price changes', () => {
      const fillTime = new Date('2025-12-22T10:00:00Z');
      const horizonMs = 60000;
      const trades = [
        // Fill time trades - higher prices
        createTrade(new Date('2025-12-22T10:00:10Z'), 100),
        createTrade(new Date('2025-12-22T10:00:20Z'), 120),
        // Exit time trades - lower prices
        createTrade(new Date('2025-12-22T10:01:10Z'), 80),
        createTrade(new Date('2025-12-22T10:01:20Z'), 100),
      ];

      // Fill mid = (100 + 120) / 2 = 110
      // Exit mid = (80 + 100) / 2 = 90
      // Change = 90 - 110 = -20
      const result = getMidPriceChange(trades, fillTime, horizonMs);
      expect(result).toBe(-20);
    });

    it('should handle zero price change', () => {
      const fillTime = new Date('2025-12-22T10:00:00Z');
      const horizonMs = 60000;
      const trades = [
        // Same prices at both times
        createTrade(new Date('2025-12-22T10:00:10Z'), 100),
        createTrade(new Date('2025-12-22T10:01:10Z'), 100),
      ];

      // Fill mid = 100, Exit mid = 100, Change = 0
      const result = getMidPriceChange(trades, fillTime, horizonMs);
      expect(result).toBe(0);
    });
  });
});
