import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getLocalExtremaAnnotations, filterPivotLows, type LocalExtremaAnnotation } from '../src/replay-lab/annotations.js';
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
    it('fetches local_extrema annotations with availableAt filter', async () => {
      const mockResponse = {
        symbol_id: 'COINBASE_SPOT_BTC_USD',
        annotations: [
          {
            id: 'ann-1',
            time_start: '2025-01-01T00:05:00Z',
            time_end: null,
            type: 'local_extrema',
            schema_version: '1.0',
            payload: { direction: 'low', price: 95000 },
            source: 'fractal',
          },
        ],
      };

      vi.mocked(client.replayLabFetch).mockResolvedValue(mockResponse);

      const from = new Date('2025-01-01T00:00:00Z');
      const to = new Date('2025-01-01T00:15:00Z');
      const availableAt = new Date('2025-01-01T00:15:00Z');

      const result = await getLocalExtremaAnnotations(
        'COINBASE_SPOT_BTC_USD',
        'fractal',
        { L: 3, candleTimeframe: '1m' },
        from,
        to,
        availableAt
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.payload.direction).toBe('low');
      expect(client.replayLabFetch).toHaveBeenCalledWith(
        expect.stringContaining('type=local_extrema')
      );
      expect(client.replayLabFetch).toHaveBeenCalledWith(
        expect.stringContaining('availableAt=')
      );
    });

    it('includes method-specific params in query', async () => {
      vi.mocked(client.replayLabFetch).mockResolvedValue({ symbol_id: 'X', annotations: [] });

      await getLocalExtremaAnnotations(
        'COINBASE_SPOT_BTC_USD',
        'zigzag',
        { deviationPct: 0.025, candleTimeframe: '15m' },
        new Date(),
        new Date(),
        new Date()
      );

      expect(client.replayLabFetch).toHaveBeenCalledWith(
        expect.stringContaining('deviationPct=0.025')
      );
    });
  });

  describe('filterPivotLows', () => {
    it('filters to only pivot LOWs', () => {
      const annotations: LocalExtremaAnnotation[] = [
        { id: '1', time_start: '2025-01-01T00:05:00Z', time_end: null, type: 'local_extrema', schema_version: '1.0', payload: { direction: 'low' }, source: 'fractal' },
        { id: '2', time_start: '2025-01-01T00:10:00Z', time_end: null, type: 'local_extrema', schema_version: '1.0', payload: { direction: 'high' }, source: 'fractal' },
      ];

      const lows = filterPivotLows(annotations);

      expect(lows).toHaveLength(1);
      expect(lows[0]?.payload.direction).toBe('low');
    });
  });
});
