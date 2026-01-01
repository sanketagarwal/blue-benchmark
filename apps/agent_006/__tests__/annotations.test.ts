import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getLocalExtremaAnnotations,
  filterPivotLows,
  type LocalExtremaAnnotation,
} from '../src/replay-lab/annotations.js';
import * as client from '../src/replay-lab/client.js';

vi.mock('../src/replay-lab/client.js');

describe('annotations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getLocalExtremaAnnotations', () => {
    const symbolId = 'COINBASE_SPOT_BTC_USD';
    const from = new Date('2025-01-01T00:00:00Z');
    const to = new Date('2025-01-01T00:15:00Z');
    const availableAt = new Date('2025-01-01T00:15:00Z');

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

    // Helper to create expected output format (with 'direction')
    // Note: 'method' is at top level in the transformed output
    function createExpectedAnnotation(overrides: {
      id?: string;
      direction?: 'low' | 'high';
      method?: 'fractal' | 'zigzag';
      candleTimeframe?: string;
      params?: { L?: number; deviationPct?: number };
      price?: number;
    }): LocalExtremaAnnotation {
      return {
        id: overrides.id ?? 'ann-1',
        time_start: '2025-01-01T00:05:00Z',
        time_end: null,
        type: 'local_extrema',
        method: overrides.method ?? 'fractal',  // TOP LEVEL
        schema_version: '1.0',
        payload: {
          direction: overrides.direction ?? 'low',
          price: overrides.price ?? 95000,
          candleTimeframe: overrides.candleTimeframe ?? '1m',
          params: overrides.params ?? { L: 3 },
        },
        source: overrides.method ?? 'fractal',
      };
    }

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

  describe('filterPivotLows', () => {
    it('filters to only pivot LOWs', () => {
      const annotations: LocalExtremaAnnotation[] = [
        {
          id: '1',
          time_start: '2025-01-01T00:05:00Z',
          time_end: null,
          type: 'local_extrema',
          method: 'fractal',
          schema_version: '1.0',
          payload: { direction: 'low' },
          source: 'fractal',
        },
        {
          id: '2',
          time_start: '2025-01-01T00:10:00Z',
          time_end: null,
          type: 'local_extrema',
          method: 'fractal',
          schema_version: '1.0',
          payload: { direction: 'high' },
          source: 'fractal',
        },
      ];

      const lows = filterPivotLows(annotations);

      expect(lows).toHaveLength(1);
      expect(lows[0]?.payload.direction).toBe('low');
    });

    it('returns empty array when no LOWs exist', () => {
      const annotations: LocalExtremaAnnotation[] = [
        {
          id: '1',
          time_start: '2025-01-01T00:05:00Z',
          time_end: null,
          type: 'local_extrema',
          method: 'fractal',
          schema_version: '1.0',
          payload: { direction: 'high' },
          source: 'fractal',
        },
        {
          id: '2',
          time_start: '2025-01-01T00:10:00Z',
          time_end: null,
          type: 'local_extrema',
          method: 'fractal',
          schema_version: '1.0',
          payload: { direction: 'high' },
          source: 'fractal',
        },
      ];

      const lows = filterPivotLows(annotations);

      expect(lows).toHaveLength(0);
    });

    it('returns all annotations when all are LOWs', () => {
      const annotations: LocalExtremaAnnotation[] = [
        {
          id: '1',
          time_start: '2025-01-01T00:05:00Z',
          time_end: null,
          type: 'local_extrema',
          method: 'fractal',
          schema_version: '1.0',
          payload: { direction: 'low' },
          source: 'fractal',
        },
        {
          id: '2',
          time_start: '2025-01-01T00:10:00Z',
          time_end: null,
          type: 'local_extrema',
          method: 'zigzag',
          schema_version: '1.0',
          payload: { direction: 'low' },
          source: 'zigzag',
        },
        {
          id: '3',
          time_start: '2025-01-01T00:15:00Z',
          time_end: null,
          type: 'local_extrema',
          method: 'fractal',
          schema_version: '1.0',
          payload: { direction: 'low' },
          source: 'fractal',
        },
      ];

      const lows = filterPivotLows(annotations);

      expect(lows).toHaveLength(3);
      expect(lows.every((l) => l.payload.direction === 'low')).toBe(true);
    });

    it('handles empty input array', () => {
      const annotations: LocalExtremaAnnotation[] = [];

      const lows = filterPivotLows(annotations);

      expect(lows).toHaveLength(0);
      expect(lows).toEqual([]);
    });

    it('preserves all annotation properties when filtering', () => {
      const annotations: LocalExtremaAnnotation[] = [
        {
          id: 'test-id',
          time_start: '2025-01-01T00:05:00Z',
          time_end: '2025-01-01T00:10:00Z',
          type: 'local_extrema',
          method: 'fractal',  // TOP LEVEL
          schema_version: '2.0',
          payload: {
            direction: 'low',
            price: 95000,
            candleTimeframe: '1m',
            params: { L: 3 },
          },
          source: 'fractal',
        },
      ];

      const lows = filterPivotLows(annotations);

      expect(lows).toHaveLength(1);
      expect(lows[0]).toEqual(annotations[0]);
    });
  });
});
