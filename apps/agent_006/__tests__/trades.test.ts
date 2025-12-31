import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTrades, type Trade } from '../src/replay-lab/trades';

describe('Replay Lab Trades', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv('REPLAY_LAB_API_KEY', 'test-api-key');
    vi.stubEnv('REPLAY_LAB_BASE_URL', 'https://test.example.com');
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
    mockFetch.mockReset();
  });

  describe('getTrades', () => {
    it('should fetch trades from the API endpoint', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const from = new Date('2025-12-22T10:00:00Z');
      const to = new Date('2025-12-22T10:30:00Z');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          symbol_id: 'COINBASE_SPOT_ETH_USD',
          trades: [
            {
              symbol_id: 'COINBASE_SPOT_ETH_USD',
              timestamp: '2025-12-22T10:15:00.123Z',
              price: 3500.5,
              size: 1.5,
              taker_side: 'BUY',
              uuid: 'trade-uuid-1',
            },
          ],
        }),
      });

      await getTrades(symbolId, from, to);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/trades/COINBASE_SPOT_ETH_USD'),
        expect.anything()
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('from=2025-12-22T10:00:00.000Z'),
        expect.anything()
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('to=2025-12-22T10:30:00.000Z'),
        expect.anything()
      );
    });

    it('should parse timestamps to Date objects', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const from = new Date('2025-12-22T10:00:00Z');
      const to = new Date('2025-12-22T10:30:00Z');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          symbol_id: 'COINBASE_SPOT_ETH_USD',
          trades: [
            {
              symbol_id: 'COINBASE_SPOT_ETH_USD',
              timestamp: '2025-12-22T10:15:00.123Z',
              price: 3500.5,
              size: 1.5,
              taker_side: 'BUY',
              uuid: 'trade-uuid-1',
            },
          ],
        }),
      });

      const trades = await getTrades(symbolId, from, to);

      expect(trades[0]?.timestamp).toBeInstanceOf(Date);
      expect(trades[0]?.timestamp.toISOString()).toBe('2025-12-22T10:15:00.123Z');
    });

    it('should convert snake_case response to camelCase Trade objects', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const from = new Date('2025-12-22T10:00:00Z');
      const to = new Date('2025-12-22T10:30:00Z');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          symbol_id: 'COINBASE_SPOT_ETH_USD',
          trades: [
            {
              symbol_id: 'COINBASE_SPOT_ETH_USD',
              timestamp: '2025-12-22T10:15:00.123Z',
              price: 3500.5,
              size: 1.5,
              taker_side: 'BUY',
              uuid: 'trade-uuid-1',
            },
            {
              symbol_id: 'COINBASE_SPOT_ETH_USD',
              timestamp: '2025-12-22T10:20:00.456Z',
              price: 3505.25,
              size: 2.0,
              taker_side: 'SELL',
              uuid: 'trade-uuid-2',
            },
          ],
        }),
      });

      const trades = await getTrades(symbolId, from, to);

      expect(trades).toHaveLength(2);
      expect(trades[0]).toEqual({
        symbolId: 'COINBASE_SPOT_ETH_USD',
        timestamp: new Date('2025-12-22T10:15:00.123Z'),
        price: 3500.5,
        size: 1.5,
        takerSide: 'BUY',
        uuid: 'trade-uuid-1',
      });
      expect(trades[1]).toEqual({
        symbolId: 'COINBASE_SPOT_ETH_USD',
        timestamp: new Date('2025-12-22T10:20:00.456Z'),
        price: 3505.25,
        size: 2.0,
        takerSide: 'SELL',
        uuid: 'trade-uuid-2',
      });
    });

    it('should include limit parameter when provided', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const from = new Date('2025-12-22T10:00:00Z');
      const to = new Date('2025-12-22T10:30:00Z');
      const limit = 500;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          symbol_id: 'COINBASE_SPOT_ETH_USD',
          trades: [],
        }),
      });

      await getTrades(symbolId, from, to, limit);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=500'),
        expect.anything()
      );
    });

    it('should not include limit parameter when not provided', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const from = new Date('2025-12-22T10:00:00Z');
      const to = new Date('2025-12-22T10:30:00Z');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          symbol_id: 'COINBASE_SPOT_ETH_USD',
          trades: [],
        }),
      });

      await getTrades(symbolId, from, to);

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).not.toContain('limit=');
    });

    it('should return empty array when no trades exist', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const from = new Date('2025-12-22T10:00:00Z');
      const to = new Date('2025-12-22T10:30:00Z');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          symbol_id: 'COINBASE_SPOT_ETH_USD',
          trades: [],
        }),
      });

      const trades = await getTrades(symbolId, from, to);

      expect(trades).toEqual([]);
    });

    it('should throw error when from and to are on different UTC days', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const from = new Date('2025-12-22T23:00:00Z');
      const to = new Date('2025-12-23T01:00:00Z');

      await expect(getTrades(symbolId, from, to)).rejects.toThrow(
        'from and to must be on the same UTC day'
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should allow from and to on the same UTC day at day boundaries', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const from = new Date('2025-12-22T00:00:00Z');
      const to = new Date('2025-12-22T23:59:59.999Z');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          symbol_id: 'COINBASE_SPOT_ETH_USD',
          trades: [],
        }),
      });

      await getTrades(symbolId, from, to);

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should throw error when to is before from', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const from = new Date('2025-12-22T12:00:00Z');
      const to = new Date('2025-12-22T10:00:00Z');

      await expect(getTrades(symbolId, from, to)).rejects.toThrow(
        'to must be after from'
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should propagate API errors', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const from = new Date('2025-12-22T10:00:00Z');
      const to = new Date('2025-12-22T10:30:00Z');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid symbol',
      });

      await expect(getTrades(symbolId, from, to)).rejects.toThrow(
        'Replay Lab API error (400): Invalid symbol'
      );
    });
  });
});
