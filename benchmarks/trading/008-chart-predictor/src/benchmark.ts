/**
 * 008 Chart Predictor Benchmark
 *
 * Tests vision models' ability to PREDICT future chart patterns.
 * Models see chart at time T and predict patterns for time T+1.
 *
 * Test Matrix:
 * - Chart lengths: 20, 50, 100 candles
 * - Timeframes: 5m, 15m, 1h, 4h
 * - 12 configurations total (3 lengths × 4 timeframes)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { runRound } from '@nullagent/agent-core';
import { createBenchmarkLogger } from '@nullagent/cli-utils';

import { createChartPredictor, setContext, clearContext } from './chart-predictor.js';
import { computeGroundTruth } from './ground-truth/index.js';
import { loadCheapModels, loadExpensiveModels, type ModelConfig } from './matrix.js';
import { getSignedChartUrl, STANDARD_CHART_LAYERS } from './replay-lab/charts.js';
import { getCandles, type CandleTimeframe } from './replay-lab/ohlcv.js';
import { scoreChartReading, type ChartReadingScore } from './scorers/index.js';
import { writeResultsFile, writeJsonResultsFile, writePerFrameResults, type BenchmarkResults, type FrameResult as WriterFrameResult, type ModelResult as WriterModelResult } from './results-writer.js';
import type { ChartPredictionOutput } from './output-schema.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface BenchmarkConfig {
  symbolId: string;
  chartLengths: number[];
  timeframes: CandleTimeframe[];
  samplesPerConfig: number;
  startTime: Date;
  verbose: boolean;
  quickMode: boolean;
  singleModel?: string;
  debugMode: boolean;
}

interface PredictionFrame {
  configId: string;
  chartLength: number;
  timeframe: CandleTimeframe;
  currentTime: Date;
  nextTime: Date;
  chartUrl: string;
  groundTruth: ChartPredictionOutput;
}

interface FrameResult {
  frame: PredictionFrame;
  prediction: ChartPredictionOutput | null;
  score: ChartReadingScore | null;
  error?: string;
}

interface ModelResult {
  modelId: string;
  frames: FrameResult[];
  avgAccuracy: number;
  avgExactMatches: number;
  successCount: number;
  failCount: number;
}

// =============================================================================
// CLI ARGUMENT PARSING
// =============================================================================

function getConfig(): BenchmarkConfig {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const quickMode = args.includes('--quick');
  const debugMode = args.includes('--debug');
  const modelArg = args.find((a) => a.startsWith('--model='));
  const singleModel = modelArg?.split('=')[1];

  const symbolId = process.env['SYMBOL_ID'] ?? 'COINBASE_SPOT_BTC_USD';
  const startTimeStr = process.env['SIMULATION_START_TIME'] ?? '2025-12-20T12:00:00Z';
  const startTime = new Date(startTimeStr);

  // Chart lengths to test (how many candles visible)
  const chartLengths = quickMode ? [50] : [20, 50, 100];

  // Timeframes to test
  const timeframes: CandleTimeframe[] = quickMode
    ? ['15m', '1h']
    : ['5m', '15m', '1h', '4h'];

  // Samples per configuration
  const samplesPerConfig = quickMode ? 1 : 2;

  return {
    symbolId,
    chartLengths,
    timeframes,
    samplesPerConfig,
    startTime,
    verbose,
    quickMode,
    singleModel,
    debugMode,
  };
}

// =============================================================================
// TIME OFFSET CALCULATIONS
// =============================================================================

function getTimeframeMs(tf: CandleTimeframe): number {
  const map: Record<CandleTimeframe, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  };
  return map[tf];
}

function getTimeframeName(tf: CandleTimeframe): string {
  const map: Record<CandleTimeframe, string> = {
    '1m': '1 minute',
    '5m': '5 minutes',
    '15m': '15 minutes',
    '30m': '30 minutes',
    '1h': '1 hour',
    '4h': '4 hours',
    '1d': '1 day',
  };
  return map[tf];
}

// =============================================================================
// FRAME GENERATION
// =============================================================================

async function generatePredictionFrames(
  config: BenchmarkConfig,
  logger: ReturnType<typeof createBenchmarkLogger>
): Promise<PredictionFrame[]> {
  const frames: PredictionFrame[] = [];

  logger.log('\n📊 Generating prediction frames...');
  logger.log(`  Chart lengths: ${config.chartLengths.join(', ')} candles`);
  logger.log(`  Timeframes: ${config.timeframes.join(', ')}`);
  logger.log(`  Samples per config: ${config.samplesPerConfig}`);

  const totalConfigs = config.chartLengths.length * config.timeframes.length * config.samplesPerConfig;
  logger.log(`  Total frames: ${totalConfigs}`);

  let frameIdx = 0;

  for (const chartLength of config.chartLengths) {
    for (const timeframe of config.timeframes) {
      const tfMs = getTimeframeMs(timeframe);

      for (let sample = 0; sample < config.samplesPerConfig; sample++) {
        frameIdx++;
        const configId = `${chartLength}c_${timeframe}_${String(sample + 1).padStart(2, '0')}`;

        // Calculate times
        // Current time = start time - offset for this sample
        const sampleOffset = sample * tfMs * 5; // Space samples apart
        const currentTime = new Date(config.startTime.getTime() - sampleOffset);
        const nextTime = new Date(currentTime.getTime() + tfMs);

        logger.log(`  [${frameIdx}/${totalConfigs}] ${configId}: Fetching data...`);

        try {
          // Calculate chart time range (N candles ending at currentTime)
          const chartFrom = new Date(currentTime.getTime() - chartLength * tfMs);
          const chartTo = currentTime;

          // Fetch chart URL for current time (what model sees)
          const chartUrl = await getSignedChartUrl({
            symbolId: config.symbolId,
            timeframe,
            from: chartFrom,
            to: chartTo,
            layers: STANDARD_CHART_LAYERS,
          });

          // Fetch OHLCV data for NEXT time period (for ground truth)
          // We need enough candles to compute indicators (at least 25)
          const candlesNeeded = Math.max(chartLength, 25);
          const ohlcvFrom = new Date(nextTime.getTime() - candlesNeeded * tfMs);
          const ohlcvTo = nextTime;
          
          const ohlcvData = await getCandles(
            config.symbolId,
            timeframe,
            ohlcvFrom,
            ohlcvTo,
            candlesNeeded
          );

          if (ohlcvData.length < 20) {
            logger.log(`    ⚠️ Insufficient OHLCV data for ground truth`);
            continue;
          }

          // Compute ground truth from NEXT period data
          const groundTruth = computeGroundTruth({
            candles: ohlcvData.map((c) => ({ ...c, time: c.timestamp })),
            meta: {
              base_quote: 'Bitcoin / U.S. Dollar',
              venue: 'Coinbase',
              timeframe,
            },
            indicators: {
              vwap: null,
              bb_upper: null,
              bb_mid: null,
              bb_lower: null,
            },
          });

          frames.push({
            configId,
            chartLength,
            timeframe,
            currentTime,
            nextTime,
            chartUrl,
            groundTruth,
          });

          logger.log(`    ✓ Frame ready`);
        } catch (error) {
          logger.log(`    ✗ Error: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }
    }
  }

  logger.log(`\n✅ Generated ${frames.length} prediction frames\n`);
  return frames;
}

// =============================================================================
// MODEL EVALUATION
// =============================================================================

async function evaluateModel(
  modelId: string,
  frames: PredictionFrame[],
  logger: ReturnType<typeof createBenchmarkLogger>,
  verbose: boolean,
  debugMode: boolean
): Promise<ModelResult> {
  const results: FrameResult[] = [];
  let successCount = 0;
  let totalAccuracy = 0;
  let totalExactMatches = 0;

  // Set MODEL_ID for agent-core
  process.env['MODEL_ID'] = modelId;
  
  const agent = createChartPredictor(modelId);

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    logger.log(`  [${i + 1}/${frames.length}] ${frame.configId}...`);

    try {
      // Set context for prediction
      setContext({
        chartUrl: frame.chartUrl,
        symbolId: 'COINBASE_SPOT_BTC_USD',
        timeframe: frame.timeframe,
        currentTime: frame.currentTime.toISOString(),
        candlesVisible: frame.chartLength,
        predictionHorizon: getTimeframeName(frame.timeframe),
      });

      // Run the agent
      const result = await runRound(agent, '');
      const prediction = result.output as ChartPredictionOutput;

      // Score the prediction against next period's ground truth
      const score = scoreChartReading(prediction, frame.groundTruth);

      results.push({ frame, prediction, score });
      successCount++;
      totalAccuracy += score.accuracy;
      totalExactMatches += score.exactMatchCount;

      if (verbose) {
        logger.log(`    Accuracy: ${(score.accuracy * 100).toFixed(1)}%`);
      }

      // Debug output
      if (debugMode) {
        logger.log(`\n    ╔══════════════════════════════════════════════════════════════════╗`);
        logger.log(`    ║                     DEBUG: PREDICTION OUTPUT                       ║`);
        logger.log(`    ╚══════════════════════════════════════════════════════════════════╝`);
        logger.log(`\n    📊 CONFIG: ${frame.chartLength} candles, ${frame.timeframe} timeframe`);
        logger.log(`    📅 CURRENT TIME: ${frame.currentTime.toISOString()}`);
        logger.log(`    🔮 PREDICTING FOR: ${frame.nextTime.toISOString()}`);
        logger.log(`\n    🖼️ CHART URL:\n    ${frame.chartUrl}\n`);
        logger.log(`    ════════════════════════════════════════════════════════════════════`);
        logger.log(`    📋 GROUND TRUTH (computed from T+1 OHLCV data):`);
        logger.log(`    ════════════════════════════════════════════════════════════════════`);
        const gt = frame.groundTruth.multi_step;
        logger.log(`    uptrend_pullback_to_vwap:    ${gt.uptrend_pullback_to_vwap}`);
        logger.log(`    volatility_direction_combo:  ${gt.volatility_direction_combo}`);
        logger.log(`    tested_and_held_support:     ${gt.tested_and_held_support}`);
        logger.log(`    breakout_with_volume:        ${gt.breakout_with_volume}`);
        logger.log(`    potential_reversal_at_support: ${gt.potential_reversal_at_support}`);
        logger.log(`    overall_bias:                ${gt.overall_bias}`);
        logger.log(`\n    ════════════════════════════════════════════════════════════════════`);
        logger.log(`    🔮 MODEL PREDICTION:`);
        logger.log(`    ════════════════════════════════════════════════════════════════════`);
        const pred = prediction.multi_step;
        logger.log(`    uptrend_pullback_to_vwap:    ${pred.uptrend_pullback_to_vwap}`);
        logger.log(`    volatility_direction_combo:  ${pred.volatility_direction_combo}`);
        logger.log(`    tested_and_held_support:     ${pred.tested_and_held_support}`);
        logger.log(`    breakout_with_volume:        ${pred.breakout_with_volume}`);
        logger.log(`    potential_reversal_at_support: ${pred.potential_reversal_at_support}`);
        logger.log(`    overall_bias:                ${pred.overall_bias}`);
        logger.log(`\n    ════════════════════════════════════════════════════════════════════`);
        logger.log(`    📊 COMPARISON (✓ = correct prediction, ✗ = wrong):`);
        logger.log(`    ════════════════════════════════════════════════════════════════════`);
        const fs = score.fieldScores;
        logger.log(`    uptrend_pullback_to_vwap:    ${fs.uptrend_pullback_to_vwap === 1 ? '✓' : '✗'}`);
        logger.log(`    volatility_direction_combo:  ${fs.volatility_direction_combo === 1 ? '✓' : '✗'}`);
        logger.log(`    tested_and_held_support:     ${fs.tested_and_held_support === 1 ? '✓' : '✗'}`);
        logger.log(`    breakout_with_volume:        ${fs.breakout_with_volume === 1 ? '✓' : '✗'}`);
        logger.log(`    potential_reversal_at_support: ${fs.potential_reversal_at_support === 1 ? '✓' : '✗'}`);
        logger.log(`    overall_bias:                ${fs.overall_bias === 1 ? '✓' : fs.overall_bias === 0.5 ? '~' : '✗'}`);
        logger.log(`\n    PREDICTION ACCURACY: ${(score.accuracy * 100).toFixed(1)}% (${score.exactMatchCount}/6 exact)\n`);
        logger.log(`    ══════════════════════════════════════════════════════════════════\n`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      results.push({ frame, prediction: null, score: null, error: errorMsg });
      logger.log(`    ✗ Error: ${errorMsg}`);
    } finally {
      clearContext();
    }
  }

  const avgAccuracy = successCount > 0 ? totalAccuracy / successCount : 0;
  const avgExactMatches = successCount > 0 ? totalExactMatches / successCount : 0;

  return {
    modelId,
    frames: results,
    avgAccuracy,
    avgExactMatches,
    successCount,
    failCount: frames.length - successCount,
  };
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main(): Promise<void> {
  const config = getConfig();
  const logger = createBenchmarkLogger('008-chart-predictor');

  logger.log('═══════════════════════════════════════════════════════════════════');
  logger.log('       008 CHART PREDICTOR BENCHMARK');
  logger.log('       Testing: Can models predict future chart patterns?');
  logger.log('═══════════════════════════════════════════════════════════════════\n');

  logger.log(`Symbol: ${config.symbolId}`);
  logger.log(`Base time: ${config.startTime.toISOString()}`);
  logger.log(`Mode: ${config.quickMode ? 'Quick' : 'Full'}`);
  if (config.debugMode) {
    logger.log(`🐛 DEBUG MODE: Full input/output logging enabled`);
  }

  // Load models
  const args = process.argv.slice(2);
  const useCheap = args.includes('--cheap');
  const useExpensive = args.includes('--expensive');

  let models: ModelConfig[];
  let modelSetName: string;

  if (config.singleModel) {
    models = [{ id: config.singleModel, provider: 'unknown', cost_per_1m_tokens: 0, vision: true }];
    modelSetName = config.singleModel.replace('/', '_');
  } else if (useCheap) {
    models = loadCheapModels();
    modelSetName = 'cheap';
  } else if (useExpensive) {
    models = loadExpensiveModels();
    modelSetName = 'expensive';
  } else {
    // Default to cheap models
    models = loadCheapModels();
    modelSetName = 'cheap';
  }

  logger.log(`\nModels to test: ${models.length}`);
  models.forEach((m) => logger.log(`  - ${m.id}`));

  // Generate prediction frames
  const frames = await generatePredictionFrames(config, logger);

  if (frames.length === 0) {
    logger.log('❌ No frames generated. Check API connectivity.');
    return;
  }

  // Evaluate each model
  const modelResults: ModelResult[] = [];

  for (const model of models) {
    logger.log(`\n${'─'.repeat(60)}`);
    logger.log(`🤖 Evaluating: ${model.id}`);
    logger.log('─'.repeat(60));

    const result = await evaluateModel(model.id, frames, logger, config.verbose, config.debugMode);
    modelResults.push(result);

    logger.log(`\n  Summary for ${model.id}:`);
    logger.log(`    Success: ${result.successCount}/${frames.length}`);
    logger.log(`    Avg Accuracy: ${(result.avgAccuracy * 100).toFixed(1)}%`);
    logger.log(`    Avg Exact Matches: ${result.avgExactMatches.toFixed(1)}/6`);
  }

  // Write results
  logger.log('\n═══════════════════════════════════════════════════════════════════');
  logger.log('                         FINAL RESULTS');
  logger.log('═══════════════════════════════════════════════════════════════════\n');

  // Build BenchmarkResults object
  const benchmarkResults: BenchmarkResults = {
    config: {
      symbolId: config.symbolId,
      timeframes: config.timeframes,
      samplesPerTimeframe: config.samplesPerConfig,
      startTime: config.startTime,
      quickMode: config.quickMode,
      totalFrames: frames.length,
      modelsEvaluated: models.length,
    },
    results: modelResults.map((r): WriterModelResult => ({
      modelId: r.modelId,
      frames: r.frames.map((f): WriterFrameResult => ({
        frameId: f.frame.configId,
        timeframe: f.frame.timeframe,
        chartUrl: f.frame.chartUrl,
        timestamp: f.frame.currentTime.toISOString(),
        prediction: f.prediction,
        groundTruth: f.frame.groundTruth,
        score: f.score,
        error: f.error ?? null,
        durationMs: 0,
      })),
      failures: r.failCount,
      successCount: r.successCount,
    })),
    startedAt: new Date(),
    completedAt: new Date(),
  };

  // Generate output filenames
  const dateStr = new Date().toISOString().split('T')[0];
  const mdFile = `BENCHMARK_${modelSetName}_${dateStr}.md`;
  const jsonFile = `BENCHMARK_${modelSetName}_${dateStr}.json`;
  const resultsDir = `results_${modelSetName}`;

  writeResultsFile(benchmarkResults, mdFile);
  writeJsonResultsFile(benchmarkResults, jsonFile);
  writePerFrameResults(benchmarkResults, resultsDir);

  logger.log(`📄 Results written to: ${mdFile}`);
  logger.log(`📄 JSON written to: ${jsonFile}`);
  logger.log(`📁 Per-frame results in: ${resultsDir}/`);

  // Print summary
  logger.log('\n📊 Summary');
  logger.log('='.repeat(40));
  for (const result of modelResults) {
    logger.log(`\n${result.modelId}:`);
    logger.log(`  Frames: ${result.successCount} success, ${result.failCount} failed`);
    logger.log(`  Avg Prediction Accuracy: ${(result.avgAccuracy * 100).toFixed(1)}%`);
    logger.log(`  Avg Exact Matches: ${result.avgExactMatches.toFixed(1)}/6`);
  }

  // Performance by configuration
  logger.log('\n\n📈 Accuracy by Configuration');
  logger.log('='.repeat(40));

  for (const chartLength of config.chartLengths) {
    logger.log(`\n${chartLength} candles visible:`);
    for (const tf of config.timeframes) {
      const configFrames = modelResults
        .flatMap((r) => r.frames)
        .filter((f) => f.frame.chartLength === chartLength && f.frame.timeframe === tf && f.score);

      if (configFrames.length > 0) {
        const avgAcc =
          configFrames.reduce((sum, f) => sum + (f.score?.accuracy ?? 0), 0) / configFrames.length;
        logger.log(`  ${tf}: ${(avgAcc * 100).toFixed(1)}% avg accuracy`);
      }
    }
  }

  logger.log('\n✅ Benchmark complete!\n');
}

main().catch(console.error);

