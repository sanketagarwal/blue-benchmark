import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getLocalExtremaAnnotations } from '../src/replay-lab/annotations.js';
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

describe('annotations - getLocalExtremaAnnotations edge cases and API', () => {
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

  describe('edge cases', () => {
    it('handles empty annotations array from API', async () => {
      // Both stored and compute return empty
      vi.mocked(client.replayLabFetch).mockResolvedValue({
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
      expect(result).toEqual([]);
    });

    it('handles partial matches - method matches but params do not', async () => {
      // Stored annotations have L=5 (doesn't match L=3)
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: symbolId,
        annotations: [
          createMockApiAnnotation({
            id: 'ann-1',
            method: 'fractal',
            candleTimeframe: '1m',
            params: { L: 5 },
          }),
        ],
      });
      // Compute returns empty
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

    it('handles partial matches - method and params match but candleTimeframe does not', async () => {
      // Stored annotations have 5m (doesn't match 1m)
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: symbolId,
        annotations: [
          createMockApiAnnotation({
            id: 'ann-1',
            method: 'fractal',
            candleTimeframe: '5m',
            params: { L: 3 },
          }),
        ],
      });
      // Compute returns empty
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

    it('handles annotations without params field', async () => {
      // Raw API format without params field
      const annotationWithoutParams: RawApiAnnotation = {
        id: 'ann-1',
        time_start: '2025-01-01T00:05:00Z',
        time_end: null,
        type: 'local_extrema',
        method: 'fractal',  // TOP LEVEL
        schema_version: '1.0',
        payload: {
          kind: 'bottom',
          price: 95000,
          candleTimeframe: '1m',
          // params is undefined
        },
        source: 'fractal',
      };

      // Stored annotations return data without params
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: symbolId,
        annotations: [annotationWithoutParams],
      });
      // Compute returns empty
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

      // Should not match because params.L is undefined
      expect(result).toHaveLength(0);
    });

    it('handles annotations without method field', async () => {
      // Raw API format without method field (method is now top-level, so it's omitted there)
      const annotationWithoutMethod: RawApiAnnotation = {
        id: 'ann-1',
        time_start: '2025-01-01T00:05:00Z',
        time_end: null,
        type: 'local_extrema',
        // method is undefined (at top level)
        schema_version: '1.0',
        payload: {
          kind: 'bottom',
          price: 95000,
          candleTimeframe: '1m',
          params: { L: 3 },
        },
        source: 'fractal',
      };

      // Stored annotations return data without method
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: symbolId,
        annotations: [annotationWithoutMethod],
      });
      // Compute returns empty
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

      // Should not match because method is undefined
      expect(result).toHaveLength(0);
    });

    it('handles annotations without candleTimeframe field', async () => {
      // Raw API format without candleTimeframe field
      const annotationWithoutTimeframe: RawApiAnnotation = {
        id: 'ann-1',
        time_start: '2025-01-01T00:05:00Z',
        time_end: null,
        type: 'local_extrema',
        method: 'fractal',  // TOP LEVEL
        schema_version: '1.0',
        payload: {
          kind: 'bottom',
          price: 95000,
          // candleTimeframe is undefined
          params: { L: 3 },
        },
        source: 'fractal',
      };

      // Stored annotations return data without candleTimeframe
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: symbolId,
        annotations: [annotationWithoutTimeframe],
      });
      // Compute returns empty
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

      // Should not match because candleTimeframe is undefined
      expect(result).toHaveLength(0);
    });

    it('returns multiple matching annotations', async () => {
      const mockResponse = {
        symbol_id: symbolId,
        annotations: [
          createMockApiAnnotation({
            id: 'ann-1',
            kind: 'bottom',
            method: 'fractal',
            candleTimeframe: '1m',
            params: { L: 3 },
          }),
          createMockApiAnnotation({
            id: 'ann-2',
            kind: 'top',
            method: 'fractal',
            candleTimeframe: '1m',
            params: { L: 3 },
          }),
          createMockApiAnnotation({
            id: 'ann-3',
            kind: 'bottom',
            method: 'fractal',
            candleTimeframe: '1m',
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

      expect(result).toHaveLength(3);
    });
  });

  describe('API query construction', () => {
    it('constructs correct stored annotations API query with type and time parameters', async () => {
      // Return matching annotation so it doesn't fallback to compute
      const mockResponse = {
        symbol_id: symbolId,
        annotations: [createMockApiAnnotation({ method: 'fractal', params: { L: 3 } })],
      };

      vi.mocked(client.replayLabFetch).mockResolvedValue(mockResponse);

      await getLocalExtremaAnnotations(
        symbolId,
        'fractal',
        { L: 3, candleTimeframe: '1m' },
        from,
        to,
        availableAt
      );

      // Only stored annotations endpoint should be called
      expect(client.replayLabFetch).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(client.replayLabFetch).mock.calls[0]?.[0] as string;

      // Verify query contains required parameters
      expect(callArg).toContain(`/api/annotations/${symbolId}`);
      expect(callArg).toContain('type=local_extrema');
      expect(callArg).toContain('from=2025-01-01T00%3A00%3A00.000Z');
      expect(callArg).toContain('to=2025-01-01T00%3A15%3A00.000Z');
      expect(callArg).toContain('availableAt=2025-01-01T00%3A15%3A00.000Z');
    });

    it('falls back to compute endpoint when stored annotations return empty', async () => {
      // Return empty from stored annotations
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: symbolId,
        annotations: [],
      });
      // Return data from compute endpoint
      vi.mocked(client.replayLabFetch).mockResolvedValueOnce({
        symbol_id: symbolId,
        annotations: [createMockApiAnnotation({ method: 'fractal', params: { L: 3 } })],
      });

      const result = await getLocalExtremaAnnotations(
        symbolId,
        'fractal',
        { L: 3, candleTimeframe: '1m' },
        from,
        to,
        availableAt
      );

      // Both endpoints should be called
      expect(client.replayLabFetch).toHaveBeenCalledTimes(2);
      // First call is stored annotations
      expect(vi.mocked(client.replayLabFetch).mock.calls[0]?.[0]).toContain('availableAt=');
      // Second call is compute endpoint
      expect(vi.mocked(client.replayLabFetch).mock.calls[1]?.[0]).toContain('/compute');
      // Should return the computed data
      expect(result).toHaveLength(1);
    });

    it('includes method parameter in stored annotations API query (BUG-012 fixed)', async () => {
      const mockResponse = {
        symbol_id: symbolId,
        annotations: [createMockApiAnnotation({ method: 'fractal', params: { L: 3 } })],
      };

      vi.mocked(client.replayLabFetch).mockResolvedValue(mockResponse);

      await getLocalExtremaAnnotations(
        symbolId,
        'fractal',
        { L: 3, candleTimeframe: '1m' },
        from,
        to,
        availableAt
      );

      const callArg = vi.mocked(client.replayLabFetch).mock.calls[0]?.[0] as string;
      expect(callArg).toContain('method=fractal');
    });

    it('does NOT include L parameter in stored annotations API query (filtered client-side)', async () => {
      const mockResponse = {
        symbol_id: symbolId,
        annotations: [createMockApiAnnotation({ method: 'fractal', params: { L: 3 } })],
      };

      vi.mocked(client.replayLabFetch).mockResolvedValue(mockResponse);

      await getLocalExtremaAnnotations(
        symbolId,
        'fractal',
        { L: 3, candleTimeframe: '1m' },
        from,
        to,
        availableAt
      );

      const callArg = vi.mocked(client.replayLabFetch).mock.calls[0]?.[0] as string;
      expect(callArg).not.toContain('L=');
    });

    it('does NOT include deviationPct parameter in stored annotations API query (filtered client-side)', async () => {
      const mockResponse = {
        symbol_id: symbolId,
        annotations: [createMockApiAnnotation({ method: 'zigzag', candleTimeframe: '15m', params: { deviationPct: 0.025 } })],
      };

      vi.mocked(client.replayLabFetch).mockResolvedValue(mockResponse);

      await getLocalExtremaAnnotations(
        symbolId,
        'zigzag',
        { deviationPct: 0.025, candleTimeframe: '15m' },
        from,
        to,
        availableAt
      );

      const callArg = vi.mocked(client.replayLabFetch).mock.calls[0]?.[0] as string;
      expect(callArg).not.toContain('deviationPct=');
    });
  });
});
