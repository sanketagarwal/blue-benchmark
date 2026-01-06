import { describe, expect, it } from 'vitest';
import type { Trade } from '../src/replay-lab/trades.js';
import {
  checkBidFill,
  checkAskFill,
  computeFillGroundTruth,
  computeExtendedFillGroundTruth,
  type FillCheckResult,
  type FillGroundTruth,
  type ExtendedFillGroundTruth,
} from '../src/ground-truth/fill-checker.js';

/**
 * Fill Logic:
 * - Limit BUY at price P fills when: trade.takerSide = 'SELL' AND trade.price <= P
 * - Limit SELL at price P fills when: trade.takerSide = 'BUY' AND trade.price >= P
 */

function createTrade(overrides: Partial<Trade>): Trade {
  return {
    symbolId: 'COINBASE_SPOT_ETH_USD',
    timestamp: new Date('2025-01-01T12:01:00Z'),
    price: 100,
    size: 1,
    takerSide: 'BUY',
    uuid: 'test-uuid-' + Math.random().toString(36).substring(7),
    ...overrides,
  };
}

describe('Fill Checker', () => {
  const startTime = new Date('2025-01-01T12:00:00Z');
  const horizon1m = new Date('2025-01-01T12:01:00Z');
  const horizon5m = new Date('2025-01-01T12:05:00Z');
  const horizon15m = new Date('2025-01-01T12:15:00Z');

  describe('checkBidFill', () => {
    it('fills when SELL trade at bid price', () => {
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:00:30Z'),
          price: 100,
          size: 5,
          takerSide: 'SELL',
        }),
      ];

      const result = checkBidFill(trades, 100, startTime, horizon1m);

      expect(result.filled).toBe(true);
      expect(result.fillTime).toEqual(new Date('2025-01-01T12:00:30Z'));
      expect(result.fillPrice).toBe(100);
      expect(result.fillSize).toBe(5);
    });

    it('fills when SELL trade below bid price', () => {
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:00:30Z'),
          price: 99,
          size: 3,
          takerSide: 'SELL',
        }),
      ];

      const result = checkBidFill(trades, 100, startTime, horizon1m);

      expect(result.filled).toBe(true);
      expect(result.fillPrice).toBe(99);
      expect(result.fillSize).toBe(3);
    });

    it('does not fill when BUY trade (wrong taker side)', () => {
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:00:30Z'),
          price: 99,
          size: 10,
          takerSide: 'BUY',
        }),
      ];

      const result = checkBidFill(trades, 100, startTime, horizon1m);

      expect(result.filled).toBe(false);
      expect(result.fillTime).toBeUndefined();
      expect(result.fillPrice).toBeUndefined();
      expect(result.fillSize).toBeUndefined();
    });

    it('does not fill when SELL trade above bid price', () => {
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:00:30Z'),
          price: 101,
          size: 10,
          takerSide: 'SELL',
        }),
      ];

      const result = checkBidFill(trades, 100, startTime, horizon1m);

      expect(result.filled).toBe(false);
    });

    it('does not fill when trade is before startTime', () => {
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T11:59:59Z'),
          price: 99,
          size: 10,
          takerSide: 'SELL',
        }),
      ];

      const result = checkBidFill(trades, 100, startTime, horizon1m);

      expect(result.filled).toBe(false);
    });

    it('does not fill when trade is after horizon', () => {
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:01:01Z'),
          price: 99,
          size: 10,
          takerSide: 'SELL',
        }),
      ];

      const result = checkBidFill(trades, 100, startTime, horizon1m);

      expect(result.filled).toBe(false);
    });

    it('returns first fill when multiple qualifying trades exist', () => {
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:00:30Z'),
          price: 100,
          size: 5,
          takerSide: 'SELL',
        }),
        createTrade({
          timestamp: new Date('2025-01-01T12:00:45Z'),
          price: 99,
          size: 10,
          takerSide: 'SELL',
        }),
      ];

      const result = checkBidFill(trades, 100, startTime, horizon1m);

      expect(result.filled).toBe(true);
      expect(result.fillTime).toEqual(new Date('2025-01-01T12:00:30Z'));
      expect(result.fillSize).toBe(5);
    });

    it('handles unsorted trades by finding earliest qualifying fill', () => {
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:00:45Z'),
          price: 99,
          size: 10,
          takerSide: 'SELL',
        }),
        createTrade({
          timestamp: new Date('2025-01-01T12:00:30Z'),
          price: 100,
          size: 5,
          takerSide: 'SELL',
        }),
      ];

      const result = checkBidFill(trades, 100, startTime, horizon1m);

      expect(result.filled).toBe(true);
      expect(result.fillTime).toEqual(new Date('2025-01-01T12:00:30Z'));
    });
  });

  describe('checkAskFill', () => {
    it('fills when BUY trade at ask price', () => {
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:00:30Z'),
          price: 100,
          size: 5,
          takerSide: 'BUY',
        }),
      ];

      const result = checkAskFill(trades, 100, startTime, horizon1m);

      expect(result.filled).toBe(true);
      expect(result.fillTime).toEqual(new Date('2025-01-01T12:00:30Z'));
      expect(result.fillPrice).toBe(100);
      expect(result.fillSize).toBe(5);
    });

    it('fills when BUY trade above ask price', () => {
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:00:30Z'),
          price: 101,
          size: 3,
          takerSide: 'BUY',
        }),
      ];

      const result = checkAskFill(trades, 100, startTime, horizon1m);

      expect(result.filled).toBe(true);
      expect(result.fillPrice).toBe(101);
      expect(result.fillSize).toBe(3);
    });

    it('does not fill when SELL trade (wrong taker side)', () => {
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:00:30Z'),
          price: 101,
          size: 10,
          takerSide: 'SELL',
        }),
      ];

      const result = checkAskFill(trades, 100, startTime, horizon1m);

      expect(result.filled).toBe(false);
      expect(result.fillTime).toBeUndefined();
      expect(result.fillPrice).toBeUndefined();
      expect(result.fillSize).toBeUndefined();
    });

    it('does not fill when BUY trade below ask price', () => {
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:00:30Z'),
          price: 99,
          size: 10,
          takerSide: 'BUY',
        }),
      ];

      const result = checkAskFill(trades, 100, startTime, horizon1m);

      expect(result.filled).toBe(false);
    });

    it('does not fill when trade is before startTime', () => {
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T11:59:59Z'),
          price: 101,
          size: 10,
          takerSide: 'BUY',
        }),
      ];

      const result = checkAskFill(trades, 100, startTime, horizon1m);

      expect(result.filled).toBe(false);
    });

    it('does not fill when trade is after horizon', () => {
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:01:01Z'),
          price: 101,
          size: 10,
          takerSide: 'BUY',
        }),
      ];

      const result = checkAskFill(trades, 100, startTime, horizon1m);

      expect(result.filled).toBe(false);
    });

    it('returns first fill when multiple qualifying trades exist', () => {
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:00:30Z'),
          price: 100,
          size: 5,
          takerSide: 'BUY',
        }),
        createTrade({
          timestamp: new Date('2025-01-01T12:00:45Z'),
          price: 101,
          size: 10,
          takerSide: 'BUY',
        }),
      ];

      const result = checkAskFill(trades, 100, startTime, horizon1m);

      expect(result.filled).toBe(true);
      expect(result.fillTime).toEqual(new Date('2025-01-01T12:00:30Z'));
      expect(result.fillSize).toBe(5);
    });
  });

  describe('empty trades array', () => {
    it('returns no fill for bid with empty trades', () => {
      const result = checkBidFill([], 100, startTime, horizon1m);

      expect(result.filled).toBe(false);
      expect(result.fillTime).toBeUndefined();
      expect(result.fillPrice).toBeUndefined();
      expect(result.fillSize).toBeUndefined();
    });

    it('returns no fill for ask with empty trades', () => {
      const result = checkAskFill([], 100, startTime, horizon1m);

      expect(result.filled).toBe(false);
      expect(result.fillTime).toBeUndefined();
      expect(result.fillPrice).toBeUndefined();
      expect(result.fillSize).toBeUndefined();
    });
  });

  describe('computeFillGroundTruth', () => {
    it('returns all false for empty trades', () => {
      const predictionTime = new Date('2025-01-01T12:00:00Z');

      const result = computeFillGroundTruth([], 100, 101, predictionTime);

      expect(result['bid-fill-1m']).toBe(false);
      expect(result['bid-fill-5m']).toBe(false);
      expect(result['bid-fill-15m']).toBe(false);
      expect(result['ask-fill-1m']).toBe(false);
      expect(result['ask-fill-5m']).toBe(false);
      expect(result['ask-fill-15m']).toBe(false);
    });

    it('returns correct values for bid fill at 1m horizon', () => {
      const predictionTime = new Date('2025-01-01T12:00:00Z');
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:00:30Z'),
          price: 100,
          size: 5,
          takerSide: 'SELL',
        }),
      ];

      const result = computeFillGroundTruth(trades, 100, 101, predictionTime);

      expect(result['bid-fill-1m']).toBe(true);
      expect(result['bid-fill-5m']).toBe(true);
      expect(result['bid-fill-15m']).toBe(true);
      expect(result['ask-fill-1m']).toBe(false);
      expect(result['ask-fill-5m']).toBe(false);
      expect(result['ask-fill-15m']).toBe(false);
    });

    it('returns correct values for ask fill at 5m horizon only', () => {
      const predictionTime = new Date('2025-01-01T12:00:00Z');
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:03:00Z'),
          price: 101,
          size: 5,
          takerSide: 'BUY',
        }),
      ];

      const result = computeFillGroundTruth(trades, 100, 101, predictionTime);

      expect(result['bid-fill-1m']).toBe(false);
      expect(result['bid-fill-5m']).toBe(false);
      expect(result['bid-fill-15m']).toBe(false);
      expect(result['ask-fill-1m']).toBe(false);
      expect(result['ask-fill-5m']).toBe(true);
      expect(result['ask-fill-15m']).toBe(true);
    });

    it('returns correct values for 15m horizon only', () => {
      const predictionTime = new Date('2025-01-01T12:00:00Z');
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:10:00Z'),
          price: 99,
          size: 5,
          takerSide: 'SELL',
        }),
      ];

      const result = computeFillGroundTruth(trades, 100, 101, predictionTime);

      expect(result['bid-fill-1m']).toBe(false);
      expect(result['bid-fill-5m']).toBe(false);
      expect(result['bid-fill-15m']).toBe(true);
      expect(result['ask-fill-1m']).toBe(false);
      expect(result['ask-fill-5m']).toBe(false);
      expect(result['ask-fill-15m']).toBe(false);
    });

    it('returns correct values for both bid and ask fills', () => {
      const predictionTime = new Date('2025-01-01T12:00:00Z');
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:00:30Z'),
          price: 100,
          size: 5,
          takerSide: 'SELL',
        }),
        createTrade({
          timestamp: new Date('2025-01-01T12:00:45Z'),
          price: 101,
          size: 3,
          takerSide: 'BUY',
        }),
      ];

      const result = computeFillGroundTruth(trades, 100, 101, predictionTime);

      expect(result['bid-fill-1m']).toBe(true);
      expect(result['bid-fill-5m']).toBe(true);
      expect(result['bid-fill-15m']).toBe(true);
      expect(result['ask-fill-1m']).toBe(true);
      expect(result['ask-fill-5m']).toBe(true);
      expect(result['ask-fill-15m']).toBe(true);
    });

    it('correctly respects time horizons', () => {
      const predictionTime = new Date('2025-01-01T12:00:00Z');
      const trades: Trade[] = [
        // Bid fill at 3 minutes (fills 5m and 15m, not 1m)
        createTrade({
          timestamp: new Date('2025-01-01T12:03:00Z'),
          price: 100,
          size: 5,
          takerSide: 'SELL',
        }),
        // Ask fill at 7 minutes (fills 15m only, not 1m or 5m)
        createTrade({
          timestamp: new Date('2025-01-01T12:07:00Z'),
          price: 101,
          size: 3,
          takerSide: 'BUY',
        }),
      ];

      const result = computeFillGroundTruth(trades, 100, 101, predictionTime);

      expect(result['bid-fill-1m']).toBe(false);
      expect(result['bid-fill-5m']).toBe(true);
      expect(result['bid-fill-15m']).toBe(true);
      expect(result['ask-fill-1m']).toBe(false);
      expect(result['ask-fill-5m']).toBe(false);
      expect(result['ask-fill-15m']).toBe(true);
    });

    it('has correct type shape', () => {
      const predictionTime = new Date('2025-01-01T12:00:00Z');
      const result = computeFillGroundTruth([], 100, 101, predictionTime);

      // TypeScript type assertion - all 6 keys must exist
      const keys: (keyof FillGroundTruth)[] = [
        'bid-fill-1m',
        'bid-fill-5m',
        'bid-fill-15m',
        'ask-fill-1m',
        'ask-fill-5m',
        'ask-fill-15m',
      ];

      for (const key of keys) {
        expect(typeof result[key]).toBe('boolean');
      }
    });
  });

  describe('computeExtendedFillGroundTruth', () => {
    it('returns fill details with fillTime, fillPrice, fillSize when fill occurs', () => {
      const predictionTime = new Date('2025-01-01T12:00:00Z');
      const trades: Trade[] = [
        createTrade({
          timestamp: new Date('2025-01-01T12:00:30Z'),
          price: 100,
          size: 5,
          takerSide: 'SELL',
        }),
        createTrade({
          timestamp: new Date('2025-01-01T12:00:45Z'),
          price: 101,
          size: 3,
          takerSide: 'BUY',
        }),
      ];

      const result = computeExtendedFillGroundTruth(
        trades,
        100,
        101,
        predictionTime
      );

      // Check fills property (boolean ground truth)
      expect(result.fills['bid-fill-1m']).toBe(true);
      expect(result.fills['ask-fill-1m']).toBe(true);

      // Check details for bid fill
      expect(result.details['bid-fill-1m'].filled).toBe(true);
      expect(result.details['bid-fill-1m'].fillTime).toEqual(
        new Date('2025-01-01T12:00:30Z')
      );
      expect(result.details['bid-fill-1m'].fillPrice).toBe(100);
      expect(result.details['bid-fill-1m'].fillSize).toBe(5);

      // Check details for ask fill
      expect(result.details['ask-fill-1m'].filled).toBe(true);
      expect(result.details['ask-fill-1m'].fillTime).toEqual(
        new Date('2025-01-01T12:00:45Z')
      );
      expect(result.details['ask-fill-1m'].fillPrice).toBe(101);
      expect(result.details['ask-fill-1m'].fillSize).toBe(3);
    });

    it('returns empty details (filled: false) when no fill', () => {
      const predictionTime = new Date('2025-01-01T12:00:00Z');
      const trades: Trade[] = [];

      const result = computeExtendedFillGroundTruth(
        trades,
        100,
        101,
        predictionTime
      );

      // Check fills property (all false)
      expect(result.fills['bid-fill-1m']).toBe(false);
      expect(result.fills['bid-fill-5m']).toBe(false);
      expect(result.fills['bid-fill-15m']).toBe(false);
      expect(result.fills['ask-fill-1m']).toBe(false);
      expect(result.fills['ask-fill-5m']).toBe(false);
      expect(result.fills['ask-fill-15m']).toBe(false);

      // Check details are all unfilled
      expect(result.details['bid-fill-1m'].filled).toBe(false);
      expect(result.details['bid-fill-1m'].fillTime).toBeUndefined();
      expect(result.details['bid-fill-1m'].fillPrice).toBeUndefined();
      expect(result.details['bid-fill-1m'].fillSize).toBeUndefined();

      expect(result.details['ask-fill-15m'].filled).toBe(false);
      expect(result.details['ask-fill-15m'].fillTime).toBeUndefined();
    });

    it('detailed results match the boolean ground truth', () => {
      const predictionTime = new Date('2025-01-01T12:00:00Z');
      const trades: Trade[] = [
        // Bid fill at 3 minutes (fills 5m and 15m, not 1m)
        createTrade({
          timestamp: new Date('2025-01-01T12:03:00Z'),
          price: 100,
          size: 5,
          takerSide: 'SELL',
        }),
        // Ask fill at 7 minutes (fills 15m only, not 1m or 5m)
        createTrade({
          timestamp: new Date('2025-01-01T12:07:00Z'),
          price: 101,
          size: 3,
          takerSide: 'BUY',
        }),
      ];

      const result = computeExtendedFillGroundTruth(
        trades,
        100,
        101,
        predictionTime
      );

      // Verify boolean fills match details.filled for all 6 contracts
      expect(result.fills['bid-fill-1m']).toBe(
        result.details['bid-fill-1m'].filled
      );
      expect(result.fills['bid-fill-5m']).toBe(
        result.details['bid-fill-5m'].filled
      );
      expect(result.fills['bid-fill-15m']).toBe(
        result.details['bid-fill-15m'].filled
      );
      expect(result.fills['ask-fill-1m']).toBe(
        result.details['ask-fill-1m'].filled
      );
      expect(result.fills['ask-fill-5m']).toBe(
        result.details['ask-fill-5m'].filled
      );
      expect(result.fills['ask-fill-15m']).toBe(
        result.details['ask-fill-15m'].filled
      );

      // Verify specific horizon behavior
      expect(result.fills['bid-fill-1m']).toBe(false);
      expect(result.fills['bid-fill-5m']).toBe(true);
      expect(result.fills['bid-fill-15m']).toBe(true);
      expect(result.fills['ask-fill-1m']).toBe(false);
      expect(result.fills['ask-fill-5m']).toBe(false);
      expect(result.fills['ask-fill-15m']).toBe(true);

      // Verify details have proper fill info for filled contracts
      expect(result.details['bid-fill-5m'].fillTime).toEqual(
        new Date('2025-01-01T12:03:00Z')
      );
      expect(result.details['bid-fill-5m'].fillPrice).toBe(100);
      expect(result.details['bid-fill-5m'].fillSize).toBe(5);

      expect(result.details['ask-fill-15m'].fillTime).toEqual(
        new Date('2025-01-01T12:07:00Z')
      );
      expect(result.details['ask-fill-15m'].fillPrice).toBe(101);
      expect(result.details['ask-fill-15m'].fillSize).toBe(3);
    });

    it('has correct type shape', () => {
      const predictionTime = new Date('2025-01-01T12:00:00Z');
      const result = computeExtendedFillGroundTruth(
        [],
        100,
        101,
        predictionTime
      );

      // Verify fills has all 6 boolean keys
      const fillKeys: (keyof FillGroundTruth)[] = [
        'bid-fill-1m',
        'bid-fill-5m',
        'bid-fill-15m',
        'ask-fill-1m',
        'ask-fill-5m',
        'ask-fill-15m',
      ];

      for (const key of fillKeys) {
        expect(typeof result.fills[key]).toBe('boolean');
      }

      // Verify details has all 6 FillCheckResult objects
      for (const key of fillKeys) {
        expect(typeof result.details[key].filled).toBe('boolean');
      }
    });
  });
});
