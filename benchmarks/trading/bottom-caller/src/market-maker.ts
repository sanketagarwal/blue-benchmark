import { defineAgent } from '@nullagent/agent-core';
import { z } from 'zod';

import type { ModelId } from './matrix.js';
import type { Agent } from '@nullagent/agent-core';

/**
 * Fill probability contract IDs for market-making predictions
 */
export const FILL_CONTRACT_IDS = [
  'bid-fill-1m',
  'bid-fill-5m',
  'bid-fill-15m',
  'ask-fill-1m',
  'ask-fill-5m',
  'ask-fill-15m',
] as const;

export type FillContractId = (typeof FILL_CONTRACT_IDS)[number];

/**
 * Delta-mid contract IDs for expected mid price change predictions
 */
export const DELTA_MID_CONTRACT_IDS = [
  'bid-delta-mid-1m',
  'bid-delta-mid-5m',
  'bid-delta-mid-15m',
  'ask-delta-mid-1m',
  'ask-delta-mid-5m',
  'ask-delta-mid-15m',
] as const;

export type DeltaMidContractId = (typeof DELTA_MID_CONTRACT_IDS)[number];

/**
 * Context interface for market-making predictions
 */
export interface MarketMakerContext {
  /** Chart: 4-hour lookback with 5m candles */
  chart4h5mUrl: string;
  /** Chart: 24-hour lookback with 15m candles */
  chart24h15mUrl: string;
  /** Orderbook data including mid_price, spread, imbalance, best_bid, best_ask */
  orderbookData: string;
  /** Current prediction time */
  currentTime: string;
  /** Trading symbol identifier */
  symbolId: string;
}

// Market maker context that changes per round
let currentMarketMakerContext: MarketMakerContext | undefined;

// Error message constant to avoid duplication
const CONTEXT_NOT_SET_ERROR = 'Market maker context not set. Call setMarketMakerContext() before runRound().';

/**
 * Set the context for the next market maker round
 * @param context - The market maker context containing chart URLs, orderbook data, and symbol info
 */
export function setMarketMakerContext(context: MarketMakerContext): void {
  currentMarketMakerContext = context;
}

/**
 * Clear the market maker context
 */
export function clearMarketMakerContext(): void {
  currentMarketMakerContext = undefined;
}

// Output schema: probability for each fill contract (6 contracts) + delta-mid predictions (6 contracts)
const PredictionSchema = z.object({
  // Fill probability contracts (0-1 range)
  'bid-fill-1m': z.number().min(0).max(1),
  'bid-fill-5m': z.number().min(0).max(1),
  'bid-fill-15m': z.number().min(0).max(1),
  'ask-fill-1m': z.number().min(0).max(1),
  'ask-fill-5m': z.number().min(0).max(1),
  'ask-fill-15m': z.number().min(0).max(1),
  // Delta-mid contracts (no min/max - can be positive or negative)
  'bid-delta-mid-1m': z.number(),
  'bid-delta-mid-5m': z.number(),
  'bid-delta-mid-15m': z.number(),
  'ask-delta-mid-1m': z.number(),
  'ask-delta-mid-5m': z.number(),
  'ask-delta-mid-15m': z.number(),
});

const OutputSchema = z.object({
  reasoning: z.string().optional().describe('Brief reasoning for predictions'),
  predictions: PredictionSchema,
});

export type MarketMakerOutput = z.infer<typeof OutputSchema>;

/**
 * Create a market maker agent for a specific model.
 * Uses a model-specific ID for isolated message history per model.
 * @param modelId - The model identifier
 * @returns An agent definition for the market maker
 */
