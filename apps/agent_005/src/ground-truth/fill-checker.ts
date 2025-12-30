/* eslint-disable sonarjs/no-duplicate-string -- Interface property names match FillContractId literals and must be duplicated */
import type { Trade } from '../replay-lab/trades.js';

/**
 * Result of checking if a limit order would have filled.
 */
export interface FillCheckResult {
  filled: boolean;
  fillTime?: Date;
  fillPrice?: number;
  fillSize?: number;
}

/**
 * Ground truth for all 6 fill contracts at different horizons.
 * Uses string literal property names that match FillContractId type.
 */
export interface FillGroundTruth {
  'bid-fill-1m': boolean;
  'bid-fill-5m': boolean;
  'bid-fill-15m': boolean;
  'ask-fill-1m': boolean;
  'ask-fill-5m': boolean;
  'ask-fill-15m': boolean;
}

/**
 * Extended ground truth with fill details for PnL/EV calculation.
 * Uses string literal property names that match FillContractId type.
 */
export interface ExtendedFillGroundTruth {
  fills: FillGroundTruth; // existing boolean ground truth
  details: {
    'bid-fill-1m': FillCheckResult;
    'bid-fill-5m': FillCheckResult;
    'bid-fill-15m': FillCheckResult;
    'ask-fill-1m': FillCheckResult;
    'ask-fill-5m': FillCheckResult;
    'ask-fill-15m': FillCheckResult;
  };
}

/**
 * Checks if a limit BUY order at `bidPrice` would have filled.
 *
 * Fill Logic: A limit BUY at price P fills when a SELL trade occurs at or below P.
 * This is because a taker selling into our bid would execute at our price or better.
 *
 * @param trades - Array of trades to check
 * @param bidPrice - The bid price of the limit order
 * @param startTime - Start of the time window (exclusive for trades before)
 * @param horizon - End of the time window (exclusive for trades at or after)
 * @returns FillCheckResult indicating if/when the order filled
 */
export function checkBidFill(
  trades: Trade[],
  bidPrice: number,
  startTime: Date,
  horizon: Date
): FillCheckResult {
  const startMs = startTime.getTime();
  const horizonMs = horizon.getTime();

  // Find all qualifying trades and pick the earliest
  const qualifyingTrades = trades.filter((trade) => {
    const tradeMs = trade.timestamp.getTime();
    const isInWindow = tradeMs >= startMs && tradeMs < horizonMs;
    const isSellTrade = trade.takerSide === 'SELL';
    const isPriceMatch = trade.price <= bidPrice;
    return isInWindow && isSellTrade && isPriceMatch;
  });

  if (qualifyingTrades.length === 0) {
    return { filled: false };
  }

  // Sort by timestamp to find the earliest fill
  qualifyingTrades.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const firstFill = qualifyingTrades[0];

  if (firstFill === undefined) {
    return { filled: false };
  }

  return {
    filled: true,
    fillTime: firstFill.timestamp,
    fillPrice: firstFill.price,
    fillSize: firstFill.size,
  };
}

/**
 * Checks if a limit SELL order at `askPrice` would have filled.
 *
 * Fill Logic: A limit SELL at price P fills when a BUY trade occurs at or above P.
 * This is because a taker buying into our ask would execute at our price or better.
 *
 * @param trades - Array of trades to check
 * @param askPrice - The ask price of the limit order
 * @param startTime - Start of the time window (exclusive for trades before)
 * @param horizon - End of the time window (exclusive for trades at or after)
 * @returns FillCheckResult indicating if/when the order filled
 */
export function checkAskFill(
  trades: Trade[],
  askPrice: number,
  startTime: Date,
  horizon: Date
): FillCheckResult {
  const startMs = startTime.getTime();
  const horizonMs = horizon.getTime();

  // Find all qualifying trades and pick the earliest
  const qualifyingTrades = trades.filter((trade) => {
    const tradeMs = trade.timestamp.getTime();
    const isInWindow = tradeMs >= startMs && tradeMs < horizonMs;
    const isBuyTrade = trade.takerSide === 'BUY';
    const isPriceMatch = trade.price >= askPrice;
    return isInWindow && isBuyTrade && isPriceMatch;
  });

  if (qualifyingTrades.length === 0) {
    return { filled: false };
  }

  // Sort by timestamp to find the earliest fill
  qualifyingTrades.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const firstFill = qualifyingTrades[0];

  if (firstFill === undefined) {
    return { filled: false };
  }

  return {
    filled: true,
    fillTime: firstFill.timestamp,
    fillPrice: firstFill.price,
    fillSize: firstFill.size,
  };
}

