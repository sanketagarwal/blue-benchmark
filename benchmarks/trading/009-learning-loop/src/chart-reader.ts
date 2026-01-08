/**
 * 009 Learning Loop - Chart Reader Agent
 * 
 * Extended from 007 to support feedback injection.
 */

import { defineAgent, type MultimodalPrompt, type TextPart, type ImagePart } from '@nullagent/agent-core';
import { ChartReadingOutputSchema } from './output-schema.js';
import type { CandleTimeframe } from './replay-lab/ohlcv.js';

// Context for the current round
interface ChartReaderContext {
  chartUrl: string;
  symbolId: string;
  timeframe: CandleTimeframe;
  candlesVisible: number;
  feedback?: string; // Optional feedback from previous round
}

let currentContext: ChartReaderContext | undefined;

export function setChartReaderContext(ctx: ChartReaderContext) {
  currentContext = ctx;
}

export function clearChartReaderContext() {
  currentContext = undefined;
}

const CONTEXT_NOT_SET_ERROR = 'ChartReaderContext not set. Call setChartReaderContext before running.';

export function createChartReader(modelId: string) {
  const agentId = `chart_reader_009_${modelId.replaceAll('/', '_')}`;

  return defineAgent({
    id: agentId,
    
    systemPrompt: `You are an expert technical analyst. Your task is to analyze candlestick charts and extract structured information.

CRITICAL: You must carefully observe the chart and provide accurate answers. Do not guess.

For each field, look at the specific visual elements:
- VWAP (purple line) - Volume Weighted Average Price
- Bollinger Bands (blue bands) - Upper, Middle, Lower bands
- Candlesticks - Green = bullish, Red = bearish
- Volume bars at the bottom

Return ONLY valid JSON matching the schema. No commentary.`,

    outputSchema: ChartReadingOutputSchema,
    stateless: true,

    buildRoundPrompt: (): MultimodalPrompt => {
      if (!currentContext) {
        throw new Error(CONTEXT_NOT_SET_ERROR);
      }

      const { chartUrl, symbolId, timeframe, candlesVisible, feedback } = currentContext;

      // Build the main analysis prompt
      let promptText = '';

      // If feedback is provided, include it at the top
      if (feedback) {
        promptText += `${feedback}\n\n`;
        promptText += `Now, analyze the following chart and apply what you learned from the feedback above.\n\n`;
        promptText += `────────────────────────────────────────────────────────────────────\n\n`;
      }

      promptText += `You are viewing a ${timeframe} candlestick chart for ${symbolId}.
The chart shows approximately ${candlesVisible} candles.

Analyze this chart and provide:

**META** (read from chart title/labels):
- base_quote: The trading pair (e.g., "Bitcoin / U.S. Dollar")
- venue: The exchange (e.g., "Coinbase")
- timeframe: The candle timeframe (e.g., "${timeframe}")

**ACTIVE READOUT** (read from the last candle or info ribbon):
- open: Opening price of the last candle
- high: Highest price of the last candle
- low: Lowest price of the last candle
- close: Closing price of the last candle

**MULTI-STEP REASONING** (analyze patterns and indicators):

1. **uptrend_pullback_to_vwap** (true/false)
   - Is the overall trend bullish (price rising over last 10 candles)?
   - AND is current price within 0.3% of VWAP (purple line)?
   - BOTH must be true → true. Otherwise → false.

2. **volatility_direction_combo** (choose one)
   - Look at candle sizes (large = high volatility, small = low volatility)
   - Look at direction (trending up, down, or sideways)
   - Options:
     * high_vol_bullish: Large candles, trending up
     * high_vol_bearish: Large candles, trending down
     * low_vol_drift_up: Small candles, slight upward
     * low_vol_drift_down: Small candles, slight downward
     * consolidation: Small candles, sideways

3. **tested_and_held_support** (true/false)
   - Did price touch a support level (lower Bollinger band or previous low)?
   - AND did it bounce back (not break through)?
   - BOTH must be true → true. Otherwise → false.

4. **breakout_with_volume** (true/false)
   - Did price break above a resistance level (upper Bollinger band or previous high)?
   - AND is the volume on that candle above average?
   - BOTH must be true → true. Otherwise → false.

5. **potential_reversal_at_support** (true/false)
   - Is price at or near a support level?
   - AND is there a bullish reversal pattern (hammer, engulfing, etc.)?
   - BOTH must be true → true. Otherwise → false.

6. **overall_bias** (choose one)
   - Count bullish signals vs bearish signals
   - Options:
     * strongly_bullish: 3+ net bullish signals
     * mildly_bullish: 1-2 net bullish signals
     * neutral: Equal signals or no clear direction
     * mildly_bearish: 1-2 net bearish signals
     * strongly_bearish: 3+ net bearish signals

Return ONLY valid JSON. No explanation or commentary.`;

      const textPart: TextPart = {
        type: 'text',
        text: promptText,
      };

      const imagePart: ImagePart = {
        type: 'image',
        image: chartUrl,
      };

      return { content: [textPart, imagePart] };
    },

    buildCompactionPrompt: () => {
      throw new Error('Compaction not supported in chart reader');
    },
  });
}

