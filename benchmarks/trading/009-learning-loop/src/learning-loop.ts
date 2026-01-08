/**
 * 009 Learning Loop - Core Loop Logic
 * 
 * Runs the 3-round learning loop:
 * 1. Baseline: Initial analysis on original chart
 * 2. Same Chart: Re-analyze after feedback (memorization test)
 * 3. Different Timeframe: Analyze same period with different candle size (abstraction test)
 * 
 * Uses Replay Labs annotations (same as 007).
 */

import { runRound } from '@nullagent/agent-core';
import { createChartReader, setChartReaderContext, clearChartReaderContext } from './chart-reader.js';
import { computeGroundTruth, computeVWAP } from './ground-truth/index.js';
import { scoreChartReading, type ChartReadingScore } from './scorers/index.js';
import { generateFeedback } from './feedback.js';
import { getSignedChartUrl, STANDARD_CHART_LAYERS } from './replay-lab/charts.js';
import { getCandles, type CandleTimeframe, type Candle } from './replay-lab/ohlcv.js';
import { getLocalExtrema, type LocalExtremaAnnotation } from './replay-lab/annotations.js';
import { getIndicators, type ReplayLabIndicators } from './replay-lab/indicators.js';
import type { ChartReadingOutput } from './output-schema.js';
import type { GroundTruthInput, ChartMeta, IndicatorValues } from './ground-truth/index.js';

// Timeframe drill-down mapping (same time period, more granular candles)
const TIMEFRAME_DRILL_DOWN: Record<CandleTimeframe, CandleTimeframe> = {
  '4h': '1h',
  '1h': '15m',
  '15m': '5m',
  '5m': '1m',
  '1d': '4h',
  '1m': '1m', // Can't go lower
};

export interface LearningFrame {
  frameId: string;
  symbolId: string;
  originalTimeframe: CandleTimeframe;
  drillDownTimeframe: CandleTimeframe;
  from: Date;
  to: Date;
  candlesVisible: number;
}

export interface RoundResult {
  prediction: ChartReadingOutput | null;
  groundTruth: ChartReadingOutput;
  score: ChartReadingScore;
  chartUrl: string;
  error?: string;
}

export interface LearningLoopResult {
  frameId: string;
  modelId: string;
  
  // Round 1: Baseline
  baseline: RoundResult;
  
  // Round 2: Same chart after feedback
  sameChart: RoundResult;
  feedback: string;
  
  // Round 3: Different timeframe
  differentTimeframe: RoundResult;
  
  // Metrics
  baselineAccuracy: number;
  sameChartAccuracy: number;
  differentTimeframeAccuracy: number;
  memorizationDelta: number;    // sameChart - baseline
  abstractionDelta: number;     // differentTimeframe - baseline
}

function timeframeToMinutes(tf: CandleTimeframe): number {
  const map: Record<CandleTimeframe, number> = {
    '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440,
  };
  return map[tf];
}

/**
 * Compute indicator values from candles (same as 007)
 */
function computeIndicators(candles: Candle[]): IndicatorValues {
  if (candles.length === 0) {
    return { vwap: null, bb_upper: null, bb_lower: null, bb_mid: null, sma20: null, ema20: null };
  }

  const last20 = candles.slice(-20);
  const sma20 = last20.length >= 20
    ? last20.reduce((sum, c) => sum + c.close, 0) / 20
    : null;

  const ema20 = sma20;

  const totalVolume = candles.reduce((sum, c) => sum + c.volume, 0);
  const vwap = totalVolume > 0
    ? candles.reduce((sum, c) => sum + ((c.high + c.low + c.close) / 3) * c.volume, 0) / totalVolume
    : null;

  let bb_upper: number | null = null;
  let bb_lower: number | null = null;
  let bb_mid: number | null = null;

  if (sma20 !== null && last20.length >= 20) {
    const stdDev = Math.sqrt(
      last20.reduce((sum, c) => sum + Math.pow(c.close - sma20, 2), 0) / 20
    );
    bb_mid = sma20;
    bb_upper = sma20 + 2 * stdDev;
    bb_lower = sma20 - 2 * stdDev;
  }

  return { vwap, bb_upper, bb_lower, bb_mid, sma20, ema20 };
}

/**
 * Compute context data for feedback generation.
 */
