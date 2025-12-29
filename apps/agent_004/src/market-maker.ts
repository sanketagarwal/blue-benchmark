import { defineAgent } from '@nullagent/agent-core';
import { z } from 'zod';

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

// Output schema: probability for each fill contract (6 contracts total)
const PredictionSchema = z.object({
  'bid-fill-1m': z.number().min(0).max(1),
  'bid-fill-5m': z.number().min(0).max(1),
  'bid-fill-15m': z.number().min(0).max(1),
  'ask-fill-1m': z.number().min(0).max(1),
  'ask-fill-5m': z.number().min(0).max(1),
  'ask-fill-15m': z.number().min(0).max(1),
});

const OutputSchema = z.object({
  reasoning: z.string().describe('Brief explanation of your fill probability analysis'),
  predictions: PredictionSchema,
});

export type MarketMakerOutput = z.infer<typeof OutputSchema>;

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
      throw new Error('Market maker context not set. Call setMarketMakerContext() before runRound().');
    }

    const { chart4h5mUrl, chart24h15mUrl, orderbookData, currentTime, symbolId } = currentMarketMakerContext;

    const compactionSection =
      context.compactionSummary !== undefined && context.compactionSummary !== ''
        ? `\n\nYour past learnings:\n${context.compactionSummary}\n`
        : '';

    return `Simulate a cryptocurrency market maker predicting fill probabilities for ${symbolId}.

Current Time: ${currentTime}
Orderbook State: ${orderbookData}

Chart Analysis (IMPORTANT: Analyze these chart images for pattern recognition):
- 4-Hour Chart (5m candles): ${chart4h5mUrl}
- 24-Hour Chart (15m candles): ${chart24h15mUrl}

Both charts include: SMA(20), EMA(20), Bollinger Bands(20,2), VWAP, SuperTrend(10,3), RSI(14), MACD(12,26,9), Stochastic RSI(14,3,3), ADX(14), CMF(20), Choppiness(14), Volume, and Volume Ratio(20).

**YOUR TASK:**
You are predicting the fill probability for hypothetical limit orders placed RIGHT NOW at the current best_bid and best_ask prices.

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

**CONTRACTS TO PREDICT:**
- bid-fill-1m: Limit BUY at best_bid fills within 1 minute
- bid-fill-5m: Limit BUY at best_bid fills within 5 minutes
- bid-fill-15m: Limit BUY at best_bid fills within 15 minutes
- ask-fill-1m: Limit SELL at best_ask fills within 1 minute
- ask-fill-5m: Limit SELL at best_ask fills within 5 minutes
- ask-fill-15m: Limit SELL at best_ask fills within 15 minutes

**MONOTONICITY CONSTRAINTS (MUST RESPECT):**
Longer time horizons must have equal or higher fill probability (more time = more chances to fill):
- bid-fill-15m >= bid-fill-5m >= bid-fill-1m
- ask-fill-15m >= ask-fill-5m >= ask-fill-1m

${compactionSection}
Respond with a JSON object containing:
- "reasoning": brief explanation of your fill probability analysis
- "predictions": an object with a probability (0.0 to 1.0) for each contract ID

Example:
{
  "reasoning": "High positive imbalance suggests buying pressure, making asks more likely to fill. Low volatility reduces overall fill probability...",
  "predictions": {
    "bid-fill-1m": 0.15,
    "bid-fill-5m": 0.35,
    "bid-fill-15m": 0.55,
    "ask-fill-1m": 0.25,
    "ask-fill-5m": 0.50,
    "ask-fill-15m": 0.70
  }
}`;
  },

  buildCompactionPrompt: (history) => `
You've completed ${String(history.length)} rounds of limit order fill probability predictions.

Review your past predictions and the actual fill outcomes. Summarize:
- What orderbook patterns (imbalance, spread, depth) best predicted fills?
- Which chart indicators correlated with fill probability?
- How accurate were your monotonicity assumptions (longer horizon = higher fill probability)?
- What market conditions led to unexpected fills or non-fills?
- What strategies should you adjust for better fill prediction?

Keep it concise and actionable for future market-making rounds.
`,
});
