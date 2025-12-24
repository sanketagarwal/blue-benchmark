import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getConfig, replayLabFetch } from '../src/replay-lab/client';
import {
  buildChartUrl,
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
  beforeEach(() => {
    vi.stubEnv('REPLAY_LAB_API_KEY', 'test-api-key');
    vi.stubEnv('REPLAY_LAB_BASE_URL', 'https://test.example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('buildChartUrl', () => {
    it('should build correct URL with all parameters', () => {
      const params: ChartParams = {
        symbolId: 'COINBASE_SPOT_ETH_USD',
        timeframe: '5m',
        from: new Date('2025-12-22T10:00:00Z'),
        to: new Date('2025-12-22T14:00:00Z'),
        layers: 'candles,sma:20',
        width: 1200,
        height: 800,
      };

      const url = buildChartUrl(params);

      expect(url).toContain('https://test.example.com/api/charts/COINBASE_SPOT_ETH_USD/image');
      expect(url).toContain('timeframe=5m');
      expect(url).toContain('from=2025-12-22T10%3A00%3A00.000Z');
      expect(url).toContain('to=2025-12-22T14%3A00%3A00.000Z');
      expect(url).toContain('layers=candles%2Csma%3A20');
      expect(url).toContain('width=1200');
      expect(url).toContain('height=800');
    });

    it('should use default width and height', () => {
      const params: ChartParams = {
        symbolId: 'COINBASE_SPOT_ETH_USD',
        timeframe: '1h',
        from: new Date('2025-12-22T10:00:00Z'),
        to: new Date('2025-12-22T14:00:00Z'),
        layers: 'candles',
      };

      const url = buildChartUrl(params);

      expect(url).toContain('width=1200');
      expect(url).toContain('height=800');
    });
  });

  describe('getForecastingCharts', () => {
    it('should return two chart URLs with correct timeframes', () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const currentTime = new Date('2025-12-22T14:00:00Z');

      const result = getForecastingCharts(symbolId, currentTime);

      // 4h/5m chart
      expect(result.chart4h5m).toContain('timeframe=5m');
      expect(result.chart4h5m).toContain('from=2025-12-22T10%3A00%3A00.000Z');
      expect(result.chart4h5m).toContain('to=2025-12-22T14%3A00%3A00.000Z');

      // 24h/15m chart
      expect(result.chart24h15m).toContain('timeframe=15m');
      expect(result.chart24h15m).toContain('from=2025-12-21T14%3A00%3A00.000Z');
      expect(result.chart24h15m).toContain('to=2025-12-22T14%3A00%3A00.000Z');
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
    it('should fetch from orderbook endpoint with 15-minute lookback window', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const at = new Date('2025-12-22T14:00:00Z');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          symbol_id: 'COINBASE_SPOT_ETH_USD',
          snapshots: [
            {
              timestamp: '2025-12-22T13:55:00Z',
              mid_price: 3500.5,
              spread: 0.5,
              spread_bps: 1.43,
              imbalance: 0.15,
              bid_depth: 100000,
              ask_depth: 85000,
            },
          ],
        }),
      });

      const snapshot = await getOrderbookSnapshot(symbolId, at);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orderbook/COINBASE_SPOT_ETH_USD?from='),
        expect.anything()
      );
      // Should use 15-minute lookback (from 13:45 to 14:00)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('from=2025-12-22T13:45:00.000Z'),
        expect.anything()
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('to=2025-12-22T14:00:00.000Z'),
        expect.anything()
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=1'),
        expect.anything()
      );
      expect(snapshot).toEqual({
        timestamp: '2025-12-22T13:55:00Z',
        mid_price: 3500.5,
        spread: 0.5,
        spread_bps: 1.43,
        imbalance: 0.15,
        bid_depth: 100000,
        ask_depth: 85000,
      });
    });

    it('should throw if no snapshots returned', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          symbol_id: 'COINBASE_SPOT_ETH_USD',
          snapshots: [],
        }),
      });

      await expect(
        getOrderbookSnapshot('COINBASE_SPOT_ETH_USD', new Date())
      ).rejects.toThrow('No orderbook data found');
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
    it('should fetch all contracts in parallel', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const predictionTime = new Date('2025-12-22T14:00:00Z');
      const predictionEndTime = new Date('2025-12-22T15:00:00Z');

      // Mock response for each contract (9 calls)
      for (let i = 0; i < CONTRACT_IDS.length; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            symbol_id: 'COINBASE_SPOT_ETH_USD',
            annotations: [],
          }),
        });
      }

      await getGroundTruthBatch(symbolId, predictionTime, predictionEndTime);

      // Should make one request per contract
      expect(mockFetch).toHaveBeenCalledTimes(CONTRACT_IDS.length);
    });

    it('should return true for contracts with annotations', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const predictionTime = new Date('2025-12-22T14:00:00Z');
      const predictionEndTime = new Date('2025-12-22T15:00:00Z');

      // Mock responses: first contract has annotation, rest are empty
      for (const contractId of CONTRACT_IDS) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            symbol_id: 'COINBASE_SPOT_ETH_USD',
            annotations: contractId === 'dump-simple-15m-1pct'
              ? [{ id: '123', time_start: '2025-12-22T14:30:00Z', type: 'dump_event', source: contractId }]
              : [],
          }),
        });
      }

      const result = await getGroundTruthBatch(
        symbolId,
        predictionTime,
        predictionEndTime
      );

      expect(result['dump-simple-15m-1pct']).toBe(true);
      expect(result['dump-simple-15m-3pct']).toBe(false);
    });

    it('should use source filter for each contract', async () => {
      const symbolId = 'COINBASE_SPOT_ETH_USD';
      const predictionTime = new Date('2025-12-22T14:00:00Z');
      const predictionEndTime = new Date('2025-12-22T15:00:00Z');

      for (let i = 0; i < CONTRACT_IDS.length; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            symbol_id: 'COINBASE_SPOT_ETH_USD',
            annotations: [],
          }),
        });
      }

      await getGroundTruthBatch(symbolId, predictionTime, predictionEndTime);

      // Verify each call uses source= (not sources=)
      for (let i = 0; i < CONTRACT_IDS.length; i++) {
        const callUrl = mockFetch.mock.calls[i]?.[0] ?? '';
        expect(callUrl).toContain('source=');
        expect(callUrl).toContain('from=');
        expect(callUrl).toContain('to=');
        expect(callUrl).not.toContain('sources=');
      }
    });
  });
});
