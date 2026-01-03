/**
 * Candle closure utilities for deterministic time handling.
 * All candle time operations must use these functions.
 */

import type { CandleTimeframe } from './timeframe-config.js';

const DURATION_MAP: Record<CandleTimeframe, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
};

/**
 * Get the timeframe duration in milliseconds
 * @param timeframe - The candle timeframe (1m, 5m, 15m, 1h, 4h)
 * @returns Duration in milliseconds
 */
export function getCandleTimeframeDurationMs(
  timeframe: CandleTimeframe
): number {
  switch (timeframe) {
    case '1m':
      return DURATION_MAP['1m'];
    case '5m':
      return DURATION_MAP['5m'];
    case '15m':
      return DURATION_MAP['15m'];
    case '1h':
      return DURATION_MAP['1h'];
    case '4h':
      return DURATION_MAP['4h'];
  }
}

/**
 * Get the end time of the last closed candle at or before snapTime.
 *
 * A candle is "closed" when its end time <= snapTime.
 * The candle end time is the start of the next candle.
 *
 * @param timeframe - The candle timeframe (1m, 5m, 15m, 1h, 4h)
 * @param snapTime - The prediction/observation time
 * @returns The end time of the most recent closed candle
 */
export function getLastClosedCandleEnd(
  timeframe: CandleTimeframe,
  snapTime: Date
): Date {
  const durationMs = getCandleTimeframeDurationMs(timeframe);
  const snapMs = snapTime.getTime();

  const candleEndMs = Math.floor(snapMs / durationMs) * durationMs;

  return new Date(candleEndMs);
}

/**
 * Get the start time of a candle given its end time.
 * @param candleEnd - The candle's end time
 * @param timeframe - The candle timeframe
 * @returns The candle's start time
 */
export function getCandleStartFromEnd(
  candleEnd: Date,
  timeframe: CandleTimeframe
): Date {
  const durationMs = getCandleTimeframeDurationMs(timeframe);
  return new Date(candleEnd.getTime() - durationMs);
}

/**
 * Get the end time of a candle given its start time.
 * @param candleStart - The candle's start time
 * @param timeframe - The candle timeframe
 * @returns The candle's end time
 */
export function getCandleEndFromStart(
  candleStart: Date,
  timeframe: CandleTimeframe
): Date {
  const durationMs = getCandleTimeframeDurationMs(timeframe);
  return new Date(candleStart.getTime() + durationMs);
}

/**
 * Check if a candle is closed at the given snapTime.
 * A candle is closed if its end time <= snapTime.
 *
 * @param candleEnd - The candle's end time
 * @param snapTime - The observation time
 * @returns True if the candle is closed, false otherwise
 */
export function isCandleClosed(candleEnd: Date, snapTime: Date): boolean {
  return candleEnd.getTime() <= snapTime.getTime();
}