function computeFeedbackContext(candles: Candle[]): {
  vwap: number;
  lastClose: number;
  avgVolume: number;
  lastVolume: number;
  priceChangePct: number;
  volatilityPct: number;
} {
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
 * Run a single analysis round.
 * Uses Replay Labs annotations AND indicators for ground truth.
 */
async function runAnalysisRound(
  modelId: string,
  chartUrl: string,
  symbolId: string,
  timeframe: CandleTimeframe,
  candles: Candle[],
  from: Date,
  to: Date,
  feedback?: string,
  verbose?: boolean
): Promise<RoundResult> {
  const log = (msg: string) => verbose && console.log(msg);
  
  // Fetch Replay Labs annotations for support/resistance
  let localExtrema: LocalExtremaAnnotation[] = [];
  try {
    localExtrema = await getLocalExtrema(symbolId, from, to);
    log(`      📊 Fetched ${localExtrema.length} local extrema from Replay Labs`);
  } catch (annotationError) {
    log(`      ⚠️ Could not fetch annotations, using computed support/resistance`);
  }

  // Fetch indicators from Replay Labs (VWAP, RSI, etc.)
  let replayLabIndicators: ReplayLabIndicators = {};
  try {
    replayLabIndicators = await getIndicators(symbolId, timeframe, to);
    if (replayLabIndicators.vwap) {
      log(`      📈 Fetched VWAP from Replay Labs: $${replayLabIndicators.vwap.toFixed(2)}`);
    }
  } catch (indicatorError) {
    log(`      ⚠️ Could not fetch indicators from Replay Labs`);
  }

  // Compute indicators from candles (fallback for what Replay Labs doesn't provide)
  const computedIndicators = computeIndicators(candles);
  
  // Merge: prefer Replay Labs values, fall back to computed
  const indicators: IndicatorValues = {
    vwap: replayLabIndicators.vwap ?? computedIndicators.vwap,
    bb_upper: computedIndicators.bb_upper,  // Replay Labs only has BBW (width), not bands
    bb_lower: computedIndicators.bb_lower,
    bb_mid: computedIndicators.bb_mid,
    sma20: computedIndicators.sma20,
    ema20: computedIndicators.ema20,
  };

  // Prepare ground truth input (same structure as 007)
  const meta: ChartMeta = {
    base_quote: 'Bitcoin / U.S. Dollar',
    venue: 'Coinbase',
    timeframe,
  };

  const groundTruthInput: GroundTruthInput = {
    candles,
    meta,
    indicators,
    timeframeMinutes: timeframeToMinutes(timeframe),
    localExtrema, // Pass Replay Labs annotations
  };

  const groundTruth = computeGroundTruth(groundTruthInput);

  // Set context for agent
  const candlesVisible = candles.length;
  setChartReaderContext({
    chartUrl,
    symbolId,
    timeframe,
    candlesVisible,
    feedback,
  });

  // Run model
  process.env['MODEL_ID'] = modelId;
  const agent = createChartReader(modelId);

  try {
    const result = await runRound(agent, '');
    const prediction = result.output as ChartReadingOutput;
    const score = scoreChartReading(prediction, groundTruth);

    clearChartReaderContext();

    return {
      prediction,
      groundTruth,
      score,
      chartUrl,
    };
  } catch (error) {
    clearChartReaderContext();
    
    // Return a zero-score result on error
    const zeroScore: ChartReadingScore = {
      totalAccuracy: 0,
      categoryScores: {
        meta: { accuracy: 0, breakdown: {} },
        active_readout: { accuracy: 0, breakdown: {} },
        multi_step: { accuracy: 0, breakdown: {} },
      },
    };

    return {
      prediction: null,
      groundTruth,
      score: zeroScore,
      chartUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run the complete learning loop for a single frame and model.
 */
export async function runLearningLoop(
  frame: LearningFrame,
  modelId: string,
  verbose: boolean = false
): Promise<LearningLoopResult> {
  const log = (msg: string) => verbose && console.log(msg);
  
  const { frameId, symbolId, originalTimeframe, drillDownTimeframe, from, to, candlesVisible } = frame;
  
  // ==========================================================================
  // ROUND 1: Baseline (Original Chart)
  // ==========================================================================
  log(`\n  📊 Round 1: Baseline analysis (${originalTimeframe})`);
  
  const originalChartUrl = await getSignedChartUrl({
    symbolId,
    timeframe: originalTimeframe,
    from,
    to,
    layers: STANDARD_CHART_LAYERS,
  });

  const originalCandles = await getCandles(
    symbolId,
    originalTimeframe,
    from,
    to,
    candlesVisible + 10
  );

  if (originalCandles.length < 10) {
    throw new Error(`Insufficient candles for baseline: ${originalCandles.length}`);
  }

  const baseline = await runAnalysisRound(
    modelId,
    originalChartUrl,
    symbolId,
    originalTimeframe,
    originalCandles,
    from,
    to,
    undefined, // No feedback for baseline
    verbose
  );

  log(`     Accuracy: ${baseline.score.totalAccuracy.toFixed(1)}%`);

  // ==========================================================================
  // GENERATE FEEDBACK
  // ==========================================================================
  log(`\n  📝 Generating feedback...`);
  
  const feedbackContext = computeFeedbackContext(originalCandles);
  
  let feedback: string;
  if (baseline.prediction) {
    feedback = generateFeedback({
      groundTruth: baseline.groundTruth,
      prediction: baseline.prediction,
      context: feedbackContext,
    });
  } else {
    // Model failed to produce output, generate minimal feedback
    feedback = `Your previous analysis failed to produce valid output. Here is the correct analysis:\n`;
    feedback += `- uptrend_pullback_to_vwap: ${String(baseline.groundTruth.multi_step.uptrend_pullback_to_vwap)}\n`;
    feedback += `- volatility_direction_combo: ${baseline.groundTruth.multi_step.volatility_direction_combo}\n`;
    feedback += `- tested_and_held_support: ${String(baseline.groundTruth.multi_step.tested_and_held_support)}\n`;
    feedback += `- breakout_with_volume: ${String(baseline.groundTruth.multi_step.breakout_with_volume)}\n`;
    feedback += `- potential_reversal_at_support: ${String(baseline.groundTruth.multi_step.potential_reversal_at_support)}\n`;
    feedback += `- overall_bias: ${baseline.groundTruth.multi_step.overall_bias}\n`;
  }

  // ==========================================================================
  // ROUND 2: Same Chart Re-test (Memorization)
  // ==========================================================================
  log(`\n  🔄 Round 2: Same chart with feedback (${originalTimeframe})`);
  
  const sameChart = await runAnalysisRound(
    modelId,
    originalChartUrl,  // EXACT SAME URL
    symbolId,
    originalTimeframe,
    originalCandles,
    from,
    to,
    feedback,  // Include feedback in context
    verbose
  );

  log(`     Accuracy: ${sameChart.score.totalAccuracy.toFixed(1)}%`);

  // ==========================================================================
  // ROUND 3: Different Timeframe (Abstraction)
  // ==========================================================================
  log(`\n  🔬 Round 3: Different timeframe (${drillDownTimeframe})`);
  
  // Get chart for same time period but different timeframe
  const drillDownChartUrl = await getSignedChartUrl({
    symbolId,
    timeframe: drillDownTimeframe,
    from,
    to,
    layers: STANDARD_CHART_LAYERS,
  });

  // Get candles for the drill-down timeframe
  const drillDownTfMinutes = timeframeToMinutes(drillDownTimeframe);
  const periodMs = to.getTime() - from.getTime();
  const expectedCandles = Math.ceil(periodMs / (drillDownTfMinutes * 60 * 1000));
  
  const drillDownCandles = await getCandles(
    symbolId,
    drillDownTimeframe,
    from,
    to,
    expectedCandles + 10
  );

  if (drillDownCandles.length < 10) {
    throw new Error(`Insufficient candles for drill-down: ${drillDownCandles.length}`);
  }

  const differentTimeframe = await runAnalysisRound(
    modelId,
    drillDownChartUrl,
    symbolId,
    drillDownTimeframe,
    drillDownCandles,
    from,
    to,
    feedback,  // Include same feedback
    verbose
  );

  log(`     Accuracy: ${differentTimeframe.score.totalAccuracy.toFixed(1)}%`);

  // ==========================================================================
  // COMPUTE METRICS
  // ==========================================================================
  const baselineAccuracy = baseline.score.totalAccuracy;
  const sameChartAccuracy = sameChart.score.totalAccuracy;
  const differentTimeframeAccuracy = differentTimeframe.score.totalAccuracy;
  
  const memorizationDelta = sameChartAccuracy - baselineAccuracy;
  const abstractionDelta = differentTimeframeAccuracy - baselineAccuracy;

  log(`\n  📈 Results:`);
  log(`     Baseline:        ${baselineAccuracy.toFixed(1)}%`);
  log(`     Same Chart:      ${sameChartAccuracy.toFixed(1)}% (${memorizationDelta >= 0 ? '+' : ''}${memorizationDelta.toFixed(1)}%)`);
  log(`     Diff Timeframe:  ${differentTimeframeAccuracy.toFixed(1)}% (${abstractionDelta >= 0 ? '+' : ''}${abstractionDelta.toFixed(1)}%)`);

  return {
    frameId,
    modelId,
    baseline,
    sameChart,
    feedback,
    differentTimeframe,
    baselineAccuracy,
    sameChartAccuracy,
    differentTimeframeAccuracy,
    memorizationDelta,
    abstractionDelta,
  };
}

/**
 * Generate learning frames for the benchmark.
 */
export async function generateLearningFrames(
  symbolId: string,
  timeframes: CandleTimeframe[],
  samplesPerTimeframe: number,
  startTime: Date
): Promise<LearningFrame[]> {
  const frames: LearningFrame[] = [];
  
  for (const timeframe of timeframes) {
    const drillDownTimeframe = TIMEFRAME_DRILL_DOWN[timeframe];
    const tfMinutes = timeframeToMinutes(timeframe);
    const candlesPerChart = 30;
    const chartDurationMs = candlesPerChart * tfMinutes * 60 * 1000;

    for (let i = 0; i < samplesPerTimeframe; i++) {
      const offsetMs = i * tfMinutes * 60 * 1000 * 10; // Offset by 10 candles
      const to = new Date(startTime.getTime() - offsetMs);
      const from = new Date(to.getTime() - chartDurationMs);
      
      frames.push({
        frameId: `${timeframe}_${String(i + 1).padStart(2, '0')}`,
        symbolId,
        originalTimeframe: timeframe,
        drillDownTimeframe,
        from,
        to,
        candlesVisible: candlesPerChart,
      });
    }
  }

  return frames;
}
