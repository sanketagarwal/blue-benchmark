import type { Trade } from './trades.js';

/**
 * Finds trades within a time window and returns the mid price (average of min and max prices).
 *
 * @param trades - Array of trades to search through
 * @param targetTime - The reference time to search around
 * @param windowMs - The time window in milliseconds (default: 60000ms = 1 minute)
 * @returns The mid price (average of min and max), or undefined if no trades in window
 */
export function getMidPriceAtTime(
  trades: Trade[],
  targetTime: Date,
  windowMs = 60_000
): number | undefined {
  const targetMs = targetTime.getTime();
  const windowEnd = targetMs + windowMs;

  const tradesInWindow = trades.filter((trade) => {
    const tradeMs = trade.timestamp.getTime();
    return tradeMs >= targetMs && tradeMs <= windowEnd;
  });

  if (tradesInWindow.length === 0) {
    return undefined;
  }

  const prices = tradesInWindow.map((trade) => trade.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  return (minPrice + maxPrice) / 2;
}

/**
 * Computes the change in mid price between fill time and a later horizon time.
 *
 * @param trades - Array of trades to analyze
 * @param fillTime - The fill time (starting point)
 * @param horizonMs - The time horizon in milliseconds from fillTime
 * @returns The price change (exitMid - fillMid), or undefined if either mid is unavailable
 */
export function getMidPriceChange(
  trades: Trade[],
  fillTime: Date,
  horizonMs: number
): number | undefined {
  const fillMid = getMidPriceAtTime(trades, fillTime);
  if (fillMid === undefined) {
    return undefined;
  }

  const exitTime = new Date(fillTime.getTime() + horizonMs);
  const exitMid = getMidPriceAtTime(trades, exitTime);
  if (exitMid === undefined) {
    return undefined;
  }

  return exitMid - fillMid;
}
