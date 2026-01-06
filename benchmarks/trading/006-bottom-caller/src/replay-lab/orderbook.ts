import { replayLabFetch } from './client';

export interface OrderbookSnapshot {
  timestamp: string;
  mid_price: number;
  spread: number;
  spread_bps: number;
  imbalance: number;
  bid_depth: number;
  ask_depth: number;
}

interface OrderbookResponse {
  symbol_id: string;
  snapshots: OrderbookSnapshot[];
}

export async function getOrderbookSnapshot(
  symbolId: string,
  at: Date
): Promise<OrderbookSnapshot> {
  // Use 15-minute lookback window to find nearest snapshot (data is sparse)
  const windowStart = new Date(at);
  windowStart.setMinutes(windowStart.getMinutes() - 15);
  const fromTime = windowStart.toISOString();
  const toTime = at.toISOString();

  const response = await replayLabFetch<OrderbookResponse>(
    `/api/orderbook/${symbolId}?from=${fromTime}&to=${toTime}&limit=1`
  );

  const snapshot = response.snapshots.at(0);
  if (snapshot === undefined) {
    throw new Error(
      `No orderbook data found for ${symbolId} near ${at.toISOString()}`
    );
  }

  return snapshot;
}

/**
 * Computes best bid and best ask prices from orderbook snapshot.
 * Best bid = mid_price - spread/2
 * Best ask = mid_price + spread/2
 * @param snapshot - The orderbook snapshot containing mid_price and spread
 * @returns Object with bestBid and bestAsk prices
 */
export function getBestBidAsk(snapshot: OrderbookSnapshot): {
  bestBid: number;
  bestAsk: number;
} {
  const halfSpread = snapshot.spread / 2;
  return {
    bestBid: snapshot.mid_price - halfSpread,
    bestAsk: snapshot.mid_price + halfSpread,
  };
}

/**
 * Formats orderbook snapshot data for use in LLM prompts.
 * @param snapshot - The orderbook snapshot to format
 * @returns Formatted string with best bid/ask, spread, and imbalance
 */
export function formatOrderbookForPrompt(snapshot: OrderbookSnapshot): string {
  const { bestBid, bestAsk } = getBestBidAsk(snapshot);
  const spreadBps = `${String(snapshot.spread_bps)} bps`;
  const pressureDirection = snapshot.imbalance > 0 ? 'buy' : 'sell';

  return `Best Bid: $${bestBid.toFixed(2)}, Best Ask: $${bestAsk.toFixed(2)}, Spread: ${spreadBps}, Imbalance: ${pressureDirection} pressure (${snapshot.imbalance.toFixed(2)})`;
}
