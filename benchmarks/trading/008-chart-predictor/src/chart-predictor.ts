import { defineAgent } from '@nullagent/agent-core';
import type { ImagePart, TextPart } from 'ai';

import { ChartPredictionOutputSchema } from './output-schema.js';

type MultimodalPrompt = {
  content: Array<TextPart | ImagePart>;
};

interface PredictionContext {
  chartUrl: string;
  symbolId: string;
  timeframe: string;
  currentTime: string;
  candlesVisible: number;
  predictionHorizon: string;
}

let currentContext: PredictionContext | undefined;

const CONTEXT_NOT_SET_ERROR =
  'Prediction context not set. Call setContext before running the agent.';
const NOT_IMPLEMENTED_ERROR =
  'Compaction not implemented for stateless prediction agent.';

export function setContext(ctx: PredictionContext): void {
  currentContext = ctx;
}

export function clearContext(): void {
  currentContext = undefined;
}

export function createChartPredictor(modelId: string) {
  const agentId = `chart_predictor_${modelId.replaceAll('/', '_')}`;

  return defineAgent({
    id: agentId,
    systemPrompt: `You are an expert technical analyst making PREDICTIONS about future chart patterns.

Your task is to analyze the CURRENT chart and PREDICT what the patterns will be in the NEXT time period.

This requires:
1. Understanding current trend direction and momentum
2. Identifying where price is relative to key indicators (VWAP, Bollinger Bands)
3. Recognizing pattern formations that suggest future moves
4. Extrapolating likely outcomes based on technical analysis

Think step by step. Base your predictions on what the current chart suggests will happen next.
Return ONLY valid JSON matching the schema.`,

    outputSchema: ChartPredictionOutputSchema,
    stateless: true,

    buildRoundPrompt: (): MultimodalPrompt => {
      if (currentContext === undefined) {
        throw new Error(CONTEXT_NOT_SET_ERROR);
      }

      const { chartUrl, symbolId, timeframe, currentTime, candlesVisible, predictionHorizon } =
        currentContext;

      const textPart: TextPart = {
        type: 'text',
        text: `You are viewing a ${timeframe} candlestick chart for ${symbolId}.
The chart shows the last ${candlesVisible} candles.
Current time: ${currentTime}

**YOUR TASK: PREDICT what will happen in the NEXT ${predictionHorizon}**

The chart shows:
- Candlesticks (green = bullish, red = bearish)
- VWAP (Volume Weighted Average Price) - purple line
- Bollinger Bands (upper, middle, lower) - blue bands
- SMA(20) and EMA(20)
- Volume bars at bottom

Based on what you see NOW, predict what will happen NEXT:

1. **uptrend_pullback_to_vwap** (boolean)
   - Look at current trend: Is it bullish? Is it losing momentum?
   - Where is price relative to VWAP now?
   - PREDICT: In the next ${predictionHorizon}, will price be in an uptrend AND pulling back to VWAP?

2. **volatility_direction_combo** (enum)
   - Current volatility: Large or small candles?
   - Current direction: Trending up, down, or sideways?
   - PREDICT: What will the volatility + direction combination be in the next period?
   - Options: high_vol_bullish, high_vol_bearish, low_vol_drift_up, low_vol_drift_down, consolidation

3. **tested_and_held_support** (boolean)
   - Is price approaching lower Bollinger Band or support?
   - Is there buying pressure (volume, wick rejections)?
   - PREDICT: Will price test support AND hold (bounce) in the next period?

4. **breakout_with_volume** (boolean)
   - Is price approaching upper Bollinger Band or resistance?
   - Is volume building up?
   - PREDICT: Will price break above resistance WITH above-average volume?

5. **potential_reversal_at_support** (boolean)
   - Is price at or near a support level?
   - Are there signs of reversal forming (hammer, engulfing)?
   - PREDICT: Will a bullish reversal pattern form at support?

6. **overall_bias** (enum)
   - Count current bullish signals vs bearish signals
   - Consider momentum and trend strength
   - PREDICT: What will the overall market bias be?
   - Options: strongly_bullish, mildly_bullish, neutral, mildly_bearish, strongly_bearish

Also provide:
- **meta**: Read base_quote, venue, timeframe from chart title
- **active_readout**: Current OHLC values (from info ribbon)

Return ONLY valid JSON. Do not include commentary.`,
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

