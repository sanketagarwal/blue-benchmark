import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getConfig, replayLabFetch } from '../src/replay-lab/client';
import {
  getSignedChartUrl,
  getForecastingCharts,
  type ChartParams,
} from '../src/replay-lab/charts';
import {
  getOrderbookSnapshot,
  formatOrderbookForPrompt,
  type OrderbookSnapshot,
} from '../src/replay-lab/orderbook';
import {
  getGroundTruthBatch,
  CONTRACT_IDS,
} from '../src/replay-lab/annotations';

describe('Replay Lab Client', () => {
  describe('getConfig', () => {
    beforeEach(() => {
      vi.stubEnv('REPLAY_LAB_API_KEY', 'test-api-key');
      vi.stubEnv('REPLAY_LAB_BASE_URL', 'https://test.example.com');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should return config from environment variables', () => {
      const config = getConfig();
      expect(config).toEqual({
        apiKey: 'test-api-key',
        baseUrl: 'https://test.example.com',
      });
    });

    it('should throw if REPLAY_LAB_API_KEY is missing', () => {
      vi.stubEnv('REPLAY_LAB_API_KEY', undefined);
      expect(() => getConfig()).toThrow('REPLAY_LAB_API_KEY');
    });

    it('should throw if REPLAY_LAB_BASE_URL is missing', () => {
      vi.stubEnv('REPLAY_LAB_BASE_URL', undefined);
      expect(() => getConfig()).toThrow('REPLAY_LAB_BASE_URL');
    });
  });

  describe('replayLabFetch', () => {
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

    it('should make request with x-api-key header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      await replayLabFetch<{ data: string }>('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
          }),
        })
      );
    });

    it('should return parsed JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      const result = await replayLabFetch<{ data: string }>('/test');

      expect(result).toEqual({ data: 'test' });
    });

    it('should throw on non-ok response with status and body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Resource not found',
      });

      await expect(replayLabFetch('/test')).rejects.toThrow(
        'Replay Lab API error (404): Resource not found'
      );
    });
  });
});

describe('Replay Lab Charts', () => {
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

  describe('getSignedChartUrl', () => {
    it('should call correct endpoint with auth header', async () => {
      const params: ChartParams = {
        symbolId: 'COINBASE_SPOT_ETH_USD',
        timeframe: '1m',
        from: new Date('2025-12-22T14:00:00Z'),
        to: new Date('2025-12-22T15:00:00Z'),
        layers: 'candles,sma',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: 'https://signed-url.example.com',
          expiresAt: '2025-12-22T16:00:00Z',
        }),
      });

      const url = await getSignedChartUrl(params);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.example.com/api/signed-url',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'content-type': 'application/json',
          }),
          body: expect.stringContaining('COINBASE_SPOT_ETH_USD'),
        })
      );
      expect(url).toBe('https://signed-url.example.com');
    });

    it('should construct correct chart path in request body', async () => {
      const params: ChartParams = {
        symbolId: 'COINBASE_SPOT_ETH_USD',
        timeframe: '1h',
        from: new Date('2025-12-22T14:00:00Z'),
        to: new Date('2025-12-22T15:00:00Z'),
        layers: 'candles,bb',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: 'https://signed-url.example.com',
          expiresAt: '2025-12-22T16:00:00Z',
        }),
      });

      await getSignedChartUrl(params);

      const callBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body ?? '{}');
      expect(callBody.path).toContain('COINBASE_SPOT_ETH_USD');
      expect(callBody.path).toContain('1h');
      expect(callBody.path).toContain('candles,bb');
      expect(callBody.expiresIn).toBe(3600);
    });
  });

  describe('getForecastingCharts', () => {
    it('should fetch two chart types in parallel (4h/5m and 24h/15m)', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const currentTime = new Date('2025-12-22T14:00:00Z');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            url: 'https://chart-4h-5m.example.com',
            expiresAt: '2025-12-22T16:00:00Z',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            url: 'https://chart-24h-15m.example.com',
            expiresAt: '2025-12-22T16:00:00Z',
          }),
        });

      const result = await getForecastingCharts(symbolId, currentTime);

      expect(result).toEqual({
        chart4h5m: 'https://chart-4h-5m.example.com',
        chart24h15m: 'https://chart-24h-15m.example.com',
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe('Replay Lab Orderbook', () => {
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

  describe('getOrderbookSnapshot', () => {
    it('should fetch from replay endpoint with nearest=true', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const at = new Date('2025-12-22T14:00:00Z');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          symbol_id: 'COINBASE_SPOT_ETH_USD',
          from: '2025-12-22T14:00:00Z',
          to: '2025-12-22T14:00:00Z',
          observations: [
            {
              timestamp: '2025-12-22T14:00:00Z',
              ohlcv: {
                open: 3500,
                high: 3510,
                low: 3495,
                close: 3505,
                volume: 1000,
              },
              orderbook: {
                mid_price: 3500.5,
                spread: 0.5,
                spread_bps: 1.43,
                imbalance: 0.15,
                bid_depth: 100000,
                ask_depth: 85000,
              },
            },
          ],
        }),
      });

      const snapshot = await getOrderbookSnapshot(symbolId, at);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/replay/COINBASE_SPOT_ETH_USD?from='),
        expect.anything()
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('&to='),
        expect.anything()
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('nearest=true'),
        expect.anything()
      );
      expect(snapshot).toEqual({
        timestamp: '2025-12-22T14:00:00Z',
        mid_price: 3500.5,
        spread: 0.5,
        spread_bps: 1.43,
        imbalance: 0.15,
        bid_depth: 100000,
        ask_depth: 85000,
      });
    });

    it('should throw if no observations returned', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          symbol_id: 'COINBASE_SPOT_ETH_USD',
          from: '2025-12-22T13:00:00Z',
          to: '2025-12-22T14:00:00Z',
          observations: [],
        }),
      });

      await expect(
        getOrderbookSnapshot('COINBASE_SPOT_ETH_USD', new Date())
      ).rejects.toThrow('No replay data found');
    });
  });

  describe('formatOrderbookForPrompt', () => {
    it('should format snapshot with dollar sign and bps', () => {
      const snapshot: OrderbookSnapshot = {
        timestamp: '2025-12-22T14:00:00Z',
        mid_price: 3500.5,
        spread: 0.5,
        spread_bps: 1.43,
        imbalance: 0.15,
        bid_depth: 100000,
        ask_depth: 85000,
      };

      const formatted = formatOrderbookForPrompt(snapshot);

      expect(formatted).toContain('$3500.50');
      expect(formatted).toContain('1.43 bps');
    });

    it('should indicate buy pressure for positive imbalance', () => {
      const snapshot: OrderbookSnapshot = {
        timestamp: '2025-12-22T14:00:00Z',
        mid_price: 3500.5,
        spread: 0.5,
        spread_bps: 1.43,
        imbalance: 0.15,
        bid_depth: 100000,
        ask_depth: 85000,
      };

      const formatted = formatOrderbookForPrompt(snapshot);

      expect(formatted).toContain('buy');
    });

    it('should indicate sell pressure for negative imbalance', () => {
      const snapshot: OrderbookSnapshot = {
        timestamp: '2025-12-22T14:00:00Z',
        mid_price: 3500.5,
        spread: 0.5,
        spread_bps: 1.43,
        imbalance: -0.15,
        bid_depth: 85000,
        ask_depth: 100000,
      };

      const formatted = formatOrderbookForPrompt(snapshot);

      expect(formatted).toContain('sell');
    });
  });
});

