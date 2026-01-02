import { describe, expect, it } from 'vitest';
import {
  filterPivotLows,
  type LocalExtremaAnnotation,
} from '../src/replay-lab/annotations.js';

describe('annotations - filterPivotLows', () => {
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
