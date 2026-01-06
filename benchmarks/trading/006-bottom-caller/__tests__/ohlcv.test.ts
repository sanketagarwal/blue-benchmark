import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCandles, getEntryPriceFromCandles, computeMaxDrawdownFromCandles, type Candle, type CandleTimeframe } from '../src/replay-lab/ohlcv';
import * as client from '../src/replay-lab/client';

vi.mock('../src/replay-lab/client', async (importOriginal) => {
  const actual = await importOriginal<typeof client>();
  return {
    ...actual,
    replayLabFetch: vi.fn(),
  };
});

describe('OHLCV', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCandles', () => {
    it('should fetch candles from the API endpoint', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const timeframe: CandleTimeframe = '5m';
      const from = new Date('2025-12-22T10:00:00Z');
      const to = new Date('2025-12-22T12:00:00Z');

      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: symbolId,
        timeframe: '5m',
        candles: [
          {
            timestamp: '2025-12-22T10:00:00Z',
            open: 3500,
            high: 3550,
            low: 3480,
            close: 3520,
            volume: 1000,
          },
        ],
      });

      const candles = await getCandles(symbolId, timeframe, from, to);

      expect(client.replayLabFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/ohlcv/COINBASE_SPOT_ETH_USD')
      );
      expect(client.replayLabFetch).toHaveBeenCalledWith(
        expect.stringContaining('timeframe=5m')
      );
      expect(client.replayLabFetch).toHaveBeenCalledWith(
        expect.stringContaining('from=2025-12-22T10:00:00.000Z')
      );
      expect(client.replayLabFetch).toHaveBeenCalledWith(
        expect.stringContaining('to=2025-12-22T12:00:00.000Z')
      );
      expect(candles).toHaveLength(1);
    });

    it('should convert timestamps to Date objects', async () => {
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: 'COINBASE_SPOT_ETH_USD',
        timeframe: '5m',
        candles: [
          {
            timestamp: '2025-12-22T10:00:00Z',
            open: 3500,
            high: 3550,
            low: 3480,
            close: 3520,
            volume: 1000,
          },
        ],
      });

      const candles = await getCandles(
        'COINBASE_SPOT_ETH_USD',
        '5m',
        new Date('2025-12-22T10:00:00Z'),
        new Date('2025-12-22T12:00:00Z')
      );

      expect(candles[0]?.timestamp).toBeInstanceOf(Date);
      expect(candles[0]?.timestamp.toISOString()).toBe('2025-12-22T10:00:00.000Z');
    });

    it('should return all candle fields properly converted', async () => {
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: 'COINBASE_SPOT_ETH_USD',
        timeframe: '1h',
        candles: [
          {
            timestamp: '2025-12-22T10:00:00Z',
            open: 3500.5,
            high: 3550.25,
            low: 3480.75,
            close: 3520.125,
            volume: 1234.5,
          },
          {
            timestamp: '2025-12-22T11:00:00Z',
            open: 3520,
            high: 3600,
            low: 3510,
            close: 3590,
            volume: 2000,
          },
        ],
      });

      const candles = await getCandles(
        'COINBASE_SPOT_ETH_USD',
        '1h',
        new Date('2025-12-22T10:00:00Z'),
        new Date('2025-12-22T12:00:00Z')
      );

      expect(candles).toHaveLength(2);
      expect(candles[0]).toEqual({
        timestamp: new Date('2025-12-22T10:00:00Z'),
        open: 3500.5,
        high: 3550.25,
        low: 3480.75,
        close: 3520.125,
        volume: 1234.5,
      });
      expect(candles[1]).toEqual({
        timestamp: new Date('2025-12-22T11:00:00Z'),
        open: 3520,
        high: 3600,
        low: 3510,
        close: 3590,
        volume: 2000,
      });
    });

    it('should use default limit of 1000 when not specified', async () => {
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: 'COINBASE_SPOT_ETH_USD',
        timeframe: '5m',
        candles: [],
      });

      await getCandles(
        'COINBASE_SPOT_ETH_USD',
        '5m',
        new Date('2025-12-22T10:00:00Z'),
        new Date('2025-12-22T12:00:00Z')
      );

      expect(client.replayLabFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=1000')
      );
    });

    it('should use custom limit when specified', async () => {
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: 'COINBASE_SPOT_ETH_USD',
        timeframe: '5m',
        candles: [],
      });

      await getCandles(
        'COINBASE_SPOT_ETH_USD',
        '5m',
        new Date('2025-12-22T10:00:00Z'),
        new Date('2025-12-22T12:00:00Z'),
        500
      );

      expect(client.replayLabFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=500')
      );
    });

    it('should return empty array when no candles exist', async () => {
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: 'COINBASE_SPOT_ETH_USD',
        timeframe: '5m',
        candles: [],
      });

      const candles = await getCandles(
        'COINBASE_SPOT_ETH_USD',
        '5m',
        new Date('2025-12-22T10:00:00Z'),
        new Date('2025-12-22T12:00:00Z')
      );

      expect(candles).toEqual([]);
    });

    it('should support all timeframe values', async () => {
      const timeframes: CandleTimeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

      for (const tf of timeframes) {
        vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
          symbol_id: 'COINBASE_SPOT_ETH_USD',
          timeframe: tf,
          candles: [],
        });

        await getCandles(
          'COINBASE_SPOT_ETH_USD',
          tf,
          new Date('2025-12-22T10:00:00Z'),
          new Date('2025-12-22T12:00:00Z')
        );

        expect(client.replayLabFetch).toHaveBeenLastCalledWith(
          expect.stringContaining(`timeframe=${tf}`)
        );
      }
    });
  });

  describe('getEntryPriceFromCandles', () => {
    it('should return undefined for empty candles array', () => {
      const result = getEntryPriceFromCandles([], new Date('2025-12-22T10:00:00Z'));
      expect(result).toBeUndefined();
    });

    it('should return open price of first candle at or after prediction time', () => {
      const candles: Candle[] = [
        { timestamp: new Date('2025-12-22T09:55:00Z'), open: 3500, high: 3510, low: 3490, close: 3505, volume: 100 },
        { timestamp: new Date('2025-12-22T10:00:00Z'), open: 3510, high: 3520, low: 3505, close: 3515, volume: 150 },
        { timestamp: new Date('2025-12-22T10:05:00Z'), open: 3515, high: 3525, low: 3510, close: 3520, volume: 120 },
      ];

      const result = getEntryPriceFromCandles(candles, new Date('2025-12-22T10:00:00Z'));
      expect(result).toBe(3510);
    });

    it('should return open price of first candle when prediction time is before all candles', () => {
      const candles: Candle[] = [
        { timestamp: new Date('2025-12-22T10:00:00Z'), open: 3510, high: 3520, low: 3505, close: 3515, volume: 150 },
        { timestamp: new Date('2025-12-22T10:05:00Z'), open: 3515, high: 3525, low: 3510, close: 3520, volume: 120 },
      ];

      const result = getEntryPriceFromCandles(candles, new Date('2025-12-22T09:55:00Z'));
      expect(result).toBe(3510);
    });

    it('should return first candle open when prediction time is after all candles', () => {
      const candles: Candle[] = [
        { timestamp: new Date('2025-12-22T10:00:00Z'), open: 3510, high: 3520, low: 3505, close: 3515, volume: 150 },
        { timestamp: new Date('2025-12-22T10:05:00Z'), open: 3515, high: 3525, low: 3510, close: 3520, volume: 120 },
      ];

      const result = getEntryPriceFromCandles(candles, new Date('2025-12-22T11:00:00Z'));
      // No candle at or after 11:00, so falls back to first candle's open
      expect(result).toBe(3510);
    });

    it('should match candle exactly at prediction time', () => {
      const candles: Candle[] = [
        { timestamp: new Date('2025-12-22T10:00:00Z'), open: 3500, high: 3510, low: 3490, close: 3505, volume: 100 },
      ];

      const result = getEntryPriceFromCandles(candles, new Date('2025-12-22T10:00:00Z'));
      expect(result).toBe(3500);
    });
  });

  describe('computeMaxDrawdownFromCandles', () => {
    it('should return 0 for empty candles array', () => {
      const result = computeMaxDrawdownFromCandles([], 3500);
      expect(result).toBe(0);
    });

    it('should return 0 when entry price is 0', () => {
      const candles: Candle[] = [
        { timestamp: new Date('2025-12-22T10:00:00Z'), open: 3500, high: 3510, low: 3490, close: 3505, volume: 100 },
      ];

      const result = computeMaxDrawdownFromCandles(candles, 0);
      expect(result).toBe(0);
    });

    it('should return 0 when entry price is negative', () => {
      const candles: Candle[] = [
        { timestamp: new Date('2025-12-22T10:00:00Z'), open: 3500, high: 3510, low: 3490, close: 3505, volume: 100 },
      ];

      const result = computeMaxDrawdownFromCandles(candles, -100);
      expect(result).toBe(0);
    });

    it('should compute drawdown correctly for single candle', () => {
      const candles: Candle[] = [
        { timestamp: new Date('2025-12-22T10:00:00Z'), open: 100, high: 110, low: 90, close: 105, volume: 100 },
      ];

      // Entry at 100, lowest low is 90
      // Drawdown = (100 - 90) / 100 = 0.1
      const result = computeMaxDrawdownFromCandles(candles, 100);
      expect(result).toBeCloseTo(0.1, 5);
    });

    it('should find the lowest low across multiple candles', () => {
      const candles: Candle[] = [
        { timestamp: new Date('2025-12-22T10:00:00Z'), open: 100, high: 110, low: 95, close: 105, volume: 100 },
        { timestamp: new Date('2025-12-22T10:05:00Z'), open: 105, high: 115, low: 85, close: 110, volume: 120 },
        { timestamp: new Date('2025-12-22T10:10:00Z'), open: 110, high: 120, low: 90, close: 115, volume: 130 },
      ];

      // Entry at 100, lowest low across all candles is 85
      // Drawdown = (100 - 85) / 100 = 0.15
      const result = computeMaxDrawdownFromCandles(candles, 100);
      expect(result).toBeCloseTo(0.15, 5);
    });

    it('should return 0 when price never drops below entry', () => {
      const candles: Candle[] = [
        { timestamp: new Date('2025-12-22T10:00:00Z'), open: 100, high: 110, low: 100, close: 105, volume: 100 },
        { timestamp: new Date('2025-12-22T10:05:00Z'), open: 105, high: 115, low: 102, close: 110, volume: 120 },
      ];

      // Entry at 100, all lows are >= 100
      const result = computeMaxDrawdownFromCandles(candles, 100);
      expect(result).toBe(0);
    });

    it('should handle fractional prices correctly', () => {
      const candles: Candle[] = [
        { timestamp: new Date('2025-12-22T10:00:00Z'), open: 3500.5, high: 3510.25, low: 3475.75, close: 3505.125, volume: 100 },
      ];

      // Entry at 3500, lowest low is 3475.75
      // Drawdown = (3500 - 3475.75) / 3500 = 0.006928...
      const result = computeMaxDrawdownFromCandles(candles, 3500);
      expect(result).toBeCloseTo(0.00693, 4);
    });
  });
});

// Type assertion to ensure CandleTimeframe export works
const _typeCheckTimeframe: CandleTimeframe = '1m';
void _typeCheckTimeframe;
