/**
 * Unified timeframe configuration for agent_006 benchmark
 *
 * This is the single source of truth for all timeframe-related settings:
 * - Chart generation parameters
 * - Task definition and question templates
 * - Candle indexing semantics
 * - Ground truth resolution
 */

export type TimeframeId = '15m' | '1h' | '24h' | '7d';

export interface ChartConfig {
  /** Candle bar size in minutes (e.g., 5 = 5m candles) */
  barSizeMinutes: number;
  /** Chart lookback range in minutes (e.g., 120 = 2 hours) */
  rangeMinutes: number;
  /** How chart time range is determined */
  queryMode: 'time_range_snapped';
}

export interface TaskConfig {
  /** Forward-looking window for prediction in minutes */
  forwardWindowMinutes: number;
  /** Human-readable question shown to model */
  questionTemplate: string;
  /** Coordinate system for candlesBack output */
  outputCoordinateSystem: string;
  /** Maximum allowed drawdown as decimal (e.g., 0.004 = 0.4%) */
  maxDrawdown: number;
}

export interface CandleIndexingConfig {
  /** Rule for indexing candles (0 = rightmost closed candle) */
  rule: 'rightmost_closed_is_zero';
  /** Policy for handling forming/incomplete candles */
  formingCandlePolicy: 'exclude';
}

export interface GroundTruthConfig {
  window: {
    /** Start of ground truth window */
    start: 'predictedAt';
    /** Duration of window in minutes */
    durationMinutes: number;
  };
  pivot: {
    /** Data provider for pivot detection */
    provider: 'replaylab';
    /** Type of annotation to fetch */
    annotationType: 'local_extrema';
    /** Pivot detection method */
    method: 'fractal' | 'zigzag';
    /** When annotation becomes available */
    availableAtMode: 'closesAt';
    /** Bar size for pivot detection in minutes */
    barSizeMinutes: number;
    /** Method-specific parameters */
    params: Record<string, number>;
  };
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
      rangeMinutes: 120, // 2 hours
      queryMode: 'time_range_snapped',
    },
    task: {
      forwardWindowMinutes: 15,
      questionTemplate:
        'Based on the 5m candle chart shown, has downside already been exhausted for the next 15 minutes?',
      outputCoordinateSystem: '5m_bars',
      maxDrawdown: 0.004, // 0.4%
    },
    candleIndexing: {
      rule: 'rightmost_closed_is_zero',
      formingCandlePolicy: 'exclude',
    },
    groundTruth: {
      window: {
        start: 'predictedAt',
        durationMinutes: 15,
      },
      pivot: {
        provider: 'replaylab',
        annotationType: 'local_extrema',
        method: 'fractal',
        availableAtMode: 'closesAt',
        barSizeMinutes: 1,
        params: { L: 3 },
      },
    },
  },

  '1h': {
    chart: {
      barSizeMinutes: 15,
      rangeMinutes: 240, // 4 hours
      queryMode: 'time_range_snapped',
    },
    task: {
      forwardWindowMinutes: 60,
      questionTemplate:
        'Based on the 15m candle chart shown, has downside already been exhausted for the next 1 hour?',
      outputCoordinateSystem: '15m_bars',
      maxDrawdown: 0.01, // 1%
    },
    candleIndexing: {
      rule: 'rightmost_closed_is_zero',
      formingCandlePolicy: 'exclude',
    },
    groundTruth: {
      window: {
        start: 'predictedAt',
        durationMinutes: 60,
      },
      pivot: {
        provider: 'replaylab',
        annotationType: 'local_extrema',
        method: 'fractal',
        availableAtMode: 'closesAt',
        barSizeMinutes: 5,
        params: { L: 3 },
      },
    },
  },

  '24h': {
    chart: {
      barSizeMinutes: 60, // 1h candles
      rangeMinutes: 1440, // 24 hours
      queryMode: 'time_range_snapped',
    },
    task: {
      forwardWindowMinutes: 1440, // 24 hours
      questionTemplate:
        'Based on the 1h candle chart shown, has downside already been exhausted for the next 24 hours?',
      outputCoordinateSystem: '1h_bars',
      maxDrawdown: 0.025, // 2.5%
    },
    candleIndexing: {
      rule: 'rightmost_closed_is_zero',
      formingCandlePolicy: 'exclude',
    },
    groundTruth: {
      window: {
        start: 'predictedAt',
        durationMinutes: 1440,
      },
      pivot: {
        provider: 'replaylab',
        annotationType: 'local_extrema',
        method: 'zigzag',
        availableAtMode: 'closesAt',
        barSizeMinutes: 15,
        params: { deviationPct: 0.025 },
      },
    },
  },

  '7d': {
    chart: {
      barSizeMinutes: 240, // 4h candles
      rangeMinutes: 10_080, // 7 days
      queryMode: 'time_range_snapped',
    },
    task: {
      forwardWindowMinutes: 10_080, // 7 days
      questionTemplate:
        'Based on the 4h candle chart shown, has downside already been exhausted for the next 7 days?',
      outputCoordinateSystem: '4h_bars',
      maxDrawdown: 0.06, // 6%
    },
    candleIndexing: {
      rule: 'rightmost_closed_is_zero',
      formingCandlePolicy: 'exclude',
    },
    groundTruth: {
      window: {
        start: 'predictedAt',
        durationMinutes: 10_080,
      },
      pivot: {
        provider: 'replaylab',
        annotationType: 'local_extrema',
        method: 'zigzag',
        availableAtMode: 'closesAt',
        barSizeMinutes: 60,
        params: { deviationPct: 0.05 },
      },
    },
  },
};

/** All timeframe IDs */
export const TIMEFRAME_IDS: TimeframeId[] = ['15m', '1h', '24h', '7d'];

/**
 * Helper to get config for a timeframe
 * @param id - The timeframe identifier
 * @returns The configuration for the specified timeframe
 */
export function getTimeframeConfig(id: TimeframeId): TimeframeConfig {
  // eslint-disable-next-line security/detect-object-injection -- id is typed
  return TIMEFRAME_CONFIG[id];
}

/**
 * Helper to convert bar size minutes to timeframe string for API
 * @param minutes - The bar size in minutes
 * @returns The timeframe string for the API
 * @throws Error if the bar size is not supported
 */
export function barSizeToTimeframe(
  minutes: number
): '1m' | '5m' | '15m' | '1h' | '4h' {
  switch (minutes) {
    case 1:
      return '1m';
    case 5:
      return '5m';
    case 15:
      return '15m';
    case 60:
      return '1h';
    case 240:
      return '4h';
    default:
      throw new Error(`Unsupported bar size: ${String(minutes)} minutes`);
  }
}

/**
 * Get duration in milliseconds for a timeframe
 * @param id - The timeframe identifier
 * @returns The duration in milliseconds
 */
export function getTimeframeDurationMs(id: TimeframeId): number {
  return getTimeframeConfig(id).task.forwardWindowMinutes * 60_000;
}
