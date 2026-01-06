/**
 * Unified timeframe configuration for agent_006 benchmark
 *
 * Rule: "If a number or a sentence describes the experiment, it comes from config."
 */

export type TimeframeId = '15m' | '1h' | '4h' | '24h';

export type QueryMode = 'time_range_snapped';

export type OutputCoordinateSystem =
  | 'bars_5m'
  | 'bars_15m'
  | 'bars_1h'
  | 'bars_4h';

export type CandleTimeframe = '1m' | '5m' | '15m' | '1h' | '4h';

export interface FractalParams { L: number; candleTimeframe: CandleTimeframe }
export interface ZigzagParams {
  deviationPct: number;
  candleTimeframe: CandleTimeframe;
}

export type PivotSpec =
  | { method: 'fractal'; params: FractalParams }
  | { method: 'zigzag'; params: ZigzagParams };

export type SearchMode = 'claimed_minus_slack_to_close' | 'snapTime_to_close';

export interface ChartConfig {
  /** Candle bar size in minutes */
  barSizeMinutes: number;
  /** Candle timeframe for API calls */
  barTimeframe: CandleTimeframe;
  /** How chart time range is determined */
  queryMode: QueryMode;
  /** Deterministic time range: [snapTime - fromMinutesAgo, snapTime] */
  range: {
    fromMinutesAgo: number;
    to: 'snapTime';
  };
}

export interface TaskConfig {
  /** Forward-looking window for prediction in minutes */
  forwardWindowMinutes: number;
  /** Human-readable question shown to model */
  questionTemplate: string;
  /** Coordinate system for bar-based output */
  outputCoordinateSystem: OutputCoordinateSystem;
  /** Maximum allowed drawdown as decimal (e.g., 0.004 = 0.4%) */
  maxDrawdown: number;
}

export interface CandleIndexingConfig {
  /** Rule for indexing candles (0 = rightmost closed candle) */
  rule: 'rightmost_closed_is_zero';
  /** Policy for handling forming/incomplete candles */
  formingCandlePolicy: 'exclude';
  /** Snap interval in minutes (all times aligned to this) */
  snapIntervalMinutes: number;
}

export interface PivotConfig {
  /** Data provider for pivot detection */
  provider: 'replaylab';
  /** Type of annotation to fetch */
  annotationType: 'local_extrema';
  /** When annotation becomes available */
  availableAtMode: 'closesAt';
  /** Bar timeframe for pivot detection */
  barTimeframe: CandleTimeframe;
  /** Method and params for pivot detection */
  spec: PivotSpec;
  /** How we match model's claimed candle to pivots */
  search: {
    mode: SearchMode;
    slackCandles: number;
  };
}

export interface GroundTruthConfig {
  window: {
    /** Reference point for window start */
    start: 'snapTime';
    /** Duration of window in minutes (should equal forwardWindowMinutes) */
    durationMinutes: number;
  };
  /** Primary pivot method (used for scoring/elimination) */
  pivot: PivotConfig;
  /** Secondary pivot method (for comparison data collection) */
  secondaryPivot: PivotConfig;
}

export interface TimeframeConfig {
  chart: ChartConfig;
  task: TaskConfig;
  candleIndexing: CandleIndexingConfig;
  groundTruth: GroundTruthConfig;
}

