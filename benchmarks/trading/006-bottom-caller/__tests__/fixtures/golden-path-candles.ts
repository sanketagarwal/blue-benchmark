/**
 * Synthetic candle fixtures for the golden path end-to-end test.
 * All values are precisely specified to produce deterministic ground truth.
 */

import type { Candle } from '../../src/replay-lab/ohlcv.js';
import type { TimeframeId, CandleTimeframe } from '../../src/timeframe-config.js';

/**
 * Golden path snapTime - aligned to 4h boundary for all timeframes
 */
export const GOLDEN_SNAP_TIME = new Date('2025-01-01T00:00:00.000Z');

/**
 * Expected ground truth for each horizon
 */
export const GOLDEN_EXPECTED = {
  '15m': {
    refLowPrice: 100.0,
    refLowCandlesBack: 5,
    forwardLowPrice: 99.5,
    labelNoNewLow: false,
  },
  '1h': {
    refLowPrice: 200.0,
    refLowCandlesBack: 10,
    forwardLowPrice: 200.0,
    labelNoNewLow: true,
  },
  '4h': {
    refLowPrice: 300.0,
    refLowCandlesBack: 0,
    forwardLowPrice: 299.0,
    labelNoNewLow: false,
  },
  '24h': {
    refLowPrice: 400.0,
    refLowCandlesBack: 20,
    forwardLowPrice: 401.0,
    labelNoNewLow: true,
  },
} as const;

/**
 * Timeframe durations in milliseconds
 */
const TIMEFRAME_MS: Record<CandleTimeframe, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
};

/**
 * Configuration for each horizon's candle generation
 */
interface HorizonConfig {
  timeframe: CandleTimeframe;
  lookbackBars: number;
  horizonBars: number;
  refLowPrice: number;
  refLowCandlesBack: number;
  forwardLowPrice: number;
  basePrice: number;
}

const HORIZON_CONFIGS: Record<TimeframeId, HorizonConfig> = {
  '15m': {
    timeframe: '5m',
    lookbackBars: 24,
    horizonBars: 3,
    refLowPrice: 100.0,
    refLowCandlesBack: 5,
    forwardLowPrice: 99.5,
    basePrice: 105.0,
  },
  '1h': {
    timeframe: '15m',
    lookbackBars: 32,
    horizonBars: 4,
    refLowPrice: 200.0,
    refLowCandlesBack: 10,
    forwardLowPrice: 200.0,
    basePrice: 210.0,
  },
  '4h': {
    timeframe: '1h',
    lookbackBars: 32,
    horizonBars: 4,
    refLowPrice: 300.0,
    refLowCandlesBack: 0,
    forwardLowPrice: 299.0,
    basePrice: 310.0,
  },
  '24h': {
    timeframe: '4h',
    lookbackBars: 48,
    horizonBars: 6,
    refLowPrice: 400.0,
    refLowCandlesBack: 20,
    forwardLowPrice: 401.0,
    basePrice: 410.0,
  },
};

/**
 * Build a single candle with specified low
 */
function buildCandle(timestamp: Date, low: number, basePrice: number): Candle {
  return {
    timestamp,
    open: basePrice,
    high: basePrice,
    low,
    close: basePrice,
    volume: 1000,
  };
}

/**
 * Build lookback candles for a horizon.
 * Places the reference low at the specified candlesBack position.
 * candlesBack = 0 means the most recent candle (index L-1)
 * candlesBack = x means index L-1-x
 */
export function buildLookbackCandles(
  horizon: TimeframeId,
  snapTime: Date
): Candle[] {
  const config = HORIZON_CONFIGS[horizon];
  const { timeframe, lookbackBars, refLowCandlesBack, basePrice, refLowPrice } =
    config;
  const durationMs = TIMEFRAME_MS[timeframe];

  const candles: Candle[] = [];

  for (let i = 0; i < lookbackBars; i++) {
    const candleEnd = new Date(
      snapTime.getTime() - (lookbackBars - 1 - i) * durationMs
    );
    const thisCandlesBack = lookbackBars - 1 - i;
    const low = thisCandlesBack === refLowCandlesBack ? refLowPrice : basePrice;
    candles.push(buildCandle(candleEnd, low, basePrice));
  }

  return candles;
}

/**
 * Build forward candles for a horizon.
 * Places the forward low in the middle of the horizon window.
 */
export function buildForwardCandles(
  horizon: TimeframeId,
  snapTime: Date
): Candle[] {
  const config = HORIZON_CONFIGS[horizon];
  const { timeframe, horizonBars, forwardLowPrice, basePrice } = config;
  const durationMs = TIMEFRAME_MS[timeframe];

  const candles: Candle[] = [];

  for (let i = 0; i < horizonBars; i++) {
    const candleEnd = new Date(snapTime.getTime() + (i + 1) * durationMs);
    const isMiddleCandle = i === Math.floor(horizonBars / 2);
    const low = isMiddleCandle ? forwardLowPrice : basePrice;
    candles.push(buildCandle(candleEnd, low, basePrice));
  }

  return candles;
}

/**
 * Build all candles for a horizon (lookback + forward)
 */
export function buildHorizonCandles(
  horizon: TimeframeId,
  snapTime: Date
): {
  lookback: Candle[];
  forward: Candle[];
} {
  return {
    lookback: buildLookbackCandles(horizon, snapTime),
    forward: buildForwardCandles(horizon, snapTime),
  };
}

/**
 * Build all candles for all horizons
 */
export function buildAllGoldenCandles(
  snapTime: Date = GOLDEN_SNAP_TIME
): Record<TimeframeId, { lookback: Candle[]; forward: Candle[] }> {
  const horizons: TimeframeId[] = ['15m', '1h', '4h', '24h'];
  const result = {} as Record<
    TimeframeId,
    { lookback: Candle[]; forward: Candle[] }
  >;

  for (const horizon of horizons) {
    result[horizon] = buildHorizonCandles(horizon, snapTime);
  }

  return result;
}
