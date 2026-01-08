/**
 * Multi-Step Reasoning Benchmark CLI
 *
 * Tests vision LLMs' ability to combine multiple chart signals
 * into compound trading conclusions.
 *
 * Tests 6 multi-step reasoning fields.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createBenchmarkLogger } from '@nullagent/cli-utils';
import { runRound } from '@nullagent/agent-core';

import { createChartReader, setChartReaderContext, clearChartReaderContext } from './chart-reader.js';
import { getSignedChartUrl, STANDARD_CHART_LAYERS } from './replay-lab/charts.js';
import { getCandles } from './replay-lab/ohlcv.js';
import { getLocalExtrema } from './replay-lab/annotations.js';
import { computeGroundTruth } from './ground-truth/index.js';
import { scoreChartReading } from './scorers/index.js';
import { loadModelMatrix } from './matrix.js';
import { writeResultsFile, writeJsonResultsFile, writePerFrameResults } from './results-writer.js';

import type { ChartParams } from './replay-lab/charts.js';
import type { CandleTimeframe } from './replay-lab/ohlcv.js';
import type { LocalExtremaAnnotation } from './replay-lab/annotations.js';
import type { GroundTruthInput, ChartMeta, IndicatorValues } from './ground-truth/index.js';
import type { ChartReadingOutput } from './output-schema.js';
import type { BenchmarkResults, ModelResult, FrameResult } from './results-writer.js';

// =============================================================================
// Configuration
// =============================================================================

interface BenchmarkConfig {
  symbolId: string;
  timeframes: CandleTimeframe[];
  samplesPerTimeframe: number;
  startTime: Date;
  verbose: boolean;
  debug: boolean;  // NEW: Show full model input/output
  quickMode: boolean;
  singleModel?: string;
}

function getConfig(): BenchmarkConfig {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const debug = args.includes('--debug');  // NEW
  const quickMode = args.includes('--quick');
  const modelArg = args.find((a) => a.startsWith('--model='));
  const singleModel = modelArg?.split('=')[1];

  const symbolId = process.env['SYMBOL_ID'] ?? 'COINBASE_SPOT_BTC_USD';
  const startTimeStr = process.env['SIMULATION_START_TIME'] ?? '2025-12-20T12:00:00Z';
  const startTime = new Date(startTimeStr);

  const config: BenchmarkConfig = {
    symbolId,
    timeframes: ['15m', '1h', '4h'] as CandleTimeframe[],
    samplesPerTimeframe: quickMode ? 2 : 5,
    startTime,
    verbose,
    debug,  // NEW
    quickMode,
  };

  if (singleModel !== undefined) {
    config.singleModel = singleModel;
  }

  return config;
}

// =============================================================================
// Frame Sampling
// =============================================================================

interface ChartFrame {
  frameId: string;
  symbolId: string;
  timeframe: CandleTimeframe;
  from: Date;
  to: Date;
  chartUrl: string;
  groundTruth: ChartReadingOutput;
}

/**
 * Get timeframe duration in minutes
 */
function timeframeToMinutes(tf: CandleTimeframe): number {
  const map: Record<CandleTimeframe, number> = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '1h': 60,
    '4h': 240,
    '1d': 1440,
  };
  return map[tf];
}

/**
 * Compute indicator values from candles
 */
