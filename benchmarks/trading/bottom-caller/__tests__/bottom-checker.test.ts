import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveBottomGroundTruth } from '../src/ground-truth/bottom-checker.js';
import * as annotations from '../src/replay-lab/annotations.js';

vi.mock('../src/replay-lab/annotations.js', async (importOriginal) => {
  const actual = await importOriginal<typeof annotations>();
  return {
    ...actual,
    getLocalExtremaAnnotations: vi.fn(),
  };
});

describe('bottom-checker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('resolveBottomGroundTruth', () => {
    it('returns label=1 when pivot LOW exists', async () => {
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

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z')
      );

      expect(result.hasStructuralBottom).toBe(true);
      expect(result.label).toBe(1);
    });

    it('returns label=0 when no pivot LOW exists', async () => {
      vi.mocked(annotations.getLocalExtremaAnnotations).mockResolvedValue([]);

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z')
      );

      expect(result.hasStructuralBottom).toBe(false);
      expect(result.label).toBe(0);
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

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z')
      );

      // 15m horizon = 15 * 60 * 1000 = 900000ms
      // Pivot at 7:30 = 7.5 * 60 * 1000 = 450000ms from start
      // Ratio = 450000 / 900000 = 0.5
      expect(result.timeToPivotRatio).toBeCloseTo(0.5, 2);
      expect(result.firstPivotAt).toEqual(new Date('2025-01-01T00:07:30Z'));
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

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z')
      );

      // HIGH pivot should be filtered out
      expect(result.hasStructuralBottom).toBe(false);
      expect(result.label).toBe(0);
    });

    it('picks earliest pivot when multiple exist', async () => {
      vi.mocked(annotations.getLocalExtremaAnnotations).mockResolvedValue([
        {
          id: '2',
          time_start: '2025-01-01T00:10:00Z',
          time_end: null,
          type: 'local_extrema',
          schema_version: '1.0',
          payload: { direction: 'low' },
          source: 'fractal',
        },
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

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z')
      );

      expect(result.hasStructuralBottom).toBe(true);
      // Should pick the earlier pivot at 00:05:00
      expect(result.firstPivotAt).toEqual(new Date('2025-01-01T00:05:00Z'));
      // 5 minutes / 15 minutes = 1/3 ≈ 0.333
      expect(result.timeToPivotRatio).toBeCloseTo(0.333, 2);
    });

    it('does not include timeToPivotRatio when no pivot exists', async () => {
      vi.mocked(annotations.getLocalExtremaAnnotations).mockResolvedValue([]);

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z')
      );

      expect(result.hasStructuralBottom).toBe(false);
      expect(result.timeToPivotRatio).toBeUndefined();
      expect(result.firstPivotAt).toBeUndefined();
    });
  });
});