describe('Replay Lab Annotations', () => {
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

  describe('CONTRACT_IDS', () => {
    it('should have exactly 9 contract IDs', () => {
      expect(CONTRACT_IDS).toHaveLength(9);
    });

    it('should include expected contract IDs', () => {
      expect(CONTRACT_IDS).toContain('dump-simple-15m-1pct');
      expect(CONTRACT_IDS).toContain('dump-simple-15m-3pct');
      expect(CONTRACT_IDS).toContain('dump-simple-15m-5pct');
      expect(CONTRACT_IDS).toContain('dump-simple-1h-0.5pct');
      expect(CONTRACT_IDS).toContain('dump-simple-1h-1pct');
      expect(CONTRACT_IDS).toContain('dump-vol-adjusted-15m-z2');
      expect(CONTRACT_IDS).toContain('dump-vol-adjusted-1h-z2');
      expect(CONTRACT_IDS).toContain('dump-drawdown-1pct');
      expect(CONTRACT_IDS).toContain('dump-drawdown-3pct');
    });
  });

  describe('getGroundTruthBatch', () => {
    it('should fetch all contracts in single batch request', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const predictionTime = new Date('2025-12-22T14:00:00Z');
      const predictionEndTime = new Date('2025-12-22T15:00:00Z');

      // Mock single batch response with all contracts
      const batchResponse: Record<string, { timestamp: string }[]> = {};
      for (const contractId of CONTRACT_IDS) {
        batchResponse[contractId] = [];
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => batchResponse,
      });

      await getGroundTruthBatch(symbolId, predictionTime, predictionEndTime);

      // Should only make one request with sources= parameter
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sources='),
        expect.anything()
      );
    });

    it('should return true for contracts with annotations', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const predictionTime = new Date('2025-12-22T14:00:00Z');
      const predictionEndTime = new Date('2025-12-22T15:00:00Z');

      // Batch response: first contract has annotation, rest are empty
      const batchResponse: Record<string, { timestamp: string }[]> = {};
      for (const contractId of CONTRACT_IDS) {
        batchResponse[contractId] = contractId === 'dump-simple-15m-1pct'
          ? [{ timestamp: '2025-12-22T14:30:00Z' }]
          : [];
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => batchResponse,
      });

      const result = await getGroundTruthBatch(
        symbolId,
        predictionTime,
        predictionEndTime
      );

      expect(result['dump-simple-15m-1pct']).toBe(true);
      expect(result['dump-simple-15m-3pct']).toBe(false);
    });

    it('should fetch with correct query parameters', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const predictionTime = new Date('2025-12-22T14:00:00Z');
      const predictionEndTime = new Date('2025-12-22T15:00:00Z');

      const batchResponse: Record<string, { timestamp: string }[]> = {};
      for (const contractId of CONTRACT_IDS) {
        batchResponse[contractId] = [];
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => batchResponse,
      });

      await getGroundTruthBatch(symbolId, predictionTime, predictionEndTime);

      const callUrl = mockFetch.mock.calls[0]?.[0] ?? '';
      expect(callUrl).toContain('COINBASE_SPOT_ETH_USD');
      expect(callUrl).toContain('sources=');
      expect(callUrl).toContain('from=');
      expect(callUrl).toContain('to=');
      // Verify all contract IDs are in sources parameter
      for (const contractId of CONTRACT_IDS) {
        expect(callUrl).toContain(contractId);
      }
    });
  });
});
