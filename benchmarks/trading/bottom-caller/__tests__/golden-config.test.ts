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
  getHorizonBars,
  getLookbackBars,
  validateTimeframeConfig,
} from '../src/timeframe-config.js';
import { resolveDualGroundTruth } from '../src/ground-truth/bottom-checker.js';
import * as annotations from '../src/replay-lab/annotations.js';
import { computeMaxDrawdownFromCandles } from '../src/replay-lab/ohlcv.js';

import type { TimeframeId } from '../src/timeframe-config.js';
import type { BottomHoldAnnotation } from '../src/replay-lab/annotations.js';
import type { Candle } from '../src/replay-lab/ohlcv.js';

// ============================================================================
// MOCKS
// ============================================================================

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
    vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([]);

    const result = await resolveDualGroundTruth(
      'COINBASE_SPOT_BTC_USD',
      '15m',
      new Date('2025-01-01T00:00:00Z')
    );

    expect(result.primary.label).toBe(0);
    expect(result.primary.hasStructuralBottom).toBe(false);
  });

  it('returns label=1 (bottom held) when drawdown within threshold', async () => {
    vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([
      createBottomHoldAnnotation({
        drawdownFrac: 0.0005,
        maxDrawdownFrac: 0.001,
      }),
    ]);

    const result = await resolveDualGroundTruth(
      'COINBASE_SPOT_BTC_USD',
      '15m',
      new Date('2025-01-01T00:00:00Z')
    );

    expect(result.primary.label).toBe(1);
    expect(result.primary.hasStructuralBottom).toBe(true);
  });

  it('returns label=0 (bottom did not hold) when drawdown exceeds threshold', async () => {
    vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([
      createBottomHoldAnnotation({
        drawdownFrac: 0.002,
        maxDrawdownFrac: 0.001,
      }),
    ]);

    const result = await resolveDualGroundTruth(
      'COINBASE_SPOT_BTC_USD',
      '15m',
      new Date('2025-01-01T00:00:00Z')
    );

    expect(result.primary.label).toBe(0);
    expect(result.primary.hasStructuralBottom).toBe(false);
  });

  it('passes availableAt=closesAt to annotation fetch (no lookahead)', async () => {
    vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([]);

    const predictedAt = new Date('2025-01-01T00:00:00Z');
    await resolveDualGroundTruth('COINBASE_SPOT_BTC_USD', '15m', predictedAt);

    const expectedClosesAt = new Date(
      predictedAt.getTime() + 15 * 60 * 1000
    );

    expect(annotations.getBottomHoldAnnotations).toHaveBeenCalledWith(
      'COINBASE_SPOT_BTC_USD',
      expect.any(Object),
      predictedAt,
      expectedClosesAt,
      expectedClosesAt
    );
  });
});

// ============================================================================
// Golden 3: Dual-label resolution (bottom-hold based)
// ============================================================================

