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

// Use the replay endpoint which returns combined OHLCV + orderbook data
interface ReplayObservation {
  timestamp: string;
  ohlcv: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
  orderbook: {
    mid_price: number;
    spread: number;
    spread_bps: number;
    imbalance: number;
    bid_depth: number;
    ask_depth: number;
  };
}

interface ReplayResponse {
  symbol_id: string;
  from: string;
  to: string;
  observations: ReplayObservation[];
}

export async function getOrderbookSnapshot(
  symbolId: string,
  at: Date
): Promise<OrderbookSnapshot> {
  // Use from=to with nearest=true to get the closest observation at the time boundary
  const atTime = at.toISOString();

  const response = await replayLabFetch<ReplayResponse>(
    `/api/replay/${symbolId}?from=${atTime}&to=${atTime}&nearest=true`
  );

  const observation = response.observations.at(0);
  if (observation === undefined) {
    throw new Error(
      `No replay data found for ${symbolId} at ${at.toISOString()}`
    );
  }

  // Extract orderbook data from the replay observation
  return {
    timestamp: observation.timestamp,
    mid_price: observation.orderbook.mid_price,
    spread: observation.orderbook.spread,
    spread_bps: observation.orderbook.spread_bps,
    imbalance: observation.orderbook.imbalance,
    bid_depth: observation.orderbook.bid_depth,
    ask_depth: observation.orderbook.ask_depth,
  };
}

export function formatOrderbookForPrompt(snapshot: OrderbookSnapshot): string {
  const midPriceFormatted = `$${snapshot.mid_price.toFixed(2)}`;
  const spreadBps = `${String(snapshot.spread_bps)} bps`;
  const pressureDirection = snapshot.imbalance > 0 ? 'buy' : 'sell';

  return `Mid Price: ${midPriceFormatted}, Spread: ${spreadBps}, Imbalance: ${pressureDirection} pressure (${snapshot.imbalance.toFixed(2)})`;
}
