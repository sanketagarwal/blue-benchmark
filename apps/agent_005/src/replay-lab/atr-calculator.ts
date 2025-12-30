import type { Trade } from './trades.js';

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Build OHLC candles from trades for ATR calculation.
 * Candles are built forward from the reference time.
 *
 * @param trades - Array of trades to build candles from
 * @param referenceTime - The start time (candles built forward from here)
 * @param candleDurationMs - Duration of each candle in milliseconds
 * @param candleCount - Number of candles to build
 * @returns Array of candles, oldest first
 */
export function buildCandles(
  trades: Trade[],
  referenceTime: Date,
  candleDurationMs: number,
  candleCount: number
): Candle[] {
  const refMs = referenceTime.getTime();
  const candles: Candle[] = [];

  for (let index = 0; index < candleCount; index++) {
    const candleStart = refMs + index * candleDurationMs;
    const candleEnd = candleStart + candleDurationMs;

    const candleTrades = trades.filter((t) => {
      const ts = t.timestamp.getTime();
      return ts >= candleStart && ts < candleEnd;
    });

    if (candleTrades.length > 0) {
      const prices = candleTrades.map((t) => t.price);
      const firstTrade = candleTrades[0];
      const lastTrade = candleTrades.at(-1);

      if (firstTrade !== undefined && lastTrade !== undefined) {
        candles.push({
          open: firstTrade.price,
          high: Math.max(...prices),
          low: Math.min(...prices),
          close: lastTrade.price,
        });
      }
    }
  }

  return candles;
}

/**
 * Calculate True Range for a candle.
 * TR = max(high - low, |high - previousClose|, |low - previousClose|)
 * For the first candle, TR = high - low
 *
 * @param candle - The candle to calculate TR for
 * @param previousClose - The previous candle's close price (omit for first candle)
 * @returns The true range value
 */
function trueRange(candle: Candle, previousClose?: number): number {
  const highLow = candle.high - candle.low;

  if (previousClose === undefined) {
    return highLow;
  }

  const highPreviousClose = Math.abs(candle.high - previousClose);
  const lowPreviousClose = Math.abs(candle.low - previousClose);

  return Math.max(highLow, highPreviousClose, lowPreviousClose);
}

/**
 * Calculate Average True Range using Wilder's smoothing method.
 * ATR_n = (ATR_{n-1} * (period - 1) + TR_n) / period
 *
 * @param candles - Array of OHLC candles, oldest first
 * @returns ATR value, or undefined if no candles
 */
export function calculateATR(candles: Candle[]): number | undefined {
  const firstCandle = candles[0];

  if (firstCandle === undefined) {
    return undefined;
  }

  const period = candles.length;
  let atr = trueRange(firstCandle);

  for (let index = 1; index < candles.length; index++) {
    // eslint-disable-next-line security/detect-object-injection -- Safe: index is loop-bounded by candles.length
    const currentCandle = candles[index];
    const previousCandle = candles[index - 1];

    if (currentCandle !== undefined && previousCandle !== undefined) {
      const tr = trueRange(currentCandle, previousCandle.close);
      atr = (atr * (period - 1) + tr) / period;
    }
  }

  return atr;
}

export type Horizon = '1m' | '5m' | '15m';

const HORIZON_MS: Record<Horizon, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
};

const ATR_LOOKBACK_PERIODS = 20;

/**
 * Compute ATR for a specific horizon.
 * Uses 20 periods of the horizon duration, looking back from the reference time.
 *
 * @param trades - Trade data for candle building
 * @param referenceTime - The prediction/fill time
 * @param horizon - The horizon ('1m', '5m', '15m')
 * @returns ATR value or undefined if insufficient data
 */
export function getATRForHorizon(
  trades: Trade[],
  referenceTime: Date,
  horizon: Horizon
): number | undefined {
  // eslint-disable-next-line security/detect-object-injection -- Safe: horizon is typed as literal union '1m' | '5m' | '15m'
  const candleDurationMs = HORIZON_MS[horizon];
  // Build candles from 20 periods before the reference time
  const lookbackStartTime = new Date(
    referenceTime.getTime() - ATR_LOOKBACK_PERIODS * candleDurationMs
  );
  const candles = buildCandles(trades, lookbackStartTime, candleDurationMs, ATR_LOOKBACK_PERIODS);

  if (candles.length < 2) {
    return undefined;
  }

  return calculateATR(candles);
}
