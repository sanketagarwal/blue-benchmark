import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveBottomGroundTruth } from '../src/ground-truth/bottom-checker.js';
import * as annotations from '../src/replay-lab/annotations.js';

import type { BottomHoldAnnotation } from '../src/replay-lab/annotations.js';

vi.mock('../src/replay-lab/annotations.js', async (importOriginal) => {
  const actual = await importOriginal<typeof annotations>();
  return {
    ...actual,
    getBottomHoldAnnotations: vi.fn(),
  };
});

function createBottomHoldAnnotation(overrides: Partial<{
  id: string;
  time_start: string;
  drawdownFrac: number;
  maxDrawdownFrac: number;
  refLow: number;
  fwdLow: number;
}>): BottomHoldAnnotation {
  return {
    id: overrides.id ?? '1',
    time_start: overrides.time_start ?? '2025-01-01T00:05:00Z',
    time_end: null,
    type: 'bottom_event',
    method: 'bottom-hold',
    schema_version: '1.0',
    payload: {
      refLow: overrides.refLow ?? 99.5,
      fwdLow: overrides.fwdLow ?? 99.6,
      drawdownFrac: overrides.drawdownFrac ?? 0.0005,
      params: {
        horizonCandles: 3,
        lookbackCandles: 24,
        maxDrawdownFrac: overrides.maxDrawdownFrac ?? 0.001,
        candleTimeframe: '5m',
      },
    },
    source: 'fractal',
    created_at: '2025-01-01T00:00:00Z',
  };
}

describe('bottom-checker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('resolveBottomGroundTruth', () => {
    it('returns label=1 when bottom held (drawdown within threshold)', async () => {
      vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([
        createBottomHoldAnnotation({
          drawdownFrac: 0.0005,
          maxDrawdownFrac: 0.001,
        }),
      ]);

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z')
      );

      expect(result.hasStructuralBottom).toBe(true);
      expect(result.label).toBe(1);
    });

    it('returns label=0 when bottom did not hold (drawdown exceeds threshold)', async () => {
      vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([
        createBottomHoldAnnotation({
          drawdownFrac: 0.002,
          maxDrawdownFrac: 0.001,
        }),
      ]);

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z')
      );

      expect(result.hasStructuralBottom).toBe(false);
      expect(result.label).toBe(0);
    });

    it('returns label=0 when no annotations exist', async () => {
      vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([]);

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z')
      );

      expect(result.hasStructuralBottom).toBe(false);
      expect(result.label).toBe(0);
    });

    it('computes timeToPivotRatio when bottom held', async () => {
      vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([
        createBottomHoldAnnotation({
          time_start: '2025-01-01T00:07:30Z',
          drawdownFrac: 0.0005,
          maxDrawdownFrac: 0.001,
        }),
      ]);

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z')
      );

      expect(result.timeToPivotRatio).toBeCloseTo(0.5, 2);
      expect(result.firstPivotAt).toEqual(new Date('2025-01-01T00:07:30Z'));
    });

    it('filters to only held bottoms when multiple annotations exist', async () => {
      vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([
        createBottomHoldAnnotation({
          id: '1',
          time_start: '2025-01-01T00:05:00Z',
          drawdownFrac: 0.002,
          maxDrawdownFrac: 0.001,
        }),
        createBottomHoldAnnotation({
          id: '2',
          time_start: '2025-01-01T00:10:00Z',
          drawdownFrac: 0.0005,
          maxDrawdownFrac: 0.001,
        }),
      ]);

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z')
      );

      expect(result.hasStructuralBottom).toBe(true);
      expect(result.label).toBe(1);
      expect(result.firstPivotAt).toEqual(new Date('2025-01-01T00:10:00Z'));
    });

    it('picks earliest held bottom when multiple held bottoms exist', async () => {
      vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([
        createBottomHoldAnnotation({
          id: '2',
          time_start: '2025-01-01T00:10:00Z',
          drawdownFrac: 0.0005,
          maxDrawdownFrac: 0.001,
        }),
        createBottomHoldAnnotation({
          id: '1',
          time_start: '2025-01-01T00:05:00Z',
          drawdownFrac: 0.0003,
          maxDrawdownFrac: 0.001,
        }),
      ]);

      const result = await resolveBottomGroundTruth(
        'COINBASE_SPOT_BTC_USD',
        '15m',
        new Date('2025-01-01T00:00:00Z')
      );

      expect(result.hasStructuralBottom).toBe(true);
      expect(result.firstPivotAt).toEqual(new Date('2025-01-01T00:05:00Z'));
      expect(result.timeToPivotRatio).toBeCloseTo(0.333, 2);
    });

    it('does not include timeToPivotRatio when no bottom held', async () => {
      vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([
        createBottomHoldAnnotation({
          drawdownFrac: 0.002,
          maxDrawdownFrac: 0.001,
        }),
      ]);

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
