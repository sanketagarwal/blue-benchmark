import { defineAgent } from '@nullagent/agent-core';
import { z } from 'zod';

import { TIMEFRAME_IDS, getTimeframeConfig } from './timeframe-config.js';

import type { TimeframeId } from './timeframe-config.js';
import type { Agent } from '@nullagent/agent-core';

/**
 * Bottom prediction contract IDs for multi-horizon structural bottom detection
 */
export const BOTTOM_CONTRACT_IDS = [
  'bottom-15m',
  'bottom-1h',
  'bottom-4h',
  'bottom-24h',
] as const;

export type BottomContractId = (typeof BOTTOM_CONTRACT_IDS)[number];

/**
 * Context interface for bottom predictions
 */
export interface BottomCallerContext {
  /** Per-timeframe chart URLs */
  chartByHorizon: Record<TimeframeId, string>;
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

// Output schema: structured prediction for each horizon with candlesBack
const HorizonPredictionSchema = z.object({
  hasBottomed: z.boolean(),
  confidence: z.number().min(0).max(1),
  // Optional - some models omit when hasBottomed=false
  candlesBack: z.number().int().min(0).optional(),
});

const PredictionSchema = z.object({
  '15m': HorizonPredictionSchema,
  '1h': HorizonPredictionSchema,
  '4h': HorizonPredictionSchema,
  '24h': HorizonPredictionSchema,
});

export type HorizonPrediction = z.infer<typeof HorizonPredictionSchema>;
export type BottomPredictions = z.infer<typeof PredictionSchema>;

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
    systemPrompt: 'You are an expert technical analyst specializing in identifying structural market bottoms across multiple timeframes.',
    outputSchema: OutputSchema,

    compactionTrigger: {
      type: 'custom',
      shouldCompact: (context) => context.roundNumber > 0 && context.roundNumber % 10 === 0,
    },

    buildRoundPrompt: (context) => {
      if (currentContext === undefined) {
        throw new Error(CONTEXT_NOT_SET_ERROR);
      }

      const { chartByHorizon, currentTime, symbolId } = currentContext;

      const compactionSection =
        context.compactionSummary !== undefined && context.compactionSummary !== ''
          ? `\n\nYour past learnings:\n${context.compactionSummary}\n`
          : '';

      // Build chart sections dynamically
      const chartSections = TIMEFRAME_IDS.map((id) => {
        const config = getTimeframeConfig(id);
        const barSize = config.chart.barSizeMinutes;
        const range = config.chart.range.fromMinutesAgo;
        const rangeString =
          range >= 1440
            ? `${String(range / 1440)}d`
            : (range >= 60
              ? `${String(range / 60)}h`
              : `${String(range)}m`);
        const barString =
          barSize >= 60 ? `${String(barSize / 60)}h` : `${String(barSize)}m`;
        // eslint-disable-next-line security/detect-object-injection -- id from TIMEFRAME_IDS typed array
        const chartUrl = chartByHorizon[id];
        return `${id} Timeframe Chart (${barString} candles, ${rangeString} lookback):
${chartUrl}`;
      }).join('\n\n');

      // Build task questions dynamically
      const questions = TIMEFRAME_IDS.map((id) => {
        const config = getTimeframeConfig(id);
        return `- ${id}: ${config.task.questionTemplate}`;
      }).join('\n');

      // Build max drawdown list
      const drawdowns = TIMEFRAME_IDS.map((id) => {
        const config = getTimeframeConfig(id);
        const pct = (config.task.maxDrawdown * 100).toFixed(1);
        return `   - ${id}: ${pct}% max drawdown`;
      }).join('\n');

      return `You are predicting structural market bottoms for ${symbolId}.

Current Time: ${currentTime}

**OUTPUT FORMAT (exact JSON structure required):**
\`\`\`json
{
  "reasoning": "brief explanation of your analysis",
  "predictions": {
    "15m": { "hasBottomed": true, "confidence": 0.75, "candlesBack": 2 },
    "1h": { "hasBottomed": false, "confidence": 0.60, "candlesBack": 0 },
    "4h": { "hasBottomed": true, "confidence": 0.85, "candlesBack": 5 },
    "24h": { "hasBottomed": false, "confidence": 0.40, "candlesBack": 0 }
  }
}
\`\`\`

**CHART ANALYSIS** (Analyze each chart for its corresponding timeframe):

${chartSections}

All charts include: SMA(20), EMA(20), Bollinger Bands(20,2), VWAP, Volume.

**CANDLE INDEXING:**
The rightmost candle in each chart is the most recent closed candle.
Use this candle as candlesBack = 0.
candlesBack = 3 means three closed candles before that.

**YOUR TASK:**
For each timeframe, answer the question and predict:
${questions}

Output for each timeframe:
1. hasBottomed: boolean - Has downside selling pressure been structurally exhausted?
2. confidence: number (0.0 to 1.0) - How confident are you?
3. candlesBack: integer >= 0 - If bottomed, which candle? (0 = rightmost)

**WHAT MAKES A STRUCTURAL BOTTOM:**
1. A local extrema pivot LOW must occur (confirmed by future price action)
2. Max drawdown from prediction time must not exceed threshold:
${drawdowns}
${compactionSection}`;
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
