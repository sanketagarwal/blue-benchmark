import { defineAgent } from '@nullagent/agent-core';
import { z } from 'zod';

import type { ModelId } from './matrix.js';
import type { Agent } from '@nullagent/agent-core';

export interface ForecastContext {
  chart4h5mUrl: string;
  chart24h15mUrl: string;
  orderbookData: string;
  currentTime: string;
  symbolId: string;
}

let currentForecastContext: ForecastContext | undefined;

export function setForecastContext(context: ForecastContext): void {
  currentForecastContext = context;
}

export function clearForecastContext(): void {
  currentForecastContext = undefined;
}

const PredictionSchema = z.object({
  'dump-simple-15m-1pct': z.number().min(0).max(1),
  'dump-simple-15m-3pct': z.number().min(0).max(1),
  'dump-simple-15m-5pct': z.number().min(0).max(1),
  'dump-simple-1h-0.5pct': z.number().min(0).max(1),
  'dump-simple-1h-1pct': z.number().min(0).max(1),
  'dump-vol-adjusted-15m-z2': z.number().min(0).max(1),
  'dump-vol-adjusted-1h-z2': z.number().min(0).max(1),
  'dump-drawdown-1pct': z.number().min(0).max(1),
  'dump-drawdown-3pct': z.number().min(0).max(1),
});

const OutputSchema = z.object({
  reasoning: z.string().describe('Brief explanation of your analysis'),
  predictions: PredictionSchema,
});

export type ForecastOutput = z.infer<typeof OutputSchema>;

/**
 * Create a forecaster agent for a specific model.
 * Uses the modelId as the agentId for isolated message history.
 * @param modelId - The model identifier
 * @returns An agent definition for the forecaster
 */
export function createForecaster(modelId: ModelId): Agent<ForecastOutput> {
  return defineAgent({
    // Use model ID as agent ID for isolated history per model
    id: modelId,

    outputSchema: OutputSchema,

    compactionTrigger: {
      type: 'custom',
      shouldCompact: (context) => context.roundNumber > 0 && context.roundNumber % 10 === 0,
    },

    buildRoundPrompt: (context) => {
      if (currentForecastContext === undefined) {
        throw new Error('Forecast context not set. Call setForecastContext() before runRound().');
      }

      const { chart4h5mUrl, chart24h15mUrl, orderbookData, currentTime, symbolId } = currentForecastContext;

      const compactionSection =
        context.compactionSummary !== undefined && context.compactionSummary !== ''
          ? `\n\nYour past learnings:\n${context.compactionSummary}\n`
          : '';

      return `Simulate a cryptocurrency price movement forecaster for ${symbolId}.

Current Time: ${currentTime}
Orderbook: ${orderbookData}

Chart Analysis (IMPORTANT: Analyze these chart images for technical signals):
- 4-Hour Chart (5m candles): ${chart4h5mUrl}
- 24-Hour Chart (15m candles): ${chart24h15mUrl}

Both charts include: SMA(20), EMA(20), Bollinger Bands(20,2), VWAP, SuperTrend(10,3), RSI(14), MACD(12,26,9), Stochastic RSI(14,3,3), ADX(14), CMF(20), Choppiness(14), Volume, and Volume Ratio(20).

Analyze the charts and orderbook data to forecast the probability of the following price movements occurring within the NEXT HOUR:

**Simple Dump Contracts (absolute price change):**
- dump-simple-15m-1pct: Price drops ≥1% within next 15 minutes
- dump-simple-15m-3pct: Price drops ≥3% within next 15 minutes
- dump-simple-15m-5pct: Price drops ≥5% within next 15 minutes
- dump-simple-1h-0.5pct: Price drops ≥0.5% within next 1 hour
- dump-simple-1h-1pct: Price drops ≥1% within next 1 hour

**Volatility-Adjusted Contracts (z-score based):**
- dump-vol-adjusted-15m-z2: Price drops ≥2 standard deviations within next 15 minutes
- dump-vol-adjusted-1h-z2: Price drops ≥2 standard deviations within next 1 hour

**Drawdown Contracts (from recent peak):**
- dump-drawdown-1pct: Price falls ≥1% from highest point in next hour
- dump-drawdown-3pct: Price falls ≥3% from highest point in next hour

${compactionSection}
Respond with a JSON object containing:
- "reasoning": brief explanation of your analysis
- "predictions": an object with a probability (0.0 to 1.0) for each contract ID

Example:
{
  "reasoning": "Market showing bearish signals with declining volume...",
  "predictions": {
    "dump-simple-15m-1pct": 0.15,
    "dump-simple-15m-3pct": 0.05,
    ...
  }
}`;
    },

    buildCompactionPrompt: (history) => `
You've completed ${String(history.length)} rounds of cryptocurrency price forecasting.

Review your past predictions and the actual outcomes. Summarize:
- What patterns or indicators proved most reliable?
- What market conditions led to false positives/negatives?
- What strategies should you adjust going forward?

Keep it concise and actionable for future forecasting rounds.
`,
  });
}
