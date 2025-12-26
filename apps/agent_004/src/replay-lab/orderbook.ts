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

export function formatOrderbookForPrompt(snapshot: OrderbookSnapshot): string {
  const midPriceFormatted = `$${snapshot.mid_price.toFixed(2)}`;
  const spreadBps = `${String(snapshot.spread_bps)} bps`;
  const pressureDirection = snapshot.imbalance > 0 ? 'buy' : 'sell';

  return `Mid Price: ${midPriceFormatted}, Spread: ${spreadBps}, Imbalance: ${pressureDirection} pressure (${snapshot.imbalance.toFixed(2)})`;
}
