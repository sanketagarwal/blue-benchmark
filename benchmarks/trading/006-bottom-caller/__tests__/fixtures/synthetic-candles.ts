import type { Candle } from '../../src/replay-lab/ohlcv.js';
import {
  getHorizonBars,
  getLookbackBars,
  TIMEFRAME_CONFIG,
  type TimeframeId,
} from '../../src/timeframe-config.js';

/**
 * Parameters for building a synthetic candle array for a single timeframe
 */
export interface SyntheticCandleParams {
  /** Timeframe ID determines bar size and counts */
  timeframeId: TimeframeId;
  /** Reference low price in the lookback window */
  refLowPrice: number;
  /** How many bars back from the rightmost closed bar the reference low occurs (0 = rightmost) */
  candlesBack: number;
  /** The lowest price in the forward window */
  forwardLowPrice: number;
  /** Snap time - lookback ends here, forward starts after */
  snapTime: Date;
}

/**
 * Result of building synthetic candles for a timeframe
 */
export interface SyntheticCandleResult {
  timeframeId: TimeframeId;
  lookbackCandles: Candle[];
  forwardCandles: Candle[];
  expectedLabel: 0 | 1;
  refLowPrice: number;
  forwardLowPrice: number;
}

/**
 * Golden fixture set for all four timeframes
 */
export interface GoldenFixtures {
  '15m': SyntheticCandleResult;
  '1h': SyntheticCandleResult;
  '4h': SyntheticCandleResult;
  '24h': SyntheticCandleResult;
}

/**
 * Get bar size in milliseconds for a timeframe
 */
function getBarSizeMs(timeframeId: TimeframeId): number {
  const config = TIMEFRAME_CONFIG[timeframeId];
  return config.chart.barSizeMinutes * 60_000;
}

/**
 * Build a single synthetic candle
 * @param timestamp - Candle end timestamp
 * @param low - Low price for this candle
 * @param basePrice - Base price to derive OHLC from
 */
function buildCandle(timestamp: Date, low: number, basePrice: number): Candle {
  return {
    timestamp,
    open: basePrice,
    high: Math.max(basePrice + 5, low + 10),
    low,
    close: basePrice + 2,
    volume: 1000,
  };
}

/**
 * Build synthetic candle arrays for a given timeframe with specified reference and forward lows.
 *
 * Lookback candles end AT snapTime, forward candles start AFTER snapTime.
 * candlesBack=0 means the reference low is at the rightmost (most recent) closed candle.
 *
 * @param params - Configuration for the synthetic data
 * @returns Lookback and forward candle arrays with expected label
 */
export function buildSyntheticCandles(
  params: SyntheticCandleParams
): SyntheticCandleResult {
  const { timeframeId, refLowPrice, candlesBack, forwardLowPrice, snapTime } =
    params;

  const lookbackCount = getLookbackBars(timeframeId);
  const horizonCount = getHorizonBars(timeframeId);
  const barSizeMs = getBarSizeMs(timeframeId);
  const snapMs = snapTime.getTime();

  const basePriceAboveLow = refLowPrice + 50;

  const lookbackCandles: Candle[] = [];
  for (let i = 0; i < lookbackCount; i++) {
    const barIndex = lookbackCount - 1 - i;
    const timestamp = new Date(snapMs - barIndex * barSizeMs);
    const currentCandlesBack = lookbackCount - 1 - i;
    const isRefLowCandle = currentCandlesBack === candlesBack;
    const low = isRefLowCandle ? refLowPrice : basePriceAboveLow;
    lookbackCandles.push(buildCandle(timestamp, low, basePriceAboveLow));
  }

  const forwardCandles: Candle[] = [];
  const forwardBasePriceAboveLow = Math.max(refLowPrice, forwardLowPrice) + 50;
  for (let i = 0; i < horizonCount; i++) {
    const timestamp = new Date(snapMs + (i + 1) * barSizeMs);
    const isLowestCandle = i === 0;
    const low = isLowestCandle ? forwardLowPrice : forwardBasePriceAboveLow;
    forwardCandles.push(buildCandle(timestamp, low, forwardBasePriceAboveLow));
  }

  const expectedLabel: 0 | 1 = forwardLowPrice >= refLowPrice ? 1 : 0;

  return {
    timeframeId,
    lookbackCandles,
    forwardCandles,
    expectedLabel,
    refLowPrice,
    forwardLowPrice,
  };
}

/**
 * Get golden path fixtures for all four timeframes.
 *
 * These fixtures have known labels:
 * - 15m: label=0 (new low happens, forward 99.50 < ref 100.00)
 * - 1h:  label=1 (no new low, forward 200.00 >= ref 200.00)
 * - 4h:  label=0 (new low happens, forward 299.00 < ref 300.00)
 * - 24h: label=1 (no new low, forward 401.00 > ref 400.00)
 *
 * @param snapTime - The aligned boundary time (lookback ends here, forward starts after)
 * @returns All four timeframe fixtures in a typed object
 */
export function getGoldenFixtures(snapTime: Date): GoldenFixtures {
  return {
    '15m': buildSyntheticCandles({
      timeframeId: '15m',
      refLowPrice: 100.0,
      candlesBack: 5,
      forwardLowPrice: 99.5,
      snapTime,
    }),
    '1h': buildSyntheticCandles({
      timeframeId: '1h',
      refLowPrice: 200.0,
      candlesBack: 10,
      forwardLowPrice: 200.0,
      snapTime,
    }),
    '4h': buildSyntheticCandles({
      timeframeId: '4h',
      refLowPrice: 300.0,
      candlesBack: 0,
      forwardLowPrice: 299.0,
      snapTime,
    }),
    '24h': buildSyntheticCandles({
      timeframeId: '24h',
      refLowPrice: 400.0,
      candlesBack: 20,
      forwardLowPrice: 401.0,
      snapTime,
    }),
  };
}
