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

function getUtcDateString(date: Date): string {
  // ISO string format: YYYY-MM-DDTHH:mm:ss.sssZ, so first 10 chars are the date
  return date.toISOString().slice(0, 10);
}

function validateDateRange(from: Date, to: Date): void {
  if (to.getTime() <= from.getTime()) {
    throw new Error('to must be after from');
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

export async function getTrades(
  symbolId: string,
  from: Date,
  to: Date,
  limit?: number
): Promise<Trade[]> {
  validateDateRange(from, to);

  const fromTime = from.toISOString();
  const toTime = to.toISOString();
  const limitSuffix = limit === undefined ? '' : `&limit=${String(limit)}`;

  const response = await replayLabFetch<TradesResponse>(
    `/api/trades/${symbolId}?from=${fromTime}&to=${toTime}${limitSuffix}`
  );

  return response.trades.map(convertRawTrade);
}