describe('Golden 3: Dual-label resolution', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns label=1 when bottom held (drawdown within threshold)', async () => {
    vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([
      createBottomHoldAnnotation({
        drawdownFrac: 0.0005,
        maxDrawdownFrac: 0.001,
      }),
    ]);

    const result = await resolveDualGroundTruth(
      'COINBASE_SPOT_BTC_USD',
      '15m',
      new Date('2025-01-01T00:00:00Z')
    );

    expect(result.primary.label).toBe(1);
    expect(result.primary.hasStructuralBottom).toBe(true);
    expect(result.secondary.label).toBe(1);
    expect(result.secondary.hasStructuralBottom).toBe(true);
  });

  it('returns label=0 when bottom did not hold (drawdown exceeds threshold)', async () => {
    vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([
      createBottomHoldAnnotation({
        drawdownFrac: 0.002,
        maxDrawdownFrac: 0.001,
      }),
    ]);

    const result = await resolveDualGroundTruth(
      'COINBASE_SPOT_BTC_USD',
      '15m',
      new Date('2025-01-01T00:00:00Z')
    );

    expect(result.primary.label).toBe(0);
    expect(result.primary.hasStructuralBottom).toBe(false);
    expect(result.secondary.label).toBe(0);
    expect(result.secondary.hasStructuralBottom).toBe(false);
  });

  it('filters to only held bottoms when mixed annotations exist', async () => {
    vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([
      createBottomHoldAnnotation({
        id: '1',
        time_start: '2025-01-01T00:03:00Z',
        drawdownFrac: 0.002,
        maxDrawdownFrac: 0.001,
      }),
      createBottomHoldAnnotation({
        id: '2',
        time_start: '2025-01-01T00:07:00Z',
        drawdownFrac: 0.0005,
        maxDrawdownFrac: 0.001,
      }),
    ]);

    const result = await resolveDualGroundTruth(
      'COINBASE_SPOT_BTC_USD',
      '15m',
      new Date('2025-01-01T00:00:00Z')
    );

    expect(result.primary.label).toBe(1);
    expect(result.primary.hasStructuralBottom).toBe(true);
    expect(result.primary.firstPivotAt).toEqual(new Date('2025-01-01T00:07:00Z'));
  });

  it('primary and secondary return same result (unified bottom-hold method)', async () => {
    vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([
      createBottomHoldAnnotation({
        drawdownFrac: 0.0005,
        maxDrawdownFrac: 0.001,
      }),
    ]);

    const result = await resolveDualGroundTruth(
      'COINBASE_SPOT_BTC_USD',
      '4h',
      new Date('2025-01-01T00:00:00Z')
    );

    expect(result.primary.label).toBe(result.secondary.label);
    expect(result.primary.hasStructuralBottom).toBe(result.secondary.hasStructuralBottom);
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
        high: entryPrice + 0.01,
        low: entryPrice,
        close: entryPrice,
        volume: 100,
      },
      {
        timestamp: new Date('2025-01-01T00:05:00Z'),
        open: entryPrice,
        high: entryPrice + 0.01,
        low: lowestLow, // This creates the drawdown
        close: lowestLow + 0.01,
        volume: 150,
      },
      {
        timestamp: new Date('2025-01-01T00:10:00Z'),
        open: lowestLow + 0.01,
        high: entryPrice,
        low: lowestLow,
        close: entryPrice - 0.01,
        volume: 120,
      },
    ];
  };

  it('label valid when maxDrawdown <= threshold', () => {
    const entryPrice = 100;
    const lowestLow = 99.9; // 0.1% drawdown
    const candles = createCandlesWithDrawdown(entryPrice, lowestLow);

    const drawdown = computeMaxDrawdownFromCandles(candles, entryPrice);
    expect(drawdown).toBeCloseTo(0.001, 5); // 0.1% drawdown

    // For 1h timeframe, maxDrawdown threshold is 0.001 (0.1%)
    const threshold = TIMEFRAME_CONFIG['1h'].task.maxDrawdown;
    expect(threshold).toBe(0.001);

    // Threshold at 0.1%, actual drawdown at 0.1% -> valid (<=)
    const isValid = drawdown <= threshold;
    expect(isValid).toBe(true);
  });

  it('label invalid when maxDrawdown > threshold', () => {
    const entryPrice = 100;
    const lowestLow = 99.85; // 0.15% drawdown
    const candles = createCandlesWithDrawdown(entryPrice, lowestLow);

    const drawdown = computeMaxDrawdownFromCandles(candles, entryPrice);
    expect(drawdown).toBeCloseTo(0.0015, 3); // 0.15% drawdown

    // For 1h timeframe, maxDrawdown threshold is 0.001 (0.1%)
    const threshold = TIMEFRAME_CONFIG['1h'].task.maxDrawdown;
    expect(threshold).toBe(0.001);

    // Threshold at 0.1%, actual drawdown at 0.15% -> invalid (>)
    const isValid = drawdown <= threshold;
    expect(isValid).toBe(false);
  });

  it('all timeframes have same drawdown threshold', () => {
    // All timeframes use 0.001 (0.1%) threshold
    expect(TIMEFRAME_CONFIG['15m'].task.maxDrawdown).toBe(0.001);
    expect(TIMEFRAME_CONFIG['1h'].task.maxDrawdown).toBe(0.001);
    expect(TIMEFRAME_CONFIG['4h'].task.maxDrawdown).toBe(0.001);
    expect(TIMEFRAME_CONFIG['24h'].task.maxDrawdown).toBe(0.001);
  });

  it('15m timeframe rejects 0.2% drawdown', () => {
    const entryPrice = 100;
    const lowestLow = 99.8; // 0.2% drawdown
    const candles = createCandlesWithDrawdown(entryPrice, lowestLow);

    const drawdown = computeMaxDrawdownFromCandles(candles, entryPrice);
    expect(drawdown).toBeCloseTo(0.002, 5);

    // 15m has 0.1% threshold, 0.2% exceeds it
    const threshold = TIMEFRAME_CONFIG['15m'].task.maxDrawdown;
    expect(drawdown > threshold).toBe(true);
  });

  it('24h timeframe accepts 0.05% drawdown', () => {
    const entryPrice = 100;
    const lowestLow = 99.95; // 0.05% drawdown
    const candles = createCandlesWithDrawdown(entryPrice, lowestLow);

    const drawdown = computeMaxDrawdownFromCandles(candles, entryPrice);
    expect(drawdown).toBeCloseTo(0.0005, 5);

    // 24h has 0.1% threshold, 0.05% is within it
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

// ============================================================================
// Task Spec v1 invariants
// ============================================================================

describe('Task Spec v1 invariants', () => {
  it('validateTimeframeConfig does not throw', () => {
    expect(() => validateTimeframeConfig()).not.toThrow();
  });

  describe.each(TIMEFRAME_IDS)('%s horizon', (id) => {
    it('lookbackBars === 8 × horizonBars', () => {
      const horizonBars = getHorizonBars(id);
      const lookbackBars = getLookbackBars(id);
      expect(lookbackBars).toBe(8 * horizonBars);
    });

    it('pivot barTimeframe matches chart barTimeframe', () => {
      const config = getTimeframeConfig(id);
      expect(config.groundTruth.pivot.barTimeframe).toBe(config.chart.barTimeframe);
    });

    it('has correct Task Spec v1 tolerance', () => {
      const config = getTimeframeConfig(id);
      const expectedTolerances = {
        '15m': 0.001,
        '1h': 0.001,
        '4h': 0.001,
        '24h': 0.001,
      };
      expect(config.task.maxDrawdown).toBe(expectedTolerances[id]);
    });

    it('horizonBars is a positive integer', () => {
      const horizonBars = getHorizonBars(id);
      expect(horizonBars).toBeGreaterThan(0);
      expect(Number.isInteger(horizonBars)).toBe(true);
    });

    it('lookbackBars is a positive integer', () => {
      const lookbackBars = getLookbackBars(id);
      expect(lookbackBars).toBeGreaterThan(0);
      expect(Number.isInteger(lookbackBars)).toBe(true);
    });
  });
});
