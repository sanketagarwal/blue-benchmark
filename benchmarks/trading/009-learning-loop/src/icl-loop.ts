/**
 * Enhanced In-Context Learning Loop
 * 
 * Tests whether vision LLMs can learn from feedback and improve accuracy.
 * 
 * Flow:
 * 1. Baseline: Initial analysis (no prior context)
 * 2. Same Chart + Feedback: Re-analyze same chart with feedback (memorization)
 * 3. Similar Chart: Analyze a chart with same pattern conditions (transfer)
 * 4. Multiple Similar Charts: Continue testing transfer learning
 * 
 * Uses proper conversation state (array of messages, not string concatenation).
 */

import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { ChartReadingOutputSchema, type ChartReadingOutput } from './output-schema.js';
import { scoreChartReading, type ChartReadingScore } from './scorers/index.js';
import { generateFeedback } from './feedback.js';
import { computeVWAP } from './ground-truth/index.js';
import { 
  createSessionTrace, 
  trackGeneration, 
  trackAccuracy, 
  flushLangfuse,
  registerPrompts,
  getPromptVersion,
} from './tracing.js';
import type { Candle } from './replay-lab/ohlcv.js';

// Types for message content
interface TextContent {
  type: 'text';
  text: string;
}

interface ImageContent {
  type: 'image';
  image: string;
}

type MessageContent = string | Array<TextContent | ImageContent>;

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: MessageContent;
}

export interface ICLRoundInput {
  chartUrl: string;
  candles: Candle[];
  groundTruth: ChartReadingOutput;
  timeframe: string;
  symbolId: string;
}

export interface ICLRoundResult {
  prediction: ChartReadingOutput | null;
  score: ChartReadingScore;
  latencyMs: number;
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
  error?: string;
}

export interface ICLSessionResult {
  sessionId: string;
  modelId: string;
  
  // Round results
  baseline: ICLRoundResult;
  sameChart: ICLRoundResult;
  similarCharts: ICLRoundResult[];
  
  // Feedback provided
  feedbackProvided: string;
  
  // Aggregate metrics
  baselineAccuracy: number;
  memorizationAccuracy: number;
  transferAccuracies: number[];
  
  // Deltas
  memorizationDelta: number;
  avgTransferDelta: number;
  
  // Learning curve
  learningCurve: Array<{ round: number; accuracy: number; delta: number }>;
}

/**
 * System prompt for chart analysis
 */
const SYSTEM_PROMPT = `You are an expert technical analyst. Your task is to analyze candlestick charts and extract structured information.

CRITICAL: You must carefully observe the chart and provide accurate answers. Do not guess.

For each field, look at the specific visual elements:
- VWAP (purple line) - Volume Weighted Average Price
- Bollinger Bands (blue bands) - Upper, Middle, Lower bands
- Candlesticks - Green = bullish, Red = bearish
- Volume bars at the bottom

Return ONLY valid JSON matching the schema. No commentary.`;

/**
 * Build the analysis prompt for a chart
 */
function buildAnalysisPrompt(
  timeframe: string,
  symbolId: string,
  candlesVisible: number
): string {
  return `Analyze this ${timeframe} candlestick chart for ${symbolId}.
The chart shows approximately ${candlesVisible} candles.

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
   - Options: bullish, mildly_bullish, neutral, mildly_bearish, bearish

Return ONLY valid JSON. No explanation.`;
}

/**
 * Create the AI client using Vercel AI Gateway
 */
function createAIClient() {
  const apiKey = process.env['AI_GATEWAY_API_KEY'];
  const baseUrl = process.env['AI_GATEWAY_BASE_URL'] ?? 'https://ai-gateway.vercel.sh/v1';
  
  if (!apiKey) {
    throw new Error('AI_GATEWAY_API_KEY environment variable is required');
  }
  
  return createOpenAI({
    apiKey,
    baseURL: baseUrl,
  });
}

/**
 * Run a single analysis round with the current conversation state
 */
