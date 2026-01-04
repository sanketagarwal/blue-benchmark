import type { Candle } from '../replay-lab/ohlcv.js';

/**
 * Result of computing the reference low from lookback candles
 */
export interface ReferenceLowResult {
  price: number;
  candleIndex: number;
  /** How many candles back from the most recent (0 = most recent closed bar) */
  candlesBack: number;
}

/**
 * Result of computing the forward window low
 */
export interface ForwardWindowResult {
  lowestPrice: number;
}

/**
 * Result of resolving no-new-low ground truth
 */
export interface NoNewLowResult {
  refLowPrice: number;
  refLowCandlesBack: number;
  forwardLow: number;
  labelNoNewLow: 0 | 1;
  /** True if forward candles were empty (no data available) */
  forwardCandlesMissing?: boolean;
}

/**
 * Compute the reference low from lookback candles.
 * The reference low is the lowest low across all candles in the lookback window.
 * @param lookbackCandles - Array of candles in the lookback window
 * @returns Reference low price and the candle index where it occurred
 */
export function computeReferenceLow(lookbackCandles: Candle[]): ReferenceLowResult {
  if (lookbackCandles.length === 0) {
    return { price: 0, candleIndex: -1, candlesBack: -1 };
  }

  let minLow = lookbackCandles[0]?.low ?? Infinity;
  let minIndex = 0;

  for (let index = 1; index < lookbackCandles.length; index++) {
    // eslint-disable-next-line security/detect-object-injection -- index from loop iteration
    const candle = lookbackCandles[index];
    if (candle !== undefined && candle.low <= minLow) {
      minLow = candle.low;
      minIndex = index;
    }
  }

  const candlesBack = lookbackCandles.length - 1 - minIndex;
  return { price: minLow, candleIndex: minIndex, candlesBack };
}

/**
 * Compute the lowest price in the forward window.
 * @param forwardCandles - Array of candles in the forward window
 * @returns The lowest low price in the forward window
 */
export function computeForwardWindow(forwardCandles: Candle[]): ForwardWindowResult {
  if (forwardCandles.length === 0) {
    return { lowestPrice: Infinity };
  }

  let lowestPrice = forwardCandles[0]?.low ?? Infinity;

  for (let index = 1; index < forwardCandles.length; index++) {
    // eslint-disable-next-line security/detect-object-injection -- index from loop iteration
    const candle = forwardCandles[index];
    if (candle !== undefined && candle.low < lowestPrice) {
      lowestPrice = candle.low;
    }
  }

  return { lowestPrice };
}

/**
 * Determine if the reference low was NOT undercut in the forward window.
 * @param refLowPrice - The reference low price from lookback window
 * @param forwardLow - The lowest price in the forward window
 * @returns 1 if no new low (ref low held), 0 if new low was made
 */
export function labelNoNewLow(refLowPrice: number, forwardLow: number): 0 | 1 {
  return forwardLow >= refLowPrice ? 1 : 0;
}

/**
 * Resolve no-new-low ground truth from lookback and forward candles.
 * Combines all steps: compute reference low, forward window low, and label.
 * @param lookbackCandles - Candles in the lookback window (before prediction time)
 * @param forwardCandles - Candles in the forward window (after prediction time)
 * @returns Complete ground truth result
 */
export function resolveNoNewLowGroundTruth(
  lookbackCandles: Candle[],
  forwardCandles: Candle[]
): NoNewLowResult {
  const refLow = computeReferenceLow(lookbackCandles);

  if (forwardCandles.length === 0) {
    return {
      refLowPrice: refLow.price,
      refLowCandlesBack: refLow.candlesBack,
      forwardLow: Number.NaN,
      labelNoNewLow: 1,
      forwardCandlesMissing: true,
    };
  }

  const forwardWindow = computeForwardWindow(forwardCandles);

  return {
    refLowPrice: refLow.price,
    refLowCandlesBack: refLow.candlesBack,
    forwardLow: forwardWindow.lowestPrice,
    labelNoNewLow: labelNoNewLow(refLow.price, forwardWindow.lowestPrice),
  };
}
