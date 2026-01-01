import { replayLabFetch } from './client';

export interface Trade {
  symbolId: string;
  timestamp: Date;
  price: number;
  size: number;
  takerSide: 'BUY' | 'SELL';
  uuid: string;
}

interface RawTrade {
  symbol_id: string;
  timestamp: string;
  price: number;
  size: number;
  taker_side: 'BUY' | 'SELL';
  uuid: string;
}

interface TradesResponse {
  symbol_id: string;
  trades: RawTrade[];
}

const ERROR_TO_MUST_BE_AFTER_FROM = 'to must be after from';

function getUtcDateString(date: Date): string {
  // ISO string format: YYYY-MM-DDTHH:mm:ss.sssZ, so first 10 chars are the date
  return date.toISOString().slice(0, 10);
}

function validateSameDayRange(from: Date, to: Date): void {
  if (to.getTime() <= from.getTime()) {
    throw new Error(ERROR_TO_MUST_BE_AFTER_FROM);
  }

  const fromUtcDay = getUtcDateString(from);
  const toUtcDay = getUtcDateString(to);

  if (fromUtcDay !== toUtcDay) {
    throw new Error(
      'from and to must be on the same UTC day (CoinAPI requirement)'
    );
  }
}

function convertRawTrade(raw: RawTrade): Trade {
  return {
    symbolId: raw.symbol_id,
    timestamp: new Date(raw.timestamp),
    price: raw.price,
    size: raw.size,
    takerSide: raw.taker_side,
    uuid: raw.uuid,
  };
}

/**
 * Fetch trades for a single day (CoinAPI requirement).
 * @param symbolId - Trading symbol identifier
 * @param from - Start time (must be same UTC day as to)
 * @param to - End time (must be same UTC day as from)
 * @param limit - Optional maximum number of trades
 * @returns Array of trades for the day
 */
async function getTradesSingleDay(
  symbolId: string,
  from: Date,
  to: Date,
  limit?: number
): Promise<Trade[]> {
  validateSameDayRange(from, to);

  const fromTime = from.toISOString();
  const toTime = to.toISOString();
  const limitSuffix = limit === undefined ? '' : `&limit=${String(limit)}`;

  const response = await replayLabFetch<TradesResponse>(
    `/api/trades/${symbolId}?from=${fromTime}&to=${toTime}${limitSuffix}`
  );

  return response.trades.map(convertRawTrade);
}

/**
 * Get start of next UTC day.
 * @param date - Date to get next day start for
 * @returns Start of the next UTC day
 */
function getNextDayStart(date: Date): Date {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/**
 * Get end of current UTC day (23:59:59.999).
 * @param date - Date to get day end for
 * @returns End of the UTC day
 */
function getDayEnd(date: Date): Date {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/**
 * Fetch trades across a date range, handling multi-day spans
 * by fetching day-by-day and concatenating results.
 * @param symbolId - Trading symbol identifier
 * @param from - Start of time range
 * @param to - End of time range
 * @param limit - Optional maximum number of trades to return
 * @returns Array of trades across the date range
 */
export async function getTrades(
  symbolId: string,
  from: Date,
  to: Date,
  limit?: number
): Promise<Trade[]> {
  if (to.getTime() <= from.getTime()) {
    throw new Error(ERROR_TO_MUST_BE_AFTER_FROM);
  }

  const fromUtcDay = getUtcDateString(from);
  const toUtcDay = getUtcDateString(to);

  // Same day - single request
  if (fromUtcDay === toUtcDay) {
    return await getTradesSingleDay(symbolId, from, to, limit);
  }

  // Multi-day - fetch each day and concatenate
  const allTrades: Trade[] = [];
  let currentStart = from;

  while (currentStart.getTime() < to.getTime()) {
    const currentDay = getUtcDateString(currentStart);
    const toDay = getUtcDateString(to);

    // Last day uses actual end time, otherwise fetch until end of day
    const dayEnd = currentDay === toDay ? to : getDayEnd(currentStart);

    const dayTrades = await getTradesSingleDay(symbolId, currentStart, dayEnd);
    allTrades.push(...dayTrades);

    // Move to next day
    currentStart = getNextDayStart(currentStart);
  }

  // Apply limit if specified
  if (limit !== undefined && allTrades.length > limit) {
    return allTrades.slice(0, limit);
  }

  return allTrades;
}
