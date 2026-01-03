import { defineAgent } from '@nullagent/agent-core';
import { z } from 'zod';

import {
  TIMEFRAME_IDS,
  getTimeframeConfig,
  getLookbackBars,
} from './timeframe-config.js';

import type { TimeframeId } from './timeframe-config.js';
import type {
  Agent,
  MultimodalPrompt,
  TextPart,
  ImagePart,
} from '@nullagent/agent-core';

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
 * Reference low information for a horizon
 */
export interface RefLowInfo {
  /** The reference low price */
  price: number;
  /** How many candles back from current the reference low occurred */
  candlesBack: number;
}

/**
 * Context interface for bottom predictions
 */
export interface BottomCallerContext {
  /** Per-timeframe chart image data (PNG bytes) */
  chartByHorizon: Record<TimeframeId, Uint8Array>;
  /** Per-timeframe reference low information */
  refLowByHorizon: Record<TimeframeId, RefLowInfo>;
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

// Output schema: structured prediction for each horizon
const HorizonPredictionSchema = z.object({
  noNewLow: z.boolean(),
  confidence: z.number().min(0.5).max(1),
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
    stateless: true,

    compactionTrigger: {
      type: 'custom',
      shouldCompact: (context) => context.roundNumber > 0 && context.roundNumber % 10 === 0,
    },

    buildRoundPrompt: (context): MultimodalPrompt => {
      if (currentContext === undefined) {
        throw new Error(CONTEXT_NOT_SET_ERROR);
      }

      const { chartByHorizon, refLowByHorizon, currentTime, symbolId } = currentContext;

      const compactionSection =
        context.compactionSummary !== undefined && context.compactionSummary !== ''
          ? `\n\nYour past learnings:\n${context.compactionSummary}\n`
          : '';

      const parts: (TextPart | ImagePart)[] = [];

      // Build image descriptions dynamically from config
      const imageDescriptions = TIMEFRAME_IDS.map((id, index) => {
        const config = getTimeframeConfig(id);
        const barSize = config.chart.barSizeMinutes;
        const barString = barSize >= 60 ? `${String(barSize / 60)}-hour` : `${String(barSize)}-minute`;
        const lookbackBars = getLookbackBars(id);
        const lookbackMinutes = config.chart.range.fromMinutesAgo;
        const lookbackString =
          lookbackMinutes >= 1440
            ? `${String(lookbackMinutes / 1440)} days`
            : (lookbackMinutes >= 60
              ? `${String(lookbackMinutes / 60)} hours`
              : `${String(lookbackMinutes)} minutes`);
        const horizonMinutes = config.task.forwardWindowMinutes;
        const horizonString =
          horizonMinutes >= 60 ? `${String(horizonMinutes / 60)} hour${horizonMinutes >= 120 ? 's' : ''}` : `${String(horizonMinutes)} minutes`;
        // eslint-disable-next-line security/detect-object-injection -- id from TIMEFRAME_IDS typed array
        const refLow = refLowByHorizon[id];
        return `${String(index + 1)}. **Image ${String(index + 1)} – ${id} horizon chart**
   - Bar size: ${barString} candles
   - Lookback: ${String(lookbackBars)} bars (${lookbackString})
   - Prediction horizon: next ${horizonString}
   - Reference low: ${String(refLow.price)} (${String(refLow.candlesBack)} candles back)`;
      }).join('\n\n');

      // Add text intro
      parts.push({
        type: 'text',
        text: `You are given 4 attached candlestick chart images of the same market (${symbolId}).
Current time: ${currentTime}

The images are ordered and used as follows:

${imageDescriptions}
`,
      });

      // Add images in order
      for (const horizon of TIMEFRAME_IDS) {
        // eslint-disable-next-line security/detect-object-injection -- horizon from TIMEFRAME_IDS typed array
        parts.push({ type: 'image', image: chartByHorizon[horizon] });
      }

      // Add task instructions
      parts.push({
        type: 'text',
        text: `
### Task
For each horizon, predict whether the reference low will hold or be undercut within the prediction horizon.

### Definition of noNewLow
- noNewLow = true: The reference low will NOT be undercut within the prediction horizon
- noNewLow = false: Price will make a new low below the reference low within the prediction horizon

### Confidence
- Range: 0.5 to 1.0
- 0.5 = uncertain/guess, 1.0 = high conviction

### Output format
JSON only:
{
  "15m": { "noNewLow": boolean, "confidence": number },
  "1h": { "noNewLow": boolean, "confidence": number },
  "4h": { "noNewLow": boolean, "confidence": number },
  "24h": { "noNewLow": boolean, "confidence": number }
}
${compactionSection}`,
      });

      return { content: parts };
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
