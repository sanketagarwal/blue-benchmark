import { defineAgent } from '@nullagent/agent-core';
import { z } from 'zod';

import type { Agent } from '@nullagent/agent-core';

/**
 * Bottom prediction contract IDs for multi-horizon structural bottom detection
 */
export const BOTTOM_CONTRACT_IDS = [
  'bottom-15m',
  'bottom-1h',
  'bottom-24h',
  'bottom-7d',
] as const;

export type BottomContractId = (typeof BOTTOM_CONTRACT_IDS)[number];

/**
 * Context interface for bottom predictions
 */
export interface BottomCallerContext {
  /** Chart: 4-hour lookback with 5m candles */
  chart4h5mUrl: string;
  /** Chart: 24-hour lookback with 15m candles */
  chart24h15mUrl: string;
  /** Current prediction time */
  currentTime: string;
  /** Trading symbol identifier */
  symbolId: string;
}

// Context that changes per round
let currentContext: BottomCallerContext | undefined;

const CONTEXT_NOT_SET_ERROR = 'Bottom caller context not set. Call setBottomCallerContext() before runRound().';

/**
 * Set the context for the next bottom caller round
 * @param context - The context for bottom predictions
 */
export function setBottomCallerContext(context: BottomCallerContext): void {
  currentContext = context;
}

/**
 * Clear the bottom caller context
 */
export function clearBottomCallerContext(): void {
  currentContext = undefined;
}

// Output schema: probability for each bottom contract (4 horizons)
const PredictionSchema = z.object({
  'bottom-15m': z.number().min(0).max(1),
  'bottom-1h': z.number().min(0).max(1),
  'bottom-24h': z.number().min(0).max(1),
  'bottom-7d': z.number().min(0).max(1),
});

const OutputSchema = z.object({
  reasoning: z.string().optional().describe('Brief reasoning for predictions'),
  predictions: PredictionSchema,
});

export type BottomCallerOutput = z.infer<typeof OutputSchema>;

/**
 * Create a bottom caller agent for a specific model.
 * Uses a model-specific ID for isolated message history per model.
 * @param modelId - The model identifier (e.g., 'anthropic/claude-haiku-4.5')
 * @returns Agent configured for bottom predictions
 */
export function createBottomCaller(modelId: string): Agent<BottomCallerOutput> {
  const agentId = `bottom_caller_${modelId.replaceAll('/', '_')}`;

  return defineAgent({
    id: agentId,
    outputSchema: OutputSchema,

    compactionTrigger: {
      type: 'custom',
      shouldCompact: (context) => context.roundNumber > 0 && context.roundNumber % 10 === 0,
    },

    buildRoundPrompt: (context) => {
      if (currentContext === undefined) {
        throw new Error(CONTEXT_NOT_SET_ERROR);
      }

      const { chart4h5mUrl, chart24h15mUrl, currentTime, symbolId } = currentContext;

      const compactionSection =
        context.compactionSummary !== undefined && context.compactionSummary !== ''
          ? `\n\nYour past learnings:\n${context.compactionSummary}\n`
          : '';

      return `You are predicting structural market bottoms for ${symbolId}.

Current Time: ${currentTime}

Chart Analysis (IMPORTANT: Analyze these chart images for pattern recognition):
- 4-Hour Chart (5m candles): ${chart4h5mUrl}
- 24-Hour Chart (15m candles): ${chart24h15mUrl}

Both charts include: SMA(20), EMA(20), Bollinger Bands(20,2), VWAP, SuperTrend(10,3), RSI(14), MACD(12,26,9), Stochastic RSI(14,3,3), ADX(14), CMF(20), Choppiness(14), Volume, and Volume Ratio(20).

**YOUR TASK:**
Predict the probability that downside has been structurally exhausted at each time scale.

This is NOT:
- Predicting the exact pivot candle
- Predicting price will go up
- Predicting a reversal

You are assessing: "Has the selling pressure at THIS scale been absorbed?"

**CONTRACTS TO PREDICT (0.0 to 1.0):**

- bottom-15m: Probability a 15-minute structural low forms within next 15 minutes
- bottom-1h: Probability a 1-hour structural low forms within next hour
- bottom-24h: Probability a 24-hour structural low forms within next 24 hours
- bottom-7d: Probability a 7-day structural low forms within next 7 days

**WHAT MAKES A STRUCTURAL BOTTOM:**
1. A local extrema pivot LOW must occur (confirmed by future price action)
2. Max drawdown from prediction time must not exceed threshold:
   - 15m: 0.4% max drawdown
   - 1h: 1% max drawdown
   - 24h: 2.5% max drawdown
   - 7d: 6% max drawdown

**HINTS:**
- High confidence requires BOTH structural pivot AND bounded drawdown
- Consider volume exhaustion, momentum divergence, support levels
- Longer horizons are harder to predict but more meaningful
- If price is mid-range with no structure, probabilities should be low

${compactionSection}
Respond with JSON:
{
  "reasoning": "Brief analysis (max 100 chars)",
  "predictions": {
    "bottom-15m": 0.35,
    "bottom-1h": 0.25,
    "bottom-24h": 0.15,
    "bottom-7d": 0.10
  }
}`;
    },

    buildCompactionPrompt: (history) => `
You've completed ${String(history.length)} rounds of structural bottom predictions.

Summarize your learnings:
- What chart patterns best predicted structural bottoms at each horizon?
- How accurate were your drawdown assessments?
- Which horizons were you most/least accurate on?
- What false signals did you fall for?

Keep it concise and actionable.
`,
  });
}