export const TIMEFRAME_CONFIG: Record<TimeframeId, TimeframeConfig> = {
  '15m': {
    chart: {
      barSizeMinutes: 5,
      barTimeframe: '5m',
      queryMode: 'time_range_snapped',
      range: { fromMinutesAgo: 120, to: 'snapTime' }, // 2h lookback = 24 candles
    },
    task: {
      forwardWindowMinutes: 15,
      questionTemplate:
        'Based on the chart shown, has downside already been exhausted for the next 15 minutes?',
      outputCoordinateSystem: 'bars_5m',
      // Tolerance: 0% - strict undercut only
      // Any undercut of the reference low means a new low was made
      maxDrawdown: 0,
    },
    candleIndexing: {
      rule: 'rightmost_closed_is_zero',
      formingCandlePolicy: 'exclude',
      snapIntervalMinutes: 15,
    },
    groundTruth: {
      window: { start: 'snapTime', durationMinutes: 15 },
      pivot: {
        provider: 'replaylab',
        annotationType: 'local_extrema',
        availableAtMode: 'closesAt',
        barTimeframe: '5m',
        spec: { method: 'fractal', params: { L: 3, candleTimeframe: '5m' } },
        search: { mode: 'snapTime_to_close', slackCandles: 0 },
      },
      secondaryPivot: {
        provider: 'replaylab',
        annotationType: 'local_extrema',
        availableAtMode: 'closesAt',
        barTimeframe: '5m',
        spec: {
          method: 'zigzag',
          params: { deviationPct: 0.005, candleTimeframe: '5m' },
        },
        search: { mode: 'snapTime_to_close', slackCandles: 0 },
      },
    },
  },

  '1h': {
    chart: {
      barSizeMinutes: 15,
      barTimeframe: '15m',
      queryMode: 'time_range_snapped',
      range: { fromMinutesAgo: 480, to: 'snapTime' }, // 8h lookback = 32 candles
    },
    task: {
      forwardWindowMinutes: 60,
      questionTemplate:
        'Based on the chart shown, has downside already been exhausted for the next 1 hour?',
      outputCoordinateSystem: 'bars_15m',
      // Tolerance: 0% - strict undercut only
      // Any undercut of the reference low means a new low was made
      maxDrawdown: 0,
    },
    candleIndexing: {
      rule: 'rightmost_closed_is_zero',
      formingCandlePolicy: 'exclude',
      snapIntervalMinutes: 15,
    },
    groundTruth: {
      window: { start: 'snapTime', durationMinutes: 60 },
      pivot: {
        provider: 'replaylab',
        annotationType: 'local_extrema',
        availableAtMode: 'closesAt',
        barTimeframe: '15m',
        spec: { method: 'fractal', params: { L: 3, candleTimeframe: '15m' } },
        search: { mode: 'snapTime_to_close', slackCandles: 0 },
      },
      secondaryPivot: {
        provider: 'replaylab',
        annotationType: 'local_extrema',
        availableAtMode: 'closesAt',
        barTimeframe: '15m',
        spec: {
          method: 'zigzag',
          params: { deviationPct: 0.01, candleTimeframe: '15m' },
        },
        search: { mode: 'snapTime_to_close', slackCandles: 0 },
      },
    },
  },

  '4h': {
    chart: {
      barSizeMinutes: 60,
      barTimeframe: '1h',
      queryMode: 'time_range_snapped',
      range: { fromMinutesAgo: 1920, to: 'snapTime' }, // 32h lookback = 32 candles
    },
    task: {
      forwardWindowMinutes: 240, // 4h
      questionTemplate:
        'Based on the chart shown, has downside already been exhausted for the next 4 hours?',
      outputCoordinateSystem: 'bars_1h',
      // Tolerance: 0% - strict undercut only
      // Any undercut of the reference low means a new low was made
      maxDrawdown: 0,
    },
    candleIndexing: {
      rule: 'rightmost_closed_is_zero',
      formingCandlePolicy: 'exclude',
      snapIntervalMinutes: 15,
    },
    groundTruth: {
      window: { start: 'snapTime', durationMinutes: 240 },
      pivot: {
        provider: 'replaylab',
        annotationType: 'local_extrema',
        availableAtMode: 'closesAt',
        barTimeframe: '1h',
        spec: {
          method: 'zigzag',
          params: { deviationPct: 0.015, candleTimeframe: '1h' },
        },
        search: { mode: 'snapTime_to_close', slackCandles: 0 },
      },
      secondaryPivot: {
        provider: 'replaylab',
        annotationType: 'local_extrema',
        availableAtMode: 'closesAt',
        barTimeframe: '1h',
        spec: { method: 'fractal', params: { L: 4, candleTimeframe: '1h' } },
        search: { mode: 'snapTime_to_close', slackCandles: 0 },
      },
    },
  },

  '24h': {
    chart: {
      barSizeMinutes: 240,
      barTimeframe: '4h',
      queryMode: 'time_range_snapped',
      range: { fromMinutesAgo: 11_520, to: 'snapTime' }, // 8d lookback = 48 candles
    },
    task: {
      forwardWindowMinutes: 1440, // 24h
      questionTemplate:
        'Based on the chart shown, has downside already been exhausted for the next 24 hours?',
      outputCoordinateSystem: 'bars_4h',
      // Tolerance: 0% - strict undercut only
      // Any undercut of the reference low means a new low was made
      maxDrawdown: 0,
    },
    candleIndexing: {
      rule: 'rightmost_closed_is_zero',
      formingCandlePolicy: 'exclude',
      snapIntervalMinutes: 15,
    },
    groundTruth: {
      window: { start: 'snapTime', durationMinutes: 1440 },
      pivot: {
        provider: 'replaylab',
        annotationType: 'local_extrema',
        availableAtMode: 'closesAt',
        barTimeframe: '4h',
        spec: {
          method: 'zigzag',
          params: { deviationPct: 0.025, candleTimeframe: '4h' },
        },
        search: { mode: 'snapTime_to_close', slackCandles: 0 },
      },
      secondaryPivot: {
        provider: 'replaylab',
        annotationType: 'local_extrema',
        availableAtMode: 'closesAt',
        barTimeframe: '4h',
        spec: { method: 'fractal', params: { L: 5, candleTimeframe: '4h' } },
        search: { mode: 'snapTime_to_close', slackCandles: 0 },
      },
    },
  },
};

