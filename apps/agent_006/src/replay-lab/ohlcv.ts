import { replayLabFetch } from './client.js';

export interface Candle {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface RawCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface OHLCVResponse {
  symbol_id: string;
  timeframe: string;
  candles: RawCandle[];
}

export type CandleTimeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

function convertRawCandle(raw: RawCandle): Candle {
  return {
    timestamp: new Date(raw.timestamp),
    open: raw.open,
    high: raw.high,
    low: raw.low,
    close: raw.close,
    volume: raw.volume,
  };
}

/**
 * Fetch OHLCV candles for a symbol and time range.
 * No same-day restriction - works across any date range.
 * @param symbolId - Trading symbol identifier
 * @param timeframe - Candle timeframe (1m, 5m, 15m, 1h, 4h, 1d)
 * @param from - Start of time range
 * @param to - End of time range
 * @param limit - Maximum number of candles to return
 * @returns Array of candles with converted timestamps
 */
export async function getCandles(
  symbolId: string,
  timeframe: CandleTimeframe,
  from: Date,
  to: Date,
  limit = 1000
): Promise<Candle[]> {
  const fromTime = from.toISOString();
  const toTime = to.toISOString();

  const response = await replayLabFetch<OHLCVResponse>(
    `/api/ohlcv/${symbolId}?timeframe=${timeframe}&from=${fromTime}&to=${toTime}&limit=${String(limit)}`
  );

  return response.candles.map(convertRawCandle);
}

/**
 * Get entry price from candles at prediction time.
 * Uses the open price of the first candle at or after prediction time.
 * @param candles - Array of candles to search
 * @param predictionTime - Time of prediction
 * @returns Open price of relevant candle, or undefined if no candles
 */
export function getEntryPriceFromCandles(candles: Candle[], predictionTime: Date): number | undefined {
  if (candles.length === 0) {
    return undefined;
  }

  // Find first candle at or after prediction time
  const predictionMs = predictionTime.getTime();
  const relevantCandle = candles.find((c) => c.timestamp.getTime() >= predictionMs);

  const firstCandle = candles[0];
  return relevantCandle?.open ?? firstCandle?.open;
}

/**
 * Compute max drawdown from candles.
 * Drawdown = (entryPrice - lowestLow) / entryPrice
 * @param candles - Array of candles to analyze
 * @param entryPrice - Entry price to compute drawdown from
 * @returns Maximum drawdown as a decimal (0 to 1)
 */
export function computeMaxDrawdownFromCandles(candles: Candle[], entryPrice: number): number {
  if (candles.length === 0 || entryPrice <= 0) {
    return 0;
  }

  const lowestLow = Math.min(...candles.map((c) => c.low));
  const drawdown = (entryPrice - lowestLow) / entryPrice;

  return Math.max(0, drawdown);
}
