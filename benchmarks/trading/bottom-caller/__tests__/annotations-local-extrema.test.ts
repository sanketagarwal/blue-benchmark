import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getLocalExtremaAnnotations,
  type LocalExtremaAnnotation,
} from '../src/replay-lab/annotations.js';
import * as client from '../src/replay-lab/client.js';

vi.mock('../src/replay-lab/client.js');

// Raw API annotation format - uses 'kind' instead of 'direction'
// Note: 'method' is now a top-level field (not in payload)
interface RawApiAnnotation {
  id: string;
  time_start: string;
  time_end: string | null;
  type: string;
  method?: 'fractal' | 'zigzag';  // TOP LEVEL
  schema_version: string;
  payload: {
    kind: 'bottom' | 'top';
    price?: number;
    candleTimeframe?: string;
    params?: { L?: number; deviationPct?: number };
  };
  source: string;
}

// Helper to create mock annotations in RAW API format (with 'kind')
// The function transforms 'kind' -> 'direction' internally
// Note: 'method' is now at top level, not in payload
function createMockApiAnnotation(overrides: {
  id?: string;
  kind?: 'bottom' | 'top';
  method?: 'fractal' | 'zigzag';
  candleTimeframe?: string;
  params?: { L?: number; deviationPct?: number };
  price?: number;
}): RawApiAnnotation {
  return {
    id: overrides.id ?? 'ann-1',
    time_start: '2025-01-01T00:05:00Z',
    time_end: null,
    type: 'local_extrema',
    method: overrides.method ?? 'fractal',  // TOP LEVEL
    schema_version: '1.0',
    payload: {
      kind: overrides.kind ?? 'bottom',
      price: overrides.price ?? 95000,
      candleTimeframe: overrides.candleTimeframe ?? '1m',
      params: overrides.params ?? { L: 3 },
    },
    source: overrides.method ?? 'fractal',
  };
}