function computeIndicators(candles: { open: number; high: number; low: number; close: number; volume: number }[]): IndicatorValues {
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
 * Generate chart frames for sampling
 */
async function generateFrames(config: BenchmarkConfig, logger: ReturnType<typeof createBenchmarkLogger>): Promise<ChartFrame[]> {
  const frames: ChartFrame[] = [];
  const { symbolId, timeframes, samplesPerTimeframe, startTime } = config;

  for (const timeframe of timeframes) {
    const tfMinutes = timeframeToMinutes(timeframe);
    const candlesPerChart = 30;
    const chartDurationMs = candlesPerChart * tfMinutes * 60 * 1000;

    for (let i = 0; i < samplesPerTimeframe; i++) {
      const offsetMs = i * tfMinutes * 60 * 1000 * 5;
      const toTime = new Date(startTime.getTime() - offsetMs);
      const fromTime = new Date(toTime.getTime() - chartDurationMs);
      const frameId = `${timeframe}_${String(i + 1).padStart(2, '0')}`;

      logger.log(`  Generating frame: ${frameId}`);

      try {
        const chartParams: ChartParams = {
          symbolId,
          timeframe,
          from: fromTime,
          to: toTime,
          layers: STANDARD_CHART_LAYERS,
        };
        const chartUrl = await getSignedChartUrl(chartParams);

        const candles = await getCandles(symbolId, timeframe, fromTime, toTime, candlesPerChart + 10);

        if (candles.length < 10) {
          logger.log(`    ⚠️ Insufficient candles (${String(candles.length)}), skipping`);
          continue;
        }

        // Fetch Replay Labs annotations for support/resistance
        let localExtrema: LocalExtremaAnnotation[] = [];
        try {
          localExtrema = await getLocalExtrema(symbolId, fromTime, toTime);
          logger.log(`    📊 Fetched ${String(localExtrema.length)} local extrema from Replay Labs`);
        } catch (annotationError) {
          // Annotations are optional - fall back to computed BB
          logger.log(`    ⚠️ Could not fetch annotations, using computed support/resistance`);
        }

        const meta: ChartMeta = {
          base_quote: 'Bitcoin / U.S. Dollar',
          venue: 'Coinbase',
          timeframe,
        };

        const indicators = computeIndicators(candles);

        const groundTruthInput: GroundTruthInput = {
          candles,
          meta,
          indicators,
          timeframeMinutes: tfMinutes,
          localExtrema, // NEW: Pass Replay Labs annotations
        };

        const groundTruth = computeGroundTruth(groundTruthInput);

        frames.push({
          frameId,
          symbolId,
          timeframe,
          from: fromTime,
          to: toTime,
          chartUrl,
          groundTruth,
        });

        logger.log(`    ✓ Frame ready`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.log(`    ✗ Error: ${message}`);
      }
    }
  }

  return frames;
}

// =============================================================================
// Model Evaluation
// =============================================================================

/**
 * Print debug info for a frame evaluation
 */
function printDebugInfo(
  logger: ReturnType<typeof createBenchmarkLogger>,
  frame: ChartFrame,
  prediction: ChartReadingOutput | null,
  score: ReturnType<typeof scoreChartReading> | null
): void {
  logger.log('');
  logger.log('    ╔══════════════════════════════════════════════════════════════════╗');
  logger.log('    ║                          DEBUG OUTPUT                             ║');
  logger.log('    ╚══════════════════════════════════════════════════════════════════╝');
  logger.log('');
  logger.log(`    📊 CHART URL (open in browser to verify):`);
  logger.log(`    ${frame.chartUrl}`);
  logger.log('');
  logger.log('    ════════════════════════════════════════════════════════════════════');
  logger.log('    📋 GROUND TRUTH (computed from raw OHLCV data):');
  logger.log('    ════════════════════════════════════════════════════════════════════');
  const gt = frame.groundTruth.multi_step;
  logger.log(`    uptrend_pullback_to_vwap:     ${String(gt.uptrend_pullback_to_vwap)}`);
  logger.log(`    volatility_direction_combo:  ${gt.volatility_direction_combo}`);
  logger.log(`    tested_and_held_support:     ${String(gt.tested_and_held_support)}`);
  logger.log(`    breakout_with_volume:        ${String(gt.breakout_with_volume)}`);
  logger.log(`    potential_reversal_at_support: ${String(gt.potential_reversal_at_support)}`);
  logger.log(`    overall_bias:                ${gt.overall_bias}`);
  logger.log('');
  
  if (prediction) {
    logger.log('    ════════════════════════════════════════════════════════════════════');
    logger.log('    🤖 MODEL PREDICTION:');
    logger.log('    ════════════════════════════════════════════════════════════════════');
    const pred = prediction.multi_step;
    logger.log(`    uptrend_pullback_to_vwap:     ${String(pred.uptrend_pullback_to_vwap)}`);
    logger.log(`    volatility_direction_combo:  ${pred.volatility_direction_combo}`);
    logger.log(`    tested_and_held_support:     ${String(pred.tested_and_held_support)}`);
    logger.log(`    breakout_with_volume:        ${String(pred.breakout_with_volume)}`);
    logger.log(`    potential_reversal_at_support: ${String(pred.potential_reversal_at_support)}`);
    logger.log(`    overall_bias:                ${pred.overall_bias}`);
    logger.log('');
    
    if (score) {
      logger.log('    ════════════════════════════════════════════════════════════════════');
      logger.log('    📊 COMPARISON (✓ = match, ✗ = mismatch):');
      logger.log('    ════════════════════════════════════════════════════════════════════');
      const fields = ['uptrend_pullback_to_vwap', 'volatility_direction_combo', 'tested_and_held_support', 
                      'breakout_with_volume', 'potential_reversal_at_support', 'overall_bias'] as const;
      for (const field of fields) {
        const fieldScore = score.fieldScores[field];
        const icon = fieldScore === 1 ? '✓' : fieldScore === 0.5 ? '~' : '✗';
        const gtVal = String(gt[field]);
        const predVal = String(pred[field]);
        logger.log(`    ${icon} ${field.padEnd(30)} GT: ${gtVal.padEnd(20)} PRED: ${predVal}`);
      }
      logger.log('');
      logger.log(`    ACCURACY: ${(score.accuracy * 100).toFixed(1)}% (${score.exactMatchCount}/6 exact matches)`);
    }
  }
  logger.log('');
  logger.log('    ══════════════════════════════════════════════════════════════════');
  logger.log('');
}

/**
 * Evaluate a single model on all frames
 */
async function evaluateModel(
  modelId: string,
  frames: ChartFrame[],
  logger: ReturnType<typeof createBenchmarkLogger>,
  verbose: boolean,
  debug: boolean  // NEW
): Promise<ModelResult> {
  const agent = createChartReader(modelId);
  const frameResults: FrameResult[] = [];
  let failures = 0;
  let successCount = 0;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (!frame) continue;

    logger.log(`  Frame ${String(i + 1)}/${String(frames.length)}: ${frame.frameId}`);

    const startMs = Date.now();
    let prediction: ChartReadingOutput | null = null;
    let error: string | null = null;

    try {
      setChartReaderContext({
        chartUrl: frame.chartUrl,
        symbolId: frame.symbolId,
        timeframe: frame.timeframe,
        currentTime: frame.to.toISOString(),
      });

      const result = await runRound<ChartReadingOutput>(agent, {
        modelId,
        traceId: `${modelId}_${frame.frameId}_${i}`,
      });

      clearChartReaderContext();

      prediction = result.output;

      if (prediction === null) {
        error = 'No output from model';
        failures++;
      } else {
        successCount++;
      }
    } catch (err) {
      clearChartReaderContext();
      error = err instanceof Error ? err.message : String(err);
      failures++;
    }

    const durationMs = Date.now() - startMs;

    // Score if we have a prediction
    const score = prediction ? scoreChartReading(prediction, frame.groundTruth) : null;

    // Create frame result
    const frameResult: FrameResult = {
      frameId: frame.frameId,
      timeframe: frame.timeframe,
      chartUrl: frame.chartUrl,
      timestamp: frame.to.toISOString(),
      prediction,
      groundTruth: frame.groundTruth,
      score,
      error,
      durationMs,
    };

    frameResults.push(frameResult);

    // Log result
    if (error) {
      logger.log(`    ✗ Error: ${error} (${durationMs}ms)`);
    } else if (debug && prediction) {
      // NEW: Full debug output
      printDebugInfo(logger, frame, prediction, score);
    } else if (verbose && score) {
      logger.log(`    ✓ Accuracy: ${(score.accuracy * 100).toFixed(1)}% (${score.exactMatchCount}/6 exact) (${durationMs}ms)`);
    } else {
      logger.log(`    ✓ Success (${durationMs}ms)`);
    }
  }

  return {
    modelId,
    frames: frameResults,
    failures,
    successCount,
  };
}

// =============================================================================
// Results Output
// =============================================================================

function printSummary(results: ModelResult[], logger: ReturnType<typeof createBenchmarkLogger>): void {
  logger.newline();
  logger.header('📊 Summary');
  logger.newline();

  for (const r of results) {
    logger.log(`${r.modelId}:`);
    logger.log(`  Frames: ${r.successCount} success, ${r.failures} failed`);
    
    const scoredFrames = r.frames.filter((f) => f.score !== null);
    if (scoredFrames.length > 0) {
      const avgAccuracy = scoredFrames.reduce((s, f) => s + (f.score?.accuracy ?? 0), 0) / scoredFrames.length;
      const avgExact = scoredFrames.reduce((s, f) => s + (f.score?.exactMatchCount ?? 0), 0) / scoredFrames.length;
      
      logger.log(`  Avg Accuracy: ${(avgAccuracy * 100).toFixed(1)}%`);
      logger.log(`  Avg Exact Matches: ${avgExact.toFixed(1)}/6`);
    }
    logger.newline();
  }
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<void> {
  const logger = createBenchmarkLogger(true);
  const config = getConfig();
  const startedAt = new Date();

  logger.header('Multi-Step Reasoning Benchmark');
  logger.newline();
  logger.log(`Testing: 6 multi-step reasoning fields (DETERMINISTIC)`);
  logger.log(`Symbol: ${config.symbolId}`);
  logger.log(`Timeframes: ${config.timeframes.join(', ')}`);
  logger.log(`Samples per timeframe: ${String(config.samplesPerTimeframe)}`);
  logger.log(`Mode: ${config.quickMode ? 'Quick' : 'Full'}`);
  if (config.debug) {
    logger.log(`🐛 DEBUG MODE: Full input/output logging enabled`);
  }
  if (config.singleModel) {
    logger.log(`Single model: ${config.singleModel}`);
  }
  logger.newline();

  // Load models
  const modelMatrix = loadModelMatrix();
  const models = config.singleModel
    ? modelMatrix.filter((m) => m.id === config.singleModel)
    : modelMatrix;

  if (models.length === 0) {
    logger.log('❌ No models found');
    return;
  }

  logger.log(`Models to evaluate: ${String(models.length)}`);
  logger.newline();

  // Generate frames
  logger.header('📸 Generating Chart Frames');
  logger.newline();
  const frames = await generateFrames(config, logger);
  logger.newline();
  logger.log(`Generated ${String(frames.length)} frames`);
  logger.newline();

  if (frames.length === 0) {
    logger.log('❌ No frames generated, exiting');
    return;
  }

  // Evaluate models
  const results: ModelResult[] = [];

  for (const model of models) {
    logger.header(`🤖 Evaluating: ${model.id}`);
    logger.newline();

    const result = await evaluateModel(model.id, frames, logger, config.verbose, config.debug);
    results.push(result);

    logger.newline();
    logger.log(`Completed: ${String(result.successCount)} success, ${String(result.failures)} failed`);
    logger.newline();
  }

  // Print summary
  printSummary(results, logger);

  // Write results files
  const completedAt = new Date();
  const benchmarkResults: BenchmarkResults = {
    config: {
      symbolId: config.symbolId,
      timeframes: config.timeframes,
      samplesPerTimeframe: config.samplesPerTimeframe,
      startTime: config.startTime,
      quickMode: config.quickMode,
      totalFrames: frames.length,
      modelsEvaluated: models.length,
    },
    results,
    startedAt,
    completedAt,
  };

  // Generate output filename based on models
  const modelSuffix = models.length <= 3 
    ? models.map(m => m.id.split('/')[1]?.split('-')[0] ?? 'model').join('_')
    : 'all';
  const timestamp = new Date().toISOString().split('T')[0];
  const outputName = `BENCHMARK_${modelSuffix}_${timestamp}`;

  // Write all outputs
  writeResultsFile(benchmarkResults, `${outputName}.md`);
  writeJsonResultsFile(benchmarkResults, `${outputName}.json`);
  writePerFrameResults(benchmarkResults, `results_${modelSuffix}`);

  logger.newline();
  logger.log('📄 Results written to:');
  logger.log(`   - ${outputName}.md`);
  logger.log(`   - ${outputName}.json`);
  logger.log(`   - results_${modelSuffix}/`);
  logger.newline();
  logger.log('✅ Benchmark complete');
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
