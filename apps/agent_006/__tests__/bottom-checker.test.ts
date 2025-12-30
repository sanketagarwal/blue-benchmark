import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  resolveBottomGroundTruth,
  computeMaxDrawdown,
} from '../src/ground-truth/bottom-checker.js';
import * as annotations from '../src/replay-lab/annotations.js';
import type { LocalExtremaAnnotation } from '../src/replay-lab/annotations.js';
import type { Trade } from '../src/replay-lab/trades.js';

vi.mock('../src/replay-lab/annotations.js', async (importOriginal) => {
  const actual = await importOriginal<typeof annotations>();
  return {
    ...actual,
    getLocalExtremaAnnotations: vi.fn(),
  };
});

function createTrade(
  timestamp: Date,
  price: number,
  overrides?: Partial<Trade>
): Trade {
  return {
    symbolId: 'COINBASE_SPOT_BTC_USD',
    timestamp,
    price,
    size: 1.0,
    takerSide: 'BUY',
    uuid: `trade-${timestamp.getTime()}-${price}`,
    ...overrides,
  };
}

describe('bottom-checker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('computeMaxDrawdown', () => {
    it('computes drawdown as positive magnitude', () => {
      const trades: Trade[] = [
        createTrade(new Date('2025-01-01T00:00:00Z'), 100),
        createTrade(new Date('2025-01-01T00:05:00Z'), 98),
        createTrade(new Date('2025-01-01T00:10:00Z'), 102),
      ];
      const entryPrice = 100;

      const drawdown = computeMaxDrawdown(trades, entryPrice);

      // (100 - 98) / 100 = 0.02
      expect(drawdown).toBe(0.02);
    });

    it('returns 0 if price never goes below entry', () => {
      const trades: Trade[] = [
        createTrade(new Date('2025-01-01T00:00:00Z'), 100),
        createTrade(new Date('2025-01-01T00:05:00Z'), 105),
      ];

      const drawdown = computeMaxDrawdown(trades, 100);

      expect(drawdown).toBe(0);
    });

    it('returns 0 for empty trades array', () => {
      const drawdown = computeMaxDrawdown([], 100);
      expect(drawdown).toBe(0);
    });
  });

  describe('resolveBottomGroundTruth', () => {
    it('returns valid=true when pivot LOW exists and drawdown within threshold', async () => {
      vi.mocked(annotations.getLocalExtremaAnnotations).mockResolvedValue([
        {
          id: '1',
          time_start: '2025-01-01T00:05:00Z',
          time_end: null,
          type: 'local_extrema',
          schema_version: '1.0',
          payload: { direction: 'low', price: 99.5 },
          source: 'fractal',
        },
      ]);

      const trades: Trade[] = [
        createTrade(new Date('2025-01-01T00:00:00Z'), 100),
        createTrade(new Date('2025-01-01T00:05:00Z'), 99.7),
        createTrade(new Date('2025-01-01T00:10:00Z'), 101),
      ];

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z'),
        trades
      );

      expect(result.hasStructuralBottom).toBe(true);
      // Drawdown = (100 - 99.7) / 100 = 0.003
      expect(result.maxDrawdownPct).toBeCloseTo(0.003, 4);
      // 15m threshold is 0.004, so 0.003 is within threshold
      expect(result.isValid).toBe(true);
    });

    it('returns valid=false when drawdown exceeds threshold', async () => {
      vi.mocked(annotations.getLocalExtremaAnnotations).mockResolvedValue([
        {
          id: '1',
          time_start: '2025-01-01T00:05:00Z',
          time_end: null,
          type: 'local_extrema',
          schema_version: '1.0',
          payload: { direction: 'low' },
          source: 'fractal',
        },
      ]);

      const trades: Trade[] = [
        createTrade(new Date('2025-01-01T00:00:00Z'), 100),
        createTrade(new Date('2025-01-01T00:05:00Z'), 99),
      ];

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z'),
        trades
      );

      expect(result.hasStructuralBottom).toBe(true);
      // Drawdown = (100 - 99) / 100 = 0.01
      expect(result.maxDrawdownPct).toBe(0.01);
      // 15m threshold is 0.004, so 0.01 exceeds threshold
      expect(result.isValid).toBe(false);
    });

    it('returns valid=false when no pivot LOW exists', async () => {
      vi.mocked(annotations.getLocalExtremaAnnotations).mockResolvedValue([]);

      const trades: Trade[] = [
        createTrade(new Date('2025-01-01T00:00:00Z'), 100),
      ];

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z'),
        trades
      );

      expect(result.hasStructuralBottom).toBe(false);
      expect(result.isValid).toBe(false);
    });

    it('computes timeToPivotRatio when pivot exists', async () => {
      vi.mocked(annotations.getLocalExtremaAnnotations).mockResolvedValue([
        {
          id: '1',
          time_start: '2025-01-01T00:07:30Z',
          time_end: null,
          type: 'local_extrema',
          schema_version: '1.0',
          payload: { direction: 'low' },
          source: 'fractal',
        },
      ]);

      const trades: Trade[] = [
        createTrade(new Date('2025-01-01T00:00:00Z'), 100),
        createTrade(new Date('2025-01-01T00:07:30Z'), 99.8),
      ];

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z'),
        trades
      );

      // 15m horizon = 15 * 60 * 1000 = 900000ms
      // Pivot at 7:30 = 7.5 * 60 * 1000 = 450000ms from start
      // Ratio = 450000 / 900000 = 0.5
      expect(result.timeToPivotRatio).toBeCloseTo(0.5, 2);
    });

    it('returns hasStructuralBottom=false when only HIGH pivots exist', async () => {
      vi.mocked(annotations.getLocalExtremaAnnotations).mockResolvedValue([
        {
          id: '1',
          time_start: '2025-01-01T00:05:00Z',
          time_end: null,
          type: 'local_extrema',
          schema_version: '1.0',
          payload: { direction: 'high' },
          source: 'fractal',
        },
      ]);

      const trades: Trade[] = [
        createTrade(new Date('2025-01-01T00:00:00Z'), 100),
        createTrade(new Date('2025-01-01T00:05:00Z'), 101),
      ];

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z'),
        trades
      );

      // HIGH pivot should be filtered out
      expect(result.hasStructuralBottom).toBe(false);
      expect(result.isValid).toBe(false);
    });

    it('handles missing entry price gracefully', async () => {
      vi.mocked(annotations.getLocalExtremaAnnotations).mockResolvedValue([
        {
          id: '1',
          time_start: '2025-01-01T00:05:00Z',
          time_end: null,
          type: 'local_extrema',
          schema_version: '1.0',
          payload: { direction: 'low' },
          source: 'fractal',
        },
      ]);

      // No trades at prediction time - entry price will be undefined
      const trades: Trade[] = [
        createTrade(new Date('2025-01-01T00:05:00Z'), 99),
      ];

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z'),
        trades
      );

      // Should be invalid when we can't determine entry price
      expect(result.isValid).toBe(false);
      expect(result.hasStructuralBottom).toBe(true);
    });
  });
});