describe('annotations - getLocalExtremaAnnotations filtering', () => {
  const symbolId = 'COINBASE_SPOT_BTC_USD';
  const from = new Date('2025-01-01T00:00:00Z');
  const to = new Date('2025-01-01T00:15:00Z');
  const availableAt = new Date('2025-01-01T00:15:00Z');

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('method filtering', () => {
    it('filters correctly by fractal method', async () => {
      const mockResponse = {
        symbol_id: symbolId,
        annotations: [
          createMockApiAnnotation({ id: 'ann-1', method: 'fractal', params: { L: 3 } }),
          createMockApiAnnotation({ id: 'ann-2', method: 'zigzag', params: { deviationPct: 0.025 } }),
        ],
      };

      vi.mocked(client.replayLabFetch).mockResolvedValue(mockResponse);

      const result = await getLocalExtremaAnnotations(
        symbolId,
        'fractal',
        { L: 3, candleTimeframe: '1m' },
        from,
        to,
        availableAt
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.method).toBe('fractal');
    });

    it('filters correctly by zigzag method', async () => {
      const mockResponse = {
        symbol_id: symbolId,
        annotations: [
          createMockApiAnnotation({
            id: 'ann-1',
            method: 'fractal',
            candleTimeframe: '15m',
            params: { L: 3 },
          }),
          createMockApiAnnotation({
            id: 'ann-2',
            method: 'zigzag',
            candleTimeframe: '15m',
            params: { deviationPct: 0.025 },
          }),
        ],
      };

      vi.mocked(client.replayLabFetch).mockResolvedValue(mockResponse);

      const result = await getLocalExtremaAnnotations(
        symbolId,
        'zigzag',
        { deviationPct: 0.025, candleTimeframe: '15m' },
        from,
        to,
        availableAt
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.method).toBe('zigzag');
    });

    it('returns empty array when no annotations match the method', async () => {
      // Stored annotations return zigzag (doesn't match requested fractal)
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: symbolId,
        annotations: [
          createMockApiAnnotation({ id: 'ann-1', method: 'zigzag', params: { deviationPct: 0.025 } }),
          createMockApiAnnotation({ id: 'ann-2', method: 'zigzag', params: { deviationPct: 0.05 } }),
        ],
      });
      // Compute endpoint returns empty (server-side filtered to no fractal data)
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: symbolId,
        annotations: [],
      });

      const result = await getLocalExtremaAnnotations(
        symbolId,
        'fractal',
        { L: 3, candleTimeframe: '1m' },
        from,
        to,
        availableAt
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('candleTimeframe filtering', () => {
    it('filters correctly by candleTimeframe 1m', async () => {
      const mockResponse = {
        symbol_id: symbolId,
        annotations: [
          createMockApiAnnotation({
            id: 'ann-1',
            method: 'fractal',
            candleTimeframe: '1m',
            params: { L: 3 },
          }),
          createMockApiAnnotation({
            id: 'ann-2',
            method: 'fractal',
            candleTimeframe: '5m',
            params: { L: 3 },
          }),
          createMockApiAnnotation({
            id: 'ann-3',
            method: 'fractal',
            candleTimeframe: '15m',
            params: { L: 3 },
          }),
        ],
      };

      vi.mocked(client.replayLabFetch).mockResolvedValue(mockResponse);

      const result = await getLocalExtremaAnnotations(
        symbolId,
        'fractal',
        { L: 3, candleTimeframe: '1m' },
        from,
        to,
        availableAt
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.payload.candleTimeframe).toBe('1m');
    });

    it('filters correctly by candleTimeframe 5m', async () => {
      const mockResponse = {
        symbol_id: symbolId,
        annotations: [
          createMockApiAnnotation({
            id: 'ann-1',
            method: 'fractal',
            candleTimeframe: '1m',
            params: { L: 3 },
          }),
          createMockApiAnnotation({
            id: 'ann-2',
            method: 'fractal',
            candleTimeframe: '5m',
            params: { L: 3 },
          }),
        ],
      };

      vi.mocked(client.replayLabFetch).mockResolvedValue(mockResponse);

      const result = await getLocalExtremaAnnotations(
        symbolId,
        'fractal',
        { L: 3, candleTimeframe: '5m' },
        from,
        to,
        availableAt
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.payload.candleTimeframe).toBe('5m');
    });

    it('filters correctly by candleTimeframe 15m', async () => {
      const mockResponse = {
        symbol_id: symbolId,
        annotations: [
          createMockApiAnnotation({
            id: 'ann-1',
            method: 'zigzag',
            candleTimeframe: '1m',
            params: { deviationPct: 0.025 },
          }),
          createMockApiAnnotation({
            id: 'ann-2',
            method: 'zigzag',
            candleTimeframe: '15m',
            params: { deviationPct: 0.025 },
          }),
        ],
      };

      vi.mocked(client.replayLabFetch).mockResolvedValue(mockResponse);

      const result = await getLocalExtremaAnnotations(
        symbolId,
        'zigzag',
        { deviationPct: 0.025, candleTimeframe: '15m' },
        from,
        to,
        availableAt
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.payload.candleTimeframe).toBe('15m');
    });

    it('returns empty array when no annotations match the candleTimeframe', async () => {
      // Stored annotations return 1m and 5m (doesn't match requested 1h)
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: symbolId,
        annotations: [
          createMockApiAnnotation({
            id: 'ann-1',
            method: 'fractal',
            candleTimeframe: '1m',
            params: { L: 3 },
          }),
          createMockApiAnnotation({
            id: 'ann-2',
            method: 'fractal',
            candleTimeframe: '5m',
            params: { L: 3 },
          }),
        ],
      });
      // Compute endpoint returns empty (no 1h data available)
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: symbolId,
        annotations: [],
      });

      const result = await getLocalExtremaAnnotations(
        symbolId,
        'fractal',
        { L: 3, candleTimeframe: '1h' },
        from,
        to,
        availableAt
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('fractal params filtering (L parameter)', () => {
    it('filters correctly by L=3', async () => {
      const mockResponse = {
        symbol_id: symbolId,
        annotations: [
          createMockApiAnnotation({
            id: 'ann-1',
            method: 'fractal',
            candleTimeframe: '1m',
            params: { L: 3 },
          }),
          createMockApiAnnotation({
            id: 'ann-2',
            method: 'fractal',
            candleTimeframe: '1m',
            params: { L: 5 },
          }),
          createMockApiAnnotation({
            id: 'ann-3',
            method: 'fractal',
            candleTimeframe: '1m',
            params: { L: 7 },
          }),
        ],
      };

      vi.mocked(client.replayLabFetch).mockResolvedValue(mockResponse);

      const result = await getLocalExtremaAnnotations(
        symbolId,
        'fractal',
        { L: 3, candleTimeframe: '1m' },
        from,
        to,
        availableAt
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.payload.params?.L).toBe(3);
    });

    it('filters correctly by L=5', async () => {
      const mockResponse = {
        symbol_id: symbolId,
        annotations: [
          createMockApiAnnotation({
            id: 'ann-1',
            method: 'fractal',
            candleTimeframe: '1m',
            params: { L: 3 },
          }),
          createMockApiAnnotation({
            id: 'ann-2',
            method: 'fractal',
            candleTimeframe: '1m',
            params: { L: 5 },
          }),
        ],
      };

      vi.mocked(client.replayLabFetch).mockResolvedValue(mockResponse);

      const result = await getLocalExtremaAnnotations(
        symbolId,
        'fractal',
        { L: 5, candleTimeframe: '1m' },
        from,
        to,
        availableAt
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.payload.params?.L).toBe(5);
    });

    it('returns empty array when no annotations match the L parameter', async () => {
      // Stored annotations return L=3 and L=5 (doesn't match requested L=10)
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: symbolId,
        annotations: [
          createMockApiAnnotation({
            id: 'ann-1',
            method: 'fractal',
            candleTimeframe: '1m',
            params: { L: 3 },
          }),
          createMockApiAnnotation({
            id: 'ann-2',
            method: 'fractal',
            candleTimeframe: '1m',
            params: { L: 5 },
          }),
        ],
      });
      // Compute endpoint returns empty (no L=10 data available)
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: symbolId,
        annotations: [],
      });

      const result = await getLocalExtremaAnnotations(
        symbolId,
        'fractal',
        { L: 10, candleTimeframe: '1m' },
        from,
        to,
        availableAt
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('zigzag params filtering (deviationPct parameter)', () => {
    it('filters correctly by deviationPct=0.025', async () => {
      const mockResponse = {
        symbol_id: symbolId,
        annotations: [
          createMockApiAnnotation({
            id: 'ann-1',
            method: 'zigzag',
            candleTimeframe: '15m',
            params: { deviationPct: 0.025 },
          }),
          createMockApiAnnotation({
            id: 'ann-2',
            method: 'zigzag',
            candleTimeframe: '15m',
            params: { deviationPct: 0.05 },
          }),
          createMockApiAnnotation({
            id: 'ann-3',
            method: 'zigzag',
            candleTimeframe: '15m',
            params: { deviationPct: 0.1 },
          }),
        ],
      };

      vi.mocked(client.replayLabFetch).mockResolvedValue(mockResponse);

      const result = await getLocalExtremaAnnotations(
        symbolId,
        'zigzag',
        { deviationPct: 0.025, candleTimeframe: '15m' },
        from,
        to,
        availableAt
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.payload.params?.deviationPct).toBe(0.025);
    });

    it('filters correctly by deviationPct=0.05', async () => {
      const mockResponse = {
        symbol_id: symbolId,
        annotations: [
          createMockApiAnnotation({
            id: 'ann-1',
            method: 'zigzag',
            candleTimeframe: '15m',
            params: { deviationPct: 0.025 },
          }),
          createMockApiAnnotation({
            id: 'ann-2',
            method: 'zigzag',
            candleTimeframe: '15m',
            params: { deviationPct: 0.05 },
          }),
        ],
      };

      vi.mocked(client.replayLabFetch).mockResolvedValue(mockResponse);

      const result = await getLocalExtremaAnnotations(
        symbolId,
        'zigzag',
        { deviationPct: 0.05, candleTimeframe: '15m' },
        from,
        to,
        availableAt
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.payload.params?.deviationPct).toBe(0.05);
    });

    it('returns empty array when no annotations match the deviationPct parameter', async () => {
      // Stored annotations return 0.025 and 0.05 (doesn't match requested 0.2)
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: symbolId,
        annotations: [
          createMockApiAnnotation({
            id: 'ann-1',
            method: 'zigzag',
            candleTimeframe: '15m',
            params: { deviationPct: 0.025 },
          }),
          createMockApiAnnotation({
            id: 'ann-2',
            method: 'zigzag',
            candleTimeframe: '15m',
            params: { deviationPct: 0.05 },
          }),
        ],
      });
      // Compute endpoint returns empty (no 0.2 data available)
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: symbolId,
        annotations: [],
      });

      const result = await getLocalExtremaAnnotations(
        symbolId,
        'zigzag',
        { deviationPct: 0.2, candleTimeframe: '15m' },
        from,
        to,
        availableAt
      );

      expect(result).toHaveLength(0);
    });
  });
});
