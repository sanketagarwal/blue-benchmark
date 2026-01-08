/**
 * Chart Reader Agent for Multi-Step Reasoning Benchmark
 * 
 * Tests models' ability to combine multiple signals from a chart
 * into compound trading conclusions.
 */

import { defineAgent } from '@nullagent/agent-core';

import { ChartReadingOutputSchema } from './output-schema.js';

import type { CandleTimeframe } from './replay-lab/ohlcv.js';

// Multimodal prompt types
interface TextPart {
  type: 'text';
  text: string;
}

interface ImagePart {
  type: 'image';
  image: string;
}

interface MultimodalPrompt {
  content: (TextPart | ImagePart)[];
}

// Context for the current chart being analyzed
interface ChartReaderContext {
  chartUrl: string;
  symbolId: string;
  timeframe: CandleTimeframe;
  currentTime: string;
}

let currentContext: ChartReaderContext | undefined;

const CONTEXT_NOT_SET_ERROR = 'Chart reader context not set. Call setChartReaderContext before running.';
const NOT_IMPLEMENTED_ERROR = 'Compaction not implemented for stateless chart reader';

/**
 * Set the context for the next chart reading round
 */
export function setChartReaderContext(ctx: ChartReaderContext): void {
  currentContext = ctx;
}

/**
 * Clear the chart reader context
 */
export function clearChartReaderContext(): void {
  currentContext = undefined;
}

/**
 * Create a chart reader agent for a specific model
 */
export function createChartReader(modelId: string) {
  const agentId = `chart_reader_multistep_${modelId.replaceAll('/', '_')}`;

  return defineAgent({
    id: agentId,
    systemPrompt: `You are an expert technical analyst evaluating candlestick charts.

Your task is to perform MULTI-STEP REASONING: combine multiple signals from the chart to reach compound trading conclusions.

For each field, you must synthesize information from:
- Price action (candle patterns, trend direction)
- Indicators (VWAP, Bollinger Bands, moving averages)
- Volume analysis
- Support/resistance levels

Think step by step before answering each field. Return ONLY valid JSON matching the schema.`,

    outputSchema: ChartReadingOutputSchema,
    stateless: true,

    buildRoundPrompt: (): MultimodalPrompt => {
      if (currentContext === undefined) {
        throw new Error(CONTEXT_NOT_SET_ERROR);
      }

      const { chartUrl, symbolId, timeframe, currentTime } = currentContext;

      const textPart: TextPart = {
        type: 'text',
        text: `Analyze this ${timeframe} candlestick chart for ${symbolId}.
Current time: ${currentTime}

The chart shows:
- Candlesticks (green = bullish, red = bearish)
- VWAP (Volume Weighted Average Price) - purple line
- Bollinger Bands (upper, middle, lower) - blue bands
- SMA(20) and EMA(20) - moving average lines
- Volume bars at bottom

**MULTI-STEP REASONING TASK**

Answer ALL fields with DEFINITE values (no null). For each field:

1. **uptrend_pullback_to_vwap** (BOOLEAN - must be true or false)
   - Is trend UP over last 10 candles? (>0.5% price increase)
   - Is price currently near VWAP? (within 0.3%)
   - TRUE only if BOTH conditions met, otherwise FALSE

2. **volatility_direction_combo** (ENUM - pick exactly one)
   - high_vol_bullish: Large candles + trending up
   - high_vol_bearish: Large candles + trending down
   - low_vol_drift_up: Small candles + slowly up
   - low_vol_drift_down: Small candles + slowly down
   - consolidation: Small candles + sideways

3. **tested_and_held_support** (BOOLEAN)
   - In last 5 candles: Did any candle wick below lower BB?
   - Did ALL those candles close ABOVE lower BB?
   - TRUE if support tested AND held, otherwise FALSE

4. **breakout_with_volume** (BOOLEAN)
   - Did LAST candle break above upper BB?
   - Is volume on that candle above the 10-candle average?
   - TRUE only if BOTH conditions met, otherwise FALSE

5. **potential_reversal_at_support** (BOOLEAN)
   - Did previous candle touch/wick below lower BB?
   - Is current candle bullish (green) AND closed higher?
   - TRUE if reversal pattern visible, otherwise FALSE

6. **overall_bias** (ENUM - count signals)
   - bullish: 3+ net bullish signals
   - mildly_bullish: 1-2 net bullish
   - neutral: balanced
   - mildly_bearish: 1-2 net bearish
   - bearish: 3+ net bearish

Also provide:
- **meta**: Read base_quote, venue, timeframe from chart
- **active_readout**: Read OHLC values from the rightmost candle

Return ONLY valid JSON. No commentary. Every boolean MUST be true or false.`,
      };

      const imagePart: ImagePart = {
        type: 'image',
        image: chartUrl,
      };

      return { content: [textPart, imagePart] };
    },

    buildCompactionPrompt: () => {
      throw new Error(NOT_IMPLEMENTED_ERROR);
    },
  });
}