async function runAnalysisRound(
  client: ReturnType<typeof createOpenAI>,
  modelId: string,
  messages: Message[],
  chartUrl: string,
  timeframe: string,
  symbolId: string,
  candlesVisible: number,
  feedback?: string
): Promise<{ prediction: ChartReadingOutput | null; latencyMs: number; tokensUsed?: { prompt: number; completion: number; total: number }; error?: string }> {
  const startMs = Date.now();
  
  try {
    // Build the user message with optional feedback
    let promptText = '';
    if (feedback) {
      promptText = `${feedback}\n\n---\n\nNow analyze the following chart, applying what you learned:\n\n`;
    }
    promptText += buildAnalysisPrompt(timeframe, symbolId, candlesVisible);
    
    // Create the user message with text and image
    const userContent: Array<TextContent | ImageContent> = [
      { type: 'text', text: promptText },
      { type: 'image', image: chartUrl },
    ];
    
    const newUserMessage: Message = { role: 'user', content: userContent };
    const fullMessages = [...messages, newUserMessage];
    
    // Call the model
    const result = await generateObject({
      model: client.chat(modelId) as Parameters<typeof generateObject>[0]['model'],
      schema: ChartReadingOutputSchema,
      system: SYSTEM_PROMPT,
      messages: fullMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });
    
    const latencyMs = Date.now() - startMs;
    const usage = result.usage as { promptTokens: number; completionTokens: number; totalTokens: number };
    
    return {
      prediction: result.object as ChartReadingOutput,
      latencyMs,
      tokensUsed: {
        prompt: usage.promptTokens,
        completion: usage.completionTokens,
        total: usage.totalTokens,
      },
    };
  } catch (error) {
    return {
      prediction: null,
      latencyMs: Date.now() - startMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Compute feedback context from candles
 */
function computeFeedbackContext(candles: Candle[]) {
  const lastCandle = candles[candles.length - 1]!;
  const last10 = candles.slice(-10);
  const firstClose = last10[0]?.close ?? lastCandle.close;
  
  const vwap = computeVWAP(candles);
  const avgVolume = candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;
  const priceChangePct = ((lastCandle.close - firstClose) / firstClose) * 100;
  
  const avgRange = last10.reduce((sum, c) => sum + (c.high - c.low), 0) / last10.length;
  const avgPrice = last10.reduce((sum, c) => sum + c.close, 0) / last10.length;
  const volatilityPct = (avgRange / avgPrice) * 100;

  return {
    vwap,
    lastClose: lastCandle.close,
    avgVolume,
    lastVolume: lastCandle.volume,
    priceChangePct,
    volatilityPct,
  };
}

/**
 * Run a complete ICL session
 * 
 * @param modelId - The model to test
 * @param baselineInput - The initial chart for baseline and memorization
 * @param similarInputs - Similar charts for transfer testing
 * @param verbose - Enable verbose logging
 */
export async function runICLSession(
  modelId: string,
  baselineInput: ICLRoundInput,
  similarInputs: ICLRoundInput[],
  verbose = false
): Promise<ICLSessionResult> {
  const sessionId = `icl_${modelId.replace(/\//g, '_')}_${Date.now()}`;
  const log = (msg: string) => verbose && console.log(msg);
  
  const client = createAIClient();
  
  // Conversation state - accumulates across rounds
  const conversationHistory: Message[] = [];
  
  // ========================================================================
  // ROUND 1: BASELINE (no prior context)
  // ========================================================================
  log('\n  📊 Round 1: Baseline analysis');
  
  const baselineTrace = createSessionTrace({
    sessionId,
    modelId,
    roundNumber: 1,
    roundType: 'baseline',
    chartUrl: baselineInput.chartUrl,
    timeframe: baselineInput.timeframe,
  });
  
  const baselineResult = await runAnalysisRound(
    client,
    modelId,
    conversationHistory,
    baselineInput.chartUrl,
    baselineInput.timeframe,
    baselineInput.symbolId,
    baselineInput.candles.length
  );
  
  const baselineScore = baselineResult.prediction 
    ? scoreChartReading(baselineResult.prediction, baselineInput.groundTruth)
    : { accuracy: 0, exactMatchCount: 0, totalFields: 6, fieldScores: {} as ChartReadingScore['fieldScores'] };
  
  // Track in Langfuse
  if (baselineResult.prediction) {
    trackGeneration(baselineTrace, {
      prompt: buildAnalysisPrompt(baselineInput.timeframe, baselineInput.symbolId, baselineInput.candles.length),
      promptName: 'icl-baseline',
      imageCount: 1,
      feedbackIncluded: false,
    }, {
      response: baselineResult.prediction,
      accuracy: baselineScore.accuracy,
      exactMatches: baselineScore.exactMatchCount,
      latencyMs: baselineResult.latencyMs,
      tokensUsed: baselineResult.tokensUsed,
    }, modelId);
    
    trackAccuracy(baselineTrace, {
      accuracy: baselineScore.accuracy,
      exactMatches: baselineScore.exactMatchCount,
      totalFields: 6,
      fieldResults: baselineScore.fieldScores as unknown as Record<string, number>,
    });
  }
  
  baselineTrace.update({ output: { accuracy: baselineScore.accuracy } });
  
  log(`     Accuracy: ${(baselineScore.accuracy * 100).toFixed(1)}%`);
  
  // Add to conversation history
  if (baselineResult.prediction) {
    conversationHistory.push({
      role: 'user',
      content: [
        { type: 'text', text: buildAnalysisPrompt(baselineInput.timeframe, baselineInput.symbolId, baselineInput.candles.length) },
        { type: 'image', image: baselineInput.chartUrl },
      ],
    });
    conversationHistory.push({
      role: 'assistant',
      content: JSON.stringify(baselineResult.prediction),
    });
  }
  
  // ========================================================================
  // GENERATE FEEDBACK
  // ========================================================================
  log('\n  📝 Generating feedback...');
  
  let feedbackText: string;
  if (baselineResult.prediction) {
    const feedbackContext = computeFeedbackContext(baselineInput.candles);
    feedbackText = generateFeedback({
      groundTruth: baselineInput.groundTruth,
      prediction: baselineResult.prediction,
      context: feedbackContext,
    });
  } else {
    feedbackText = 'Your previous analysis failed. Please try again carefully.';
  }
  
  // ========================================================================
  // ROUND 2: SAME CHART (memorization test)
  // ========================================================================
  log('\n  🔄 Round 2: Same chart with feedback (memorization)');
  
  const sameChartTrace = createSessionTrace({
    sessionId,
    modelId,
    roundNumber: 2,
    roundType: 'same_chart',
    chartUrl: baselineInput.chartUrl,
    timeframe: baselineInput.timeframe,
  });
  
  const sameChartResult = await runAnalysisRound(
    client,
    modelId,
    conversationHistory,
    baselineInput.chartUrl, // Same chart
    baselineInput.timeframe,
    baselineInput.symbolId,
    baselineInput.candles.length,
    feedbackText
  );
  
  const sameChartScore = sameChartResult.prediction
    ? scoreChartReading(sameChartResult.prediction, baselineInput.groundTruth)
    : { accuracy: 0, exactMatchCount: 0, totalFields: 6, fieldScores: {} as ChartReadingScore['fieldScores'] };
  
  // Track in Langfuse
  if (sameChartResult.prediction) {
    trackGeneration(sameChartTrace, {
      prompt: feedbackText + '\n\n' + buildAnalysisPrompt(baselineInput.timeframe, baselineInput.symbolId, baselineInput.candles.length),
      promptName: 'icl-same-chart-feedback',
      imageCount: 1,
      feedbackIncluded: true,
    }, {
      response: sameChartResult.prediction,
      accuracy: sameChartScore.accuracy,
      exactMatches: sameChartScore.exactMatchCount,
      latencyMs: sameChartResult.latencyMs,
      tokensUsed: sameChartResult.tokensUsed,
    }, modelId);
    
    trackAccuracy(sameChartTrace, {
      accuracy: sameChartScore.accuracy,
      exactMatches: sameChartScore.exactMatchCount,
      totalFields: 6,
      fieldResults: sameChartScore.fieldScores as unknown as Record<string, number>,
      deltaFromBaseline: sameChartScore.accuracy - baselineScore.accuracy,
    });
  }
  
  sameChartTrace.update({ 
    output: { 
      accuracy: sameChartScore.accuracy,
      deltaFromBaseline: sameChartScore.accuracy - baselineScore.accuracy,
    } 
  });
  
  log(`     Accuracy: ${(sameChartScore.accuracy * 100).toFixed(1)}% (${(sameChartScore.accuracy - baselineScore.accuracy >= 0 ? '+' : '')}${((sameChartScore.accuracy - baselineScore.accuracy) * 100).toFixed(1)}%)`);
  
  // Add feedback + response to conversation history
  if (sameChartResult.prediction) {
    conversationHistory.push({
      role: 'user',
      content: [
        { type: 'text', text: feedbackText + '\n\n---\n\n' + buildAnalysisPrompt(baselineInput.timeframe, baselineInput.symbolId, baselineInput.candles.length) },
        { type: 'image', image: baselineInput.chartUrl },
      ],
    });
    conversationHistory.push({
      role: 'assistant',
      content: JSON.stringify(sameChartResult.prediction),
    });
  }
  
  // ========================================================================
  // ROUNDS 3+: SIMILAR CHARTS (transfer test)
  // ========================================================================
  const similarResults: ICLRoundResult[] = [];
  const transferAccuracies: number[] = [];
  
  for (let i = 0; i < similarInputs.length; i++) {
    const input = similarInputs[i]!;
    const roundNum = i + 3;
    
    log(`\n  🔬 Round ${roundNum}: Similar chart #${i + 1} (transfer)`);
    
    const transferTrace = createSessionTrace({
      sessionId,
      modelId,
      roundNumber: roundNum,
      roundType: 'similar_chart',
      chartUrl: input.chartUrl,
      timeframe: input.timeframe,
    });
    
    // Build transfer prompt based on baseline accuracy
    // High accuracy = confidence retention, Low accuracy = field-specific focus
    const baselineWrongFields = Object.entries(baselineScore.fieldScores)
      .filter(([_, score]) => score === 0)
      .map(([field]) => field);
    
    const baselineCorrectFields = Object.entries(baselineScore.fieldScores)
      .filter(([_, score]) => score === 1)
      .map(([field]) => field);
    
    let transferPrompt: string;
    
    // For HIGH BASELINE (≥70%): Reset conversation to avoid contamination
    // The model seeing its previous predictions causes it to introduce NEW errors
    const useResetConversation = baselineScore.accuracy >= 0.7;
    
    if (useResetConversation) {
      // HIGH ACCURACY: Reset conversation + confidence retention
      log(`     🔄 Using RESET conversation (high baseline ${(baselineScore.accuracy * 100).toFixed(0)}%)`);
      transferPrompt = `
🎯 FRESH ANALYSIS MODE (High Confidence)

You have strong chart analysis skills. Your methodology is sound.

📌 ANALYZE THIS CHART INDEPENDENTLY:
- Look at THIS specific chart image
- Evaluate each field based on what you SEE
- Do NOT assume any answers - analyze fresh

${baselineWrongFields.length > 0 ? `
💡 TIP: Pay attention to how you identify: ${baselineWrongFields.join(', ')}
` : ''}

This is a standalone analysis. Trust your methodology.

---

`;
    } else {
      // LOW/MEDIUM ACCURACY: Field-specific focus
      transferPrompt = `
📋 FIELD-SPECIFIC FOCUS MODE

This is a NEW, DIFFERENT chart. Analyze it FRESH.

🎯 FOCUS AREAS (fields you got wrong before):
${baselineWrongFields.map(f => `   • ${f} - Review the feedback for how to identify this correctly`).join('\n')}

✅ KEEP DOING (fields you got right):
${baselineCorrectFields.map(f => `   • ${f} - Your methodology worked, use the same approach`).join('\n')}

⚠️ CRITICAL REMINDERS:
- This chart has DIFFERENT data than before
- The correct answers may be DIFFERENT
- Analyze what you SEE, don't copy previous answers
- Each field must be evaluated based on THIS chart

---

`;
    }

    // For high baseline: use EMPTY conversation (reset)
    // For low/mid baseline: use full conversation history
    const messagesForTransfer = useResetConversation ? [] : conversationHistory;
    
    const transferResult = await runAnalysisRound(
      client,
      modelId,
      messagesForTransfer,
      input.chartUrl,
      input.timeframe,
      input.symbolId,
      input.candles.length,
      transferPrompt
    );
    
    const transferScore = transferResult.prediction
      ? scoreChartReading(transferResult.prediction, input.groundTruth)
      : { accuracy: 0, exactMatchCount: 0, totalFields: 6, fieldScores: {} as ChartReadingScore['fieldScores'] };
    
    // Track in Langfuse
    if (transferResult.prediction) {
      trackGeneration(transferTrace, {
        prompt: transferPrompt,
        promptName: useResetConversation ? 'icl-similar-chart-high-baseline' : 'icl-similar-chart-low-baseline',
        imageCount: 1,
        feedbackIncluded: true,
        resetConversation: useResetConversation,
      }, {
        response: transferResult.prediction,
        accuracy: transferScore.accuracy,
        exactMatches: transferScore.exactMatchCount,
        latencyMs: transferResult.latencyMs,
        tokensUsed: transferResult.tokensUsed,
      }, modelId);
      
      trackAccuracy(transferTrace, {
        accuracy: transferScore.accuracy,
        exactMatches: transferScore.exactMatchCount,
        totalFields: 6,
        fieldResults: transferScore.fieldScores as unknown as Record<string, number>,
        deltaFromBaseline: transferScore.accuracy - baselineScore.accuracy,
      });
    }
    
    transferTrace.update({
      output: {
        accuracy: transferScore.accuracy,
        deltaFromBaseline: transferScore.accuracy - baselineScore.accuracy,
      },
    });
    
    log(`     Accuracy: ${(transferScore.accuracy * 100).toFixed(1)}% (${(transferScore.accuracy - baselineScore.accuracy >= 0 ? '+' : '')}${((transferScore.accuracy - baselineScore.accuracy) * 100).toFixed(1)}% from baseline)`);
    
    similarResults.push({
      prediction: transferResult.prediction,
      score: transferScore,
      latencyMs: transferResult.latencyMs,
      tokensUsed: transferResult.tokensUsed,
      error: transferResult.error,
    });
    
    transferAccuracies.push(transferScore.accuracy);
    
    // Add to conversation
    if (transferResult.prediction) {
      conversationHistory.push({
        role: 'user',
        content: [
          { type: 'text', text: transferPrompt + buildAnalysisPrompt(input.timeframe, input.symbolId, input.candles.length) },
          { type: 'image', image: input.chartUrl },
        ],
      });
      conversationHistory.push({
        role: 'assistant',
        content: JSON.stringify(transferResult.prediction),
      });
    }
  }
  
  // ========================================================================
  // COMPUTE AGGREGATE METRICS
  // ========================================================================
  const baselineAccuracy = baselineScore.accuracy;
  const memorizationAccuracy = sameChartScore.accuracy;
  const memorizationDelta = memorizationAccuracy - baselineAccuracy;
  const avgTransferDelta = transferAccuracies.length > 0
    ? (transferAccuracies.reduce((a, b) => a + b, 0) / transferAccuracies.length) - baselineAccuracy
    : 0;
  
  // Build learning curve
  const learningCurve = [
    { round: 1, accuracy: baselineAccuracy, delta: 0 },
    { round: 2, accuracy: memorizationAccuracy, delta: memorizationDelta },
    ...similarResults.map((r, i) => ({
      round: i + 3,
      accuracy: r.score.accuracy,
      delta: r.score.accuracy - baselineAccuracy,
    })),
  ];
  
  // Flush Langfuse
  await flushLangfuse();
  
  return {
    sessionId,
    modelId,
    baseline: {
      prediction: baselineResult.prediction,
      score: baselineScore,
      latencyMs: baselineResult.latencyMs,
      tokensUsed: baselineResult.tokensUsed,
      error: baselineResult.error,
    },
    sameChart: {
      prediction: sameChartResult.prediction,
      score: sameChartScore,
      latencyMs: sameChartResult.latencyMs,
      tokensUsed: sameChartResult.tokensUsed,
      error: sameChartResult.error,
    },
    similarCharts: similarResults,
    feedbackProvided: feedbackText,
    baselineAccuracy,
    memorizationAccuracy,
    transferAccuracies,
    memorizationDelta,
    avgTransferDelta,
    learningCurve,
  };
}