export function createMarketMaker(modelId: ModelId): Agent<MarketMakerOutput> {
  // Create a safe agent ID by replacing slashes with underscores
  const agentId = `market_maker_${modelId.replaceAll('/', '_')}`;

  return defineAgent({
    id: agentId,

    outputSchema: OutputSchema,

    // Compact every 10 rounds to learn from fill prediction history
    compactionTrigger: {
      type: 'custom',
      shouldCompact: (context) => context.roundNumber > 0 && context.roundNumber % 10 === 0,
    },

    buildRoundPrompt: (context) => {
      if (currentMarketMakerContext === undefined) {
        throw new Error(CONTEXT_NOT_SET_ERROR);
      }

      const { chart4h5mUrl, chart24h15mUrl, orderbookData, currentTime, symbolId } = currentMarketMakerContext;

      const compactionSection =
        context.compactionSummary !== undefined && context.compactionSummary !== ''
          ? `\n\nYour past learnings:\n${context.compactionSummary}\n`
          : '';

      return `Simulate a cryptocurrency market maker predicting fill probabilities and expected mid price changes for ${symbolId}.

Current Time: ${currentTime}
Orderbook State: ${orderbookData}

Chart Analysis (IMPORTANT: Analyze these chart images for pattern recognition):
- 4-Hour Chart (5m candles): ${chart4h5mUrl}
- 24-Hour Chart (15m candles): ${chart24h15mUrl}

Both charts include: SMA(20), EMA(20), Bollinger Bands(20,2), VWAP, SuperTrend(10,3), RSI(14), MACD(12,26,9), Stochastic RSI(14,3,3), ADX(14), CMF(20), Choppiness(14), Volume, and Volume Ratio(20).

**YOUR TASK:**
You are predicting:
1. Fill probability for hypothetical limit orders placed RIGHT NOW at the current best_bid and best_ask prices
2. Expected mid price change (delta-mid) conditional on the order filling

**HOW FILLS WORK:**
- Limit BUY at best_bid fills when a market SELL order crosses into your price (someone sells at or below your bid)
- Limit SELL at best_ask fills when a market BUY order crosses into your price (someone buys at or above your ask)

**ORDERBOOK IMBALANCE INTERPRETATION:**
- Positive imbalance (+) = more bid depth = buying pressure = asks more likely to fill (buyers pushing price up)
- Negative imbalance (-) = more ask depth = selling pressure = bids more likely to fill (sellers pushing price down)
- Near-zero imbalance = balanced book = fills depend more on volatility

**SPREAD & VOLATILITY:**
- Tight spread = stable prices = lower fill probability (less price movement)
- Wide spread = higher volatility = higher fill probability (more price movement)
- High volatility periods = more aggressive market orders = higher fill probability

**DELTA-MID PREDICTIONS:**
Delta-mid is the expected percentage change in the mid price at the end of the time window, conditional on the order filling.
- For BIDS: positive delta-mid means the price is expected to go UP after buying (favorable - you bought low)
- For ASKS: negative delta-mid means the price is expected to go DOWN after selling (favorable - you sold high)
Think about what market conditions cause fills and what those conditions imply for subsequent price movement.

**CONTRACTS TO PREDICT:**

Fill Probability Contracts (0.0 to 1.0):
- bid-fill-1m: Limit BUY at best_bid fills within 1 minute
- bid-fill-5m: Limit BUY at best_bid fills within 5 minutes
- bid-fill-15m: Limit BUY at best_bid fills within 15 minutes
- ask-fill-1m: Limit SELL at best_ask fills within 1 minute
- ask-fill-5m: Limit SELL at best_ask fills within 5 minutes
- ask-fill-15m: Limit SELL at best_ask fills within 15 minutes

Delta-Mid Contracts (percentage, can be positive or negative):
- bid-delta-mid-1m: Expected mid price change if bid fills within 1 minute
- bid-delta-mid-5m: Expected mid price change if bid fills within 5 minutes
- bid-delta-mid-15m: Expected mid price change if bid fills within 15 minutes
- ask-delta-mid-1m: Expected mid price change if ask fills within 1 minute
- ask-delta-mid-5m: Expected mid price change if ask fills within 5 minutes
- ask-delta-mid-15m: Expected mid price change if ask fills within 15 minutes

**MONOTONICITY CONSTRAINTS (MUST RESPECT):**
Longer time horizons must have equal or higher fill probability (more time = more chances to fill):
- bid-fill-15m >= bid-fill-5m >= bid-fill-1m
- ask-fill-15m >= ask-fill-5m >= ask-fill-1m

${compactionSection}
Respond with a JSON object containing:
- "reasoning": ONE sentence only (max 100 chars) - keep this extremely brief
- "predictions": an object with values for each contract ID

Example:
{
  "reasoning": "Strong buying pressure, asks likely to fill.",
  "predictions": {
    "bid-fill-1m": 0.15,
    "bid-fill-5m": 0.35,
    "bid-fill-15m": 0.55,
    "ask-fill-1m": 0.25,
    "ask-fill-5m": 0.50,
    "ask-fill-15m": 0.70,
    "bid-delta-mid-1m": -0.02,
    "bid-delta-mid-5m": -0.05,
    "bid-delta-mid-15m": -0.08,
    "ask-delta-mid-1m": 0.03,
    "ask-delta-mid-5m": 0.06,
    "ask-delta-mid-15m": 0.10
  }
}`;
    },

    buildCompactionPrompt: (history) => `
You've completed ${String(history.length)} rounds of limit order fill probability and delta-mid predictions.

Review your past predictions and the actual outcomes. Summarize:
- What orderbook patterns (imbalance, spread, depth) best predicted fills?
- Which chart indicators correlated with fill probability?
- How accurate were your monotonicity assumptions (longer horizon = higher fill probability)?
- What market conditions led to unexpected fills or non-fills?
- How accurate were your delta-mid predictions? Did fills correlate with expected price movements?
- Were bid-fills followed by upward moves (positive delta-mid) as expected, or the opposite?
- Were ask-fills followed by downward moves (negative delta-mid) as expected, or the opposite?
- What strategies should you adjust for better fill and delta-mid prediction?

Keep it concise and actionable for future market-making rounds.
`,
  });
}

