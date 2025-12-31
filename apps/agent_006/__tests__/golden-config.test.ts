/**
 * Golden Tests 0-4: Config Consistency and Ground Truth Correctness
 *
 * These tests verify:
 * - Golden 0: Config consistency and invariants
 * - Golden 1: Time snapping and reference time
 * - Golden 2: Ground truth availability gating
 * - Golden 3: Dual-label resolution
 * - Golden 4: Drawdown gating
 *
 * NO REAL API CALLS: Uses stubs and fixed timestamps.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TIMEFRAME_CONFIG,
  TIMEFRAME_IDS,
  getTimeframeConfig,
  validateTimeframeConfig,
} from '../src/timeframe-config.js';
import { resolveDualGroundTruth } from '../src/ground-truth/bottom-checker.js';
import * as annotations from '../src/replay-lab/annotations.js';
import { computeMaxDrawdownFromCandles } from '../src/replay-lab/ohlcv.js';

import type { TimeframeId } from '../src/timeframe-config.js';
import type { LocalExtremaAnnotation } from '../src/replay-lab/annotations.js';
import type { Candle } from '../src/replay-lab/ohlcv.js';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../src/replay-lab/annotations.js', async (importOriginal) => {
  const actual = await importOriginal<typeof annotations>();
  return {
    ...actual,
    getLocalExtremaAnnotations: vi.fn(),
  };
});

// ============================================================================
// Golden 0: Config consistency and invariants
// ============================================================================

describe('Golden 0: Config consistency', () => {
  it('each timeframe has matching chart range and forward window', () => {
    for (const id of TIMEFRAME_IDS) {
      const config = getTimeframeConfig(id);

      // Chart range ends at reference time (snapTime)
      expect(config.chart.range.to).toBe('snapTime');

      // forwardWindow matches groundTruth.window.durationMinutes
      expect(config.groundTruth.window.durationMinutes).toBe(
        config.task.forwardWindowMinutes
      );

      // outputCoordinateSystem matches a reasonable bar size
      const barTimeframe = config.chart.barTimeframe;
      const outputCoord = config.task.outputCoordinateSystem;

      // Verify coordinate system uses a bar size derived from chart
      if (barTimeframe === '5m') {
        expect(outputCoord).toBe('bars_5m');
      } else if (barTimeframe === '15m') {
        expect(outputCoord).toBe('bars_15m');
      } else if (barTimeframe === '1h') {
        expect(outputCoord).toBe('bars_1h');
      } else if (barTimeframe === '4h') {
        expect(outputCoord).toBe('bars_4h');
      }
    }
  });

  it('both fractal and zigzag pivot configs are present', () => {
    for (const id of TIMEFRAME_IDS) {
      const config = getTimeframeConfig(id);
      const primaryMethod = config.groundTruth.pivot.spec.method;
      const secondaryMethod = config.groundTruth.secondaryPivot.spec.method;

      // One should be fractal, one should be zigzag
      const methods = new Set([primaryMethod, secondaryMethod]);
      expect(methods.has('fractal')).toBe(true);
      expect(methods.has('zigzag')).toBe(true);
      expect(methods.size).toBe(2); // Both are different
    }
  });

  it('validateTimeframeConfig does not throw', () => {
    expect(() => validateTimeframeConfig()).not.toThrow();
  });

  it('groundTruth.window.start is always snapTime', () => {
    for (const id of TIMEFRAME_IDS) {
      const config = getTimeframeConfig(id);
      expect(config.groundTruth.window.start).toBe('snapTime');
    }
  });

  it('candleIndexing uses rightmost_closed_is_zero rule', () => {
    for (const id of TIMEFRAME_IDS) {
      const config = getTimeframeConfig(id);
      expect(config.candleIndexing.rule).toBe('rightmost_closed_is_zero');
      expect(config.candleIndexing.formingCandlePolicy).toBe('exclude');
    }
  });

  it('all pivot configs use snapTime_to_close search mode with 0 slack', () => {
    for (const id of TIMEFRAME_IDS) {
      const config = getTimeframeConfig(id);
      expect(config.groundTruth.pivot.search.mode).toBe('snapTime_to_close');
      expect(config.groundTruth.pivot.search.slackCandles).toBe(0);
      expect(config.groundTruth.secondaryPivot.search.mode).toBe(
        'snapTime_to_close'
      );
      expect(config.groundTruth.secondaryPivot.search.slackCandles).toBe(0);
    }
  });
});

// ============================================================================
// Golden 1: Time snapping and reference time
// ============================================================================

describe('Golden 1: Time snapping', () => {
  it('reference time matches rightmost closed candle, not always snapTime', () => {
    // Fix now = 2025-12-31T15:07:00Z
    // For 4h candles, last closed is 12:00, not 15:00
    const now = new Date('2025-12-31T15:07:00Z');
    const fourHourBarSizeMs = 4 * 60 * 60 * 1000;

    // Calculate the last closed 4h candle
    const nowMs = now.getTime();
    const lastClosedBarMs =
      Math.floor(nowMs / fourHourBarSizeMs) * fourHourBarSizeMs;
    const lastClosedBar = new Date(lastClosedBarMs);

    // At 15:07 UTC, the last closed 4h bar would be 12:00 UTC (the 12:00-16:00 bar is still open)
    expect(lastClosedBar.toISOString()).toBe('2025-12-31T12:00:00.000Z');

    // candlesBack=0 should point to the 12:00 candle, not 15:00 or 15:07
    // This confirms the rule: rightmost_closed_is_zero
    // Use getUTCHours() to avoid timezone issues
    expect(lastClosedBar.getUTCHours()).toBe(12);
  });

  it('computes correct candlesBack for a known pivot time', () => {
    // Using 5m bars as in 15m timeframe
    const config = getTimeframeConfig('15m');
    const barSizeMs = config.chart.barSizeMinutes * 60 * 1000;

    const snapTime = new Date('2025-12-31T15:00:00Z');
    const pivotTime = new Date('2025-12-31T14:30:00Z');

    // candlesBack = (snapTime - pivotTime) / barSize
    const candlesBack =
      (snapTime.getTime() - pivotTime.getTime()) / barSizeMs;
    expect(candlesBack).toBe(6); // 30 minutes / 5 minute bars = 6 bars back
  });

  it('snapIntervalMinutes is 15 for all timeframes', () => {
    // All timeframes use 15-minute snap intervals
    for (const id of TIMEFRAME_IDS) {
      const config = getTimeframeConfig(id);
      expect(config.candleIndexing.snapIntervalMinutes).toBe(15);
    }
  });
});

// ============================================================================
// Golden 2: Ground truth availability gating
// ============================================================================

describe('Golden 2: Ground truth availability', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns label=0 (no bottom) when no annotations available by closesAt', async () => {
    // Stub annotation with no results (simulating availableAt > closesAt scenario)
    vi.mocked(annotations.getLocalExtremaAnnotations).mockResolvedValue([]);

    const result = await resolveDualGroundTruth(
      'COINBASE_SPOT_BTC_USD',
      '15m',
      new Date('2025-01-01T00:00:00Z')
    );

    // No annotations = no bottom
    expect(result.primary.label).toBe(0);
    expect(result.primary.hasStructuralBottom).toBe(false);
  });

  it('returns label=1 (bottom) when annotation availableAt <= closesAt', async () => {
    // Stub annotation with a pivot LOW available before closesAt
    const annotation: LocalExtremaAnnotation = {
      id: 'test-pivot-1',
      time_start: '2025-01-01T00:05:00Z',
      time_end: null,
      type: 'local_extrema',
      schema_version: 'test-v1',
      payload: { direction: 'low', price: 99.5 },
      source: 'fractal',
    };

    vi.mocked(annotations.getLocalExtremaAnnotations).mockResolvedValue([
      annotation,
    ]);

    const result = await resolveDualGroundTruth(
      'COINBASE_SPOT_BTC_USD',
      '15m',
      new Date('2025-01-01T00:00:00Z')
    );

    expect(result.primary.label).toBe(1);
    expect(result.primary.hasStructuralBottom).toBe(true);
  });

  it('passes availableAt=closesAt to annotation fetch (no lookahead)', async () => {
    vi.mocked(annotations.getLocalExtremaAnnotations).mockResolvedValue([]);

    const predictedAt = new Date('2025-01-01T00:00:00Z');
    await resolveDualGroundTruth('COINBASE_SPOT_BTC_USD', '15m', predictedAt);

    // For 15m timeframe, closesAt = predictedAt + 15 minutes
    const expectedClosesAt = new Date(
      predictedAt.getTime() + 15 * 60 * 1000
    );

    // Verify getLocalExtremaAnnotations was called with availableAt=closesAt
    expect(annotations.getLocalExtremaAnnotations).toHaveBeenCalledWith(
      'COINBASE_SPOT_BTC_USD',
      expect.any(String), // method
      expect.any(Object), // params
      predictedAt,
      expectedClosesAt,
      expectedClosesAt // availableAt should equal closesAt
    );
  });
});

// ============================================================================
// Golden 3: Dual-label resolution
// ============================================================================

describe('Golden 3: Dual-label resolution', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('computes fractal=true, zigzag=false when only fractal present', async () => {
    const fractalAnnotation: LocalExtremaAnnotation = {
      id: 'fractal-pivot-1',
      time_start: '2025-01-01T00:05:00Z',
      time_end: null,
      type: 'local_extrema',
      schema_version: 'test-v1',
      payload: { direction: 'low', price: 99.5 },
      source: 'fractal',
    };

    // Mock based on method parameter
    vi.mocked(annotations.getLocalExtremaAnnotations).mockImplementation(
      async (_symbolId, method) => {
        if (method === 'fractal') {
          return [fractalAnnotation];
        }
        return []; // zigzag returns empty
      }
    );

    const result = await resolveDualGroundTruth(
      'COINBASE_SPOT_BTC_USD',
      '15m', // Uses fractal as primary
      new Date('2025-01-01T00:00:00Z')
    );

    // 15m uses fractal as primary
    expect(result.primary.method).toBe('fractal');
    expect(result.primary.label).toBe(1);
    expect(result.primary.hasStructuralBottom).toBe(true);

    expect(result.secondary.method).toBe('zigzag');
    expect(result.secondary.label).toBe(0);
    expect(result.secondary.hasStructuralBottom).toBe(false);
  });

  it('computes fractal=false, zigzag=true when only zigzag present', async () => {
    const zigzagAnnotation: LocalExtremaAnnotation = {
      id: 'zigzag-pivot-1',
      time_start: '2025-01-01T00:05:00Z',
      time_end: null,
      type: 'local_extrema',
      schema_version: 'test-v1',
      payload: { direction: 'low', price: 99.5 },
      source: 'zigzag',
    };

    vi.mocked(annotations.getLocalExtremaAnnotations).mockImplementation(
      async (_symbolId, method) => {
        if (method === 'zigzag') {
          return [zigzagAnnotation];
        }
        return []; // fractal returns empty
      }
    );

    const result = await resolveDualGroundTruth(
      'COINBASE_SPOT_BTC_USD',
      '15m', // Uses fractal as primary
      new Date('2025-01-01T00:00:00Z')
    );

    // 15m uses fractal as primary, zigzag as secondary
    expect(result.primary.method).toBe('fractal');
    expect(result.primary.label).toBe(0);
    expect(result.primary.hasStructuralBottom).toBe(false);

    expect(result.secondary.method).toBe('zigzag');
    expect(result.secondary.label).toBe(1);
    expect(result.secondary.hasStructuralBottom).toBe(true);
  });

  it('handles both methods having pivots', async () => {
    const fractalAnnotation: LocalExtremaAnnotation = {
      id: 'fractal-pivot-1',
      time_start: '2025-01-01T00:05:00Z',
      time_end: null,
      type: 'local_extrema',
      schema_version: 'test-v1',
      payload: { direction: 'low', price: 99.5 },
      source: 'fractal',
    };

    const zigzagAnnotation: LocalExtremaAnnotation = {
      id: 'zigzag-pivot-1',
      time_start: '2025-01-01T00:07:00Z',
      time_end: null,
      type: 'local_extrema',
      schema_version: 'test-v1',
      payload: { direction: 'low', price: 99.0 },
      source: 'zigzag',
    };

    vi.mocked(annotations.getLocalExtremaAnnotations).mockImplementation(
      async (_symbolId, method) => {
        if (method === 'fractal') {
          return [fractalAnnotation];
        }
        return [zigzagAnnotation];
      }
    );

    const result = await resolveDualGroundTruth(
      'COINBASE_SPOT_BTC_USD',
      '15m',
      new Date('2025-01-01T00:00:00Z')
    );

    expect(result.primary.label).toBe(1);
    expect(result.secondary.label).toBe(1);
    expect(result.primary.hasStructuralBottom).toBe(true);
    expect(result.secondary.hasStructuralBottom).toBe(true);
  });

  it('4h timeframe uses zigzag as primary, fractal as secondary', async () => {
    // Verify config structure for 4h
    const config4h = getTimeframeConfig('4h');
    expect(config4h.groundTruth.pivot.spec.method).toBe('zigzag');
    expect(config4h.groundTruth.secondaryPivot.spec.method).toBe('fractal');

    const zigzagAnnotation: LocalExtremaAnnotation = {
      id: 'zigzag-pivot-1',
      time_start: '2025-01-01T01:00:00Z',
      time_end: null,
      type: 'local_extrema',
      schema_version: 'test-v1',
      payload: { direction: 'low', price: 99.5 },
      source: 'zigzag',
    };

    vi.mocked(annotations.getLocalExtremaAnnotations).mockImplementation(
      async (_symbolId, method) => {
        if (method === 'zigzag') {
          return [zigzagAnnotation];
        }
        return [];
      }
    );

    const result = await resolveDualGroundTruth(
      'COINBASE_SPOT_BTC_USD',
      '4h',
      new Date('2025-01-01T00:00:00Z')
    );

    // 4h uses zigzag as primary
    expect(result.primary.method).toBe('zigzag');
    expect(result.primary.label).toBe(1);
    expect(result.secondary.method).toBe('fractal');
    expect(result.secondary.label).toBe(0);
  });
});

// ============================================================================
// Golden 4: Drawdown gating
// ============================================================================

describe('Golden 4: Drawdown gating', () => {
  // Create a candle series with known drawdown
  const createCandlesWithDrawdown = (
    entryPrice: number,
    lowestLow: number
  ): Candle[] => {
    return [
      {
        timestamp: new Date('2025-01-01T00:00:00Z'),
        open: entryPrice,
        high: entryPrice + 1,
        low: entryPrice - 0.5,
        close: entryPrice,
        volume: 100,
      },
      {
        timestamp: new Date('2025-01-01T00:05:00Z'),
        open: entryPrice,
        high: entryPrice + 0.5,
        low: lowestLow, // This creates the drawdown
        close: lowestLow + 0.5,
        volume: 150,
      },
      {
        timestamp: new Date('2025-01-01T00:10:00Z'),
        open: lowestLow + 0.5,
        high: entryPrice,
        low: lowestLow + 0.2,
        close: entryPrice - 0.1,
        volume: 120,
      },
    ];
  };

  it('label valid when maxDrawdown <= threshold', () => {
    const entryPrice = 100;
    const lowestLow = 99; // 1% drawdown
    const candles = createCandlesWithDrawdown(entryPrice, lowestLow);

    const drawdown = computeMaxDrawdownFromCandles(candles, entryPrice);
    expect(drawdown).toBeCloseTo(0.01, 5); // 1% drawdown

    // For 1h timeframe, maxDrawdown threshold is 0.01 (1%)
    const threshold = TIMEFRAME_CONFIG['1h'].task.maxDrawdown;
    expect(threshold).toBe(0.01);

    // Threshold at 1%, actual drawdown at 1% -> valid (<=)
    const isValid = drawdown <= threshold;
    expect(isValid).toBe(true);
  });

  it('label invalid when maxDrawdown > threshold', () => {
    const entryPrice = 100;
    const lowestLow = 98.9; // 1.1% drawdown
    const candles = createCandlesWithDrawdown(entryPrice, lowestLow);

    const drawdown = computeMaxDrawdownFromCandles(candles, entryPrice);
    expect(drawdown).toBeCloseTo(0.011, 3); // 1.1% drawdown

    // For 1h timeframe, maxDrawdown threshold is 0.01 (1%)
    const threshold = TIMEFRAME_CONFIG['1h'].task.maxDrawdown;
    expect(threshold).toBe(0.01);

    // Threshold at 1%, actual drawdown at 1.1% -> invalid (>)
    const isValid = drawdown <= threshold;
    expect(isValid).toBe(false);
  });

  it('different timeframes have different drawdown thresholds', () => {
    // Verify the expected thresholds
    expect(TIMEFRAME_CONFIG['15m'].task.maxDrawdown).toBe(0.004); // 0.4%
    expect(TIMEFRAME_CONFIG['1h'].task.maxDrawdown).toBe(0.01); // 1%
    expect(TIMEFRAME_CONFIG['4h'].task.maxDrawdown).toBe(0.015); // 1.5%
    expect(TIMEFRAME_CONFIG['24h'].task.maxDrawdown).toBe(0.025); // 2.5%
  });

  it('15m timeframe rejects 0.5% drawdown', () => {
    const entryPrice = 100;
    const lowestLow = 99.5; // 0.5% drawdown
    const candles = createCandlesWithDrawdown(entryPrice, lowestLow);

    const drawdown = computeMaxDrawdownFromCandles(candles, entryPrice);
    expect(drawdown).toBeCloseTo(0.005, 5);

    // 15m has 0.4% threshold, 0.5% exceeds it
    const threshold = TIMEFRAME_CONFIG['15m'].task.maxDrawdown;
    expect(drawdown > threshold).toBe(true);
  });

  it('24h timeframe accepts 2% drawdown', () => {
    const entryPrice = 100;
    const lowestLow = 98; // 2% drawdown
    const candles = createCandlesWithDrawdown(entryPrice, lowestLow);

    const drawdown = computeMaxDrawdownFromCandles(candles, entryPrice);
    expect(drawdown).toBeCloseTo(0.02, 5);

    // 24h has 2.5% threshold, 2% is within it
    const threshold = TIMEFRAME_CONFIG['24h'].task.maxDrawdown;
    expect(drawdown <= threshold).toBe(true);
  });

  it('computes drawdown as (entry - lowestLow) / entry', () => {
    const entryPrice = 3500;
    const lowestLow = 3465; // 35 below entry
    const candles = createCandlesWithDrawdown(entryPrice, lowestLow);

    const drawdown = computeMaxDrawdownFromCandles(candles, entryPrice);

    // Expected: (3500 - 3465) / 3500 = 35/3500 = 0.01
    const expected = (entryPrice - lowestLow) / entryPrice;
    expect(drawdown).toBeCloseTo(expected, 6);
    expect(drawdown).toBeCloseTo(0.01, 5);
  });

  it('returns 0 drawdown when price never drops below entry', () => {
    const entryPrice = 100;
    const candles: Candle[] = [
      {
        timestamp: new Date('2025-01-01T00:00:00Z'),
        open: entryPrice,
        high: 105,
        low: 100, // Never goes below entry
        close: 103,
        volume: 100,
      },
      {
        timestamp: new Date('2025-01-01T00:05:00Z'),
        open: 103,
        high: 107,
        low: 101,
        close: 106,
        volume: 120,
      },
    ];

    const drawdown = computeMaxDrawdownFromCandles(candles, entryPrice);
    expect(drawdown).toBe(0);

    // 0 drawdown is always valid regardless of threshold
    const thresholds = TIMEFRAME_IDS.map(
      (id) => TIMEFRAME_CONFIG[id].task.maxDrawdown
    );
    for (const threshold of thresholds) {
      expect(drawdown <= threshold).toBe(true);
    }
  });
});