/**
 * Computes ground truth for all 6 fill contracts at different time horizons.
 *
 * @param trades - Array of trades to check
 * @param bidPrice - The bid price for limit BUY orders
 * @param askPrice - The ask price for limit SELL orders
 * @param predictionTime - The time from which to start checking fills
 * @returns Object with boolean values for each of the 6 contracts
 */
export function computeFillGroundTruth(
  trades: Trade[],
  bidPrice: number,
  askPrice: number,
  predictionTime: Date
): FillGroundTruth {
  const predictionMs = predictionTime.getTime();

  // Calculate horizon timestamps
  const horizon1m = new Date(predictionMs + 1 * 60 * 1000);
  const horizon5m = new Date(predictionMs + 5 * 60 * 1000);
  const horizon15m = new Date(predictionMs + 15 * 60 * 1000);

  // Check bid fills at each horizon
  const bidFill1m = checkBidFill(trades, bidPrice, predictionTime, horizon1m);
  const bidFill5m = checkBidFill(trades, bidPrice, predictionTime, horizon5m);
  const bidFill15m = checkBidFill(trades, bidPrice, predictionTime, horizon15m);

  // Check ask fills at each horizon
  const askFill1m = checkAskFill(trades, askPrice, predictionTime, horizon1m);
  const askFill5m = checkAskFill(trades, askPrice, predictionTime, horizon5m);
  const askFill15m = checkAskFill(trades, askPrice, predictionTime, horizon15m);

  return {
    'bid-fill-1m': bidFill1m.filled,
    'bid-fill-5m': bidFill5m.filled,
    'bid-fill-15m': bidFill15m.filled,
    'ask-fill-1m': askFill1m.filled,
    'ask-fill-5m': askFill5m.filled,
    'ask-fill-15m': askFill15m.filled,
  };
}

/**
 * Computes extended fill ground truth with fill details.
 * Returns both the boolean fill indicators AND the detailed fill info
 * (fillTime, fillPrice, fillSize) needed for PnL calculation.
 *
 * @param trades - Array of trades to check
 * @param bidPrice - The bid price for limit BUY orders
 * @param askPrice - The ask price for limit SELL orders
 * @param predictionTime - The time from which to start checking fills
 * @returns ExtendedFillGroundTruth with boolean values and detailed fill info
 */
export function computeExtendedFillGroundTruth(
  trades: Trade[],
  bidPrice: number,
  askPrice: number,
  predictionTime: Date
): ExtendedFillGroundTruth {
  const predictionMs = predictionTime.getTime();

  // Calculate horizon timestamps
  const horizon1m = new Date(predictionMs + 1 * 60 * 1000);
  const horizon5m = new Date(predictionMs + 5 * 60 * 1000);
  const horizon15m = new Date(predictionMs + 15 * 60 * 1000);

  // Check bid fills at each horizon
  const bidFill1m = checkBidFill(trades, bidPrice, predictionTime, horizon1m);
  const bidFill5m = checkBidFill(trades, bidPrice, predictionTime, horizon5m);
  const bidFill15m = checkBidFill(trades, bidPrice, predictionTime, horizon15m);

  // Check ask fills at each horizon
  const askFill1m = checkAskFill(trades, askPrice, predictionTime, horizon1m);
  const askFill5m = checkAskFill(trades, askPrice, predictionTime, horizon5m);
  const askFill15m = checkAskFill(trades, askPrice, predictionTime, horizon15m);

  return {
    fills: {
      'bid-fill-1m': bidFill1m.filled,
      'bid-fill-5m': bidFill5m.filled,
      'bid-fill-15m': bidFill15m.filled,
      'ask-fill-1m': askFill1m.filled,
      'ask-fill-5m': askFill5m.filled,
      'ask-fill-15m': askFill15m.filled,
    },
    details: {
      'bid-fill-1m': bidFill1m,
      'bid-fill-5m': bidFill5m,
      'bid-fill-15m': bidFill15m,
      'ask-fill-1m': askFill1m,
      'ask-fill-5m': askFill5m,
      'ask-fill-15m': askFill15m,
    },
  };
}
/* eslint-enable sonarjs/no-duplicate-string -- Re-enable after interface definitions */