/**
 * Default market maker for backward compatibility.
 * Uses the MODEL_ID environment variable to determine the model.
 */
export const marketMaker = defineAgent({
  id: 'market_maker_001',

  outputSchema: OutputSchema,

  // Compact every 10 rounds to learn from fill prediction history
  compactionTrigger: {
    type: 'custom',
    shouldCompact: (context) => context.roundNumber > 0 && context.roundNumber % 10 === 0,
  },

  buildRoundPrompt: (context) => {
    if (currentMarketMakerContext === undefined) {
      throw new Error(CONTEXT_NOT_SET_ERROR);
    }

    const { chart4h5mUrl, chart24h15mUrl, orderbookData, currentTime, symbolId } = currentMarketMakerContext;

    const compactionSection =
      context.compactionSummary !== undefined && context.compactionSummary !== ''
        ? `\n\nYour past learnings:\n${context.compactionSummary}\n`
        : '';

    return `Simulate a cryptocurrency market maker predicting fill probabilities and expected mid price changes for ${symbolId}.

Current Time: ${currentTime}
Orderbook State: ${orderbookData}

Chart Analysis (IMPORTANT: Analyze these chart images for pattern recognition):
- 4-Hour Chart (5m candles): ${chart4h5mUrl}
- 24-Hour Chart (15m candles): ${chart24h15mUrl}

Both charts include: SMA(20), EMA(20), Bollinger Bands(20,2), VWAP, SuperTrend(10,3), RSI(14), MACD(12,26,9), Stochastic RSI(14,3,3), ADX(14), CMF(20), Choppiness(14), Volume, and Volume Ratio(20).

**YOUR TASK:**
You are predicting:
1. Fill probability for hypothetical limit orders placed RIGHT NOW at the current best_bid and best_ask prices
2. Expected mid price change (delta-mid) conditional on the order filling

**HOW FILLS WORK:**
- Limit BUY at best_bid fills when a market SELL order crosses into your price (someone sells at or below your bid)
- Limit SELL at best_ask fills when a market BUY order crosses into your price (someone buys at or above your ask)

**ORDERBOOK IMBALANCE INTERPRETATION:**
- Positive imbalance (+) = more bid depth = buying pressure = asks more likely to fill (buyers pushing price up)
- Negative imbalance (-) = more ask depth = selling pressure = bids more likely to fill (sellers pushing price down)
- Near-zero imbalance = balanced book = fills depend more on volatility

**SPREAD & VOLATILITY:**
- Tight spread = stable prices = lower fill probability (less price movement)
- Wide spread = higher volatility = higher fill probability (more price movement)
- High volatility periods = more aggressive market orders = higher fill probability

**DELTA-MID PREDICTIONS:**
Delta-mid is the expected percentage change in the mid price at the end of the time window, conditional on the order filling.
- For BIDS: positive delta-mid means the price is expected to go UP after buying (favorable - you bought low)
- For ASKS: negative delta-mid means the price is expected to go DOWN after selling (favorable - you sold high)
Think about what market conditions cause fills and what those conditions imply for subsequent price movement.

**CONTRACTS TO PREDICT:**

Fill Probability Contracts (0.0 to 1.0):
- bid-fill-1m: Limit BUY at best_bid fills within 1 minute
- bid-fill-5m: Limit BUY at best_bid fills within 5 minutes
- bid-fill-15m: Limit BUY at best_bid fills within 15 minutes
- ask-fill-1m: Limit SELL at best_ask fills within 1 minute
- ask-fill-5m: Limit SELL at best_ask fills within 5 minutes
- ask-fill-15m: Limit SELL at best_ask fills within 15 minutes

Delta-Mid Contracts (percentage, can be positive or negative):
- bid-delta-mid-1m: Expected mid price change if bid fills within 1 minute
- bid-delta-mid-5m: Expected mid price change if bid fills within 5 minutes
- bid-delta-mid-15m: Expected mid price change if bid fills within 15 minutes
- ask-delta-mid-1m: Expected mid price change if ask fills within 1 minute
- ask-delta-mid-5m: Expected mid price change if ask fills within 5 minutes
- ask-delta-mid-15m: Expected mid price change if ask fills within 15 minutes

**MONOTONICITY CONSTRAINTS (MUST RESPECT):**
Longer time horizons must have equal or higher fill probability (more time = more chances to fill):
- bid-fill-15m >= bid-fill-5m >= bid-fill-1m
- ask-fill-15m >= ask-fill-5m >= ask-fill-1m

${compactionSection}
Respond with a JSON object containing:
- "reasoning": ONE sentence only (max 100 chars) - keep this extremely brief
- "predictions": an object with values for each contract ID

Example:
{
  "reasoning": "Strong buying pressure, asks likely to fill.",
  "predictions": {
    "bid-fill-1m": 0.15,
    "bid-fill-5m": 0.35,
    "bid-fill-15m": 0.55,
    "ask-fill-1m": 0.25,
    "ask-fill-5m": 0.50,
    "ask-fill-15m": 0.70,
    "bid-delta-mid-1m": -0.02,
    "bid-delta-mid-5m": -0.05,
    "bid-delta-mid-15m": -0.08,
    "ask-delta-mid-1m": 0.03,
    "ask-delta-mid-5m": 0.06,
    "ask-delta-mid-15m": 0.10
  }
}`;
  },

  buildCompactionPrompt: (history) => `
You've completed ${String(history.length)} rounds of limit order fill probability and delta-mid predictions.

Review your past predictions and the actual outcomes. Summarize:
- What orderbook patterns (imbalance, spread, depth) best predicted fills?
- Which chart indicators correlated with fill probability?
- How accurate were your monotonicity assumptions (longer horizon = higher fill probability)?
- What market conditions led to unexpected fills or non-fills?
- How accurate were your delta-mid predictions? Did fills correlate with expected price movements?
- Were bid-fills followed by upward moves (positive delta-mid) as expected, or the opposite?
- Were ask-fills followed by downward moves (negative delta-mid) as expected, or the opposite?
- What strategies should you adjust for better fill and delta-mid prediction?

Keep it concise and actionable for future market-making rounds.
`,
});