/** All timeframe IDs */
export const TIMEFRAME_IDS: TimeframeId[] = ['15m', '1h', '4h', '24h'];

/**
 * Get config for a timeframe
 * @param id - The timeframe ID
 * @returns The timeframe configuration
 */
export function getTimeframeConfig(id: TimeframeId): TimeframeConfig {
  // eslint-disable-next-line security/detect-object-injection -- id is typed
  return TIMEFRAME_CONFIG[id];
}

/**
 * Get duration in milliseconds for a timeframe
 * @param id - The timeframe ID
 * @returns Duration in milliseconds
 */
export function getTimeframeDurationMs(id: TimeframeId): number {
  return getTimeframeConfig(id).task.forwardWindowMinutes * 60_000;
}

/**
 * Get horizon duration in bars for a timeframe
 * @param id - Timeframe ID
 * @returns Number of bars in the horizon
 */
export function getHorizonBars(id: TimeframeId): number {
  const config = getTimeframeConfig(id);
  return config.task.forwardWindowMinutes / config.chart.barSizeMinutes;
}

/**
 * Get lookback duration in bars for a timeframe
 * @param id - Timeframe ID
 * @returns Number of bars in the lookback window
 */
export function getLookbackBars(id: TimeframeId): number {
  const config = getTimeframeConfig(id);
  return config.chart.range.fromMinutesAgo / config.chart.barSizeMinutes;
}

/**
 * Validate timeframe config invariants
 * Call this at startup to catch config drift
 */
export function validateTimeframeConfig(): void {
  for (const id of TIMEFRAME_IDS) {
    const config = getTimeframeConfig(id);

    // Existing check: groundTruth duration matches task forward window
    if (
      config.groundTruth.window.durationMinutes !==
      config.task.forwardWindowMinutes
    ) {
      throw new Error(
        `Config mismatch for ${id}: groundTruth.window.durationMinutes (${String(config.groundTruth.window.durationMinutes)}) !== task.forwardWindowMinutes (${String(config.task.forwardWindowMinutes)})`
      );
    }

    // Invariant 1 - lookbackBars = 8 × horizonBars
    const horizonBars = getHorizonBars(id);
    const lookbackBars = getLookbackBars(id);
    if (lookbackBars !== 8 * horizonBars) {
      throw new Error(
        `Task Spec v1 violation for ${id}: lookbackBars (${String(lookbackBars)}) !== 8 × horizonBars (${String(horizonBars)})`
      );
    }

    // Invariant 2 - pivot barTimeframe matches chart barTimeframe
    if (config.groundTruth.pivot.barTimeframe !== config.chart.barTimeframe) {
      throw new Error(
        `Config mismatch for ${id}: pivot.barTimeframe (${config.groundTruth.pivot.barTimeframe}) !== chart.barTimeframe (${config.chart.barTimeframe})`
      );
    }
  }
}
