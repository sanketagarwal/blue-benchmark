/**
 * Multi-Run ICL Benchmark
 * 
 * Runs the ICL benchmark multiple times with different starting times
 * to measure average learning metrics across diverse data samples.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { runICLLoop, type ICLResult } from './icl-loop.js';
import { getSignedChartUrl, STANDARD_CHART_LAYERS } from './replay-lab/charts.js';
import { getCandles, type CandleTimeframe, type Candle } from './replay-lab/ohlcv.js';
import { getLocalExtrema } from './replay-lab/annotations.js';
import { computeGroundTruth, type GroundTruthInput, type ChartMeta, type IndicatorValues } from './ground-truth/index.js';
import type { ChartReadingOutput } from './output-schema.js';
import { findSimilarCharts } from './similar-charts.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

interface RunResult {
  runNumber: number;
  startTime: string;
  timeframe: CandleTimeframe;
  baselineAccuracy: number;
  sameChartAccuracy: number;
  similarChartAccuracies: number[];
  avgSimilarChartAccuracy: number;
  memorizationDelta: number;
  abstractionDelta: number;
  similarChartsFound: number;
  error?: string;
}

interface AggregateStats {
  totalRuns: number;
  successfulRuns: number;
  avgBaselineAccuracy: number;
  avgSameChartAccuracy: number;
  avgSimilarChartAccuracy: number;
  avgMemorizationDelta: number;
  avgAbstractionDelta: number;
  stdMemorizationDelta: number;
  stdAbstractionDelta: number;
  minMemorizationDelta: number;
  maxMemorizationDelta: number;
  minAbstractionDelta: number;
  maxAbstractionDelta: number;
}

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

function timeframeToMinutes(tf: CandleTimeframe): number {
  const map: Record<CandleTimeframe, number> = {
    '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440,
  };
  return map[tf];
}

async function generateFrame(
  symbolId: string,
  timeframe: CandleTimeframe,
  toTime: Date
): Promise<{
  chartUrl: string;
  groundTruth: ChartReadingOutput;
  candles: Candle[];
  from: Date;
  to: Date;
} | null> {
  const tfMinutes = timeframeToMinutes(timeframe);
  const candlesNeeded = 30;
  const durationMs = candlesNeeded * tfMinutes * 60 * 1000;
  const fromTime = new Date(toTime.getTime() - durationMs);

  try {
    const candles = await getCandles(symbolId, timeframe, fromTime, toTime, candlesNeeded + 10);
    
    if (candles.length < 20) {
      console.log(`    ⚠️ Only ${candles.length} candles, need at least 20`);
      return null;
    }

    let localExtrema: Awaited<ReturnType<typeof getLocalExtrema>> = [];
    try {
      localExtrema = await getLocalExtrema(symbolId, fromTime, toTime);
    } catch {
      // Annotations are optional
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
      localExtrema,
    };

    const groundTruth = computeGroundTruth(groundTruthInput);

    const chartUrl = await getSignedChartUrl({
      symbolId,
      timeframe,
      from: fromTime,
      to: toTime,
      layers: STANDARD_CHART_LAYERS,
    });

    return { chartUrl, groundTruth, candles, from: fromTime, to: toTime };
  } catch (error) {
    console.log(`    ❌ Error: ${error instanceof Error ? error.message.slice(0, 60) : String(error)}`);
    return null;
  }
}

async function runSingleIteration(
  runNumber: number,
  modelId: string,
  symbolId: string,
  timeframe: CandleTimeframe,
  startTime: Date
): Promise<RunResult> {
  console.log(`\n━━━ Run ${runNumber} ━━━`);
  console.log(`  Start time: ${startTime.toISOString()}`);
  console.log(`  Timeframe: ${timeframe}`);

  const result: RunResult = {
    runNumber,
    startTime: startTime.toISOString(),
    timeframe,
    baselineAccuracy: 0,
    sameChartAccuracy: 0,
    similarChartAccuracies: [],
    avgSimilarChartAccuracy: 0,
    memorizationDelta: 0,
    abstractionDelta: 0,
    similarChartsFound: 0,
  };

  try {
    // Generate baseline frame
    console.log(`  Generating baseline frame...`);
    const frame = await generateFrame(symbolId, timeframe, startTime);
    
    if (!frame) {
      result.error = 'Failed to generate baseline frame';
      return result;
    }

    // Find similar charts
    console.log(`  Finding similar charts...`);
    const searchRange = {
      startDate: new Date(startTime.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days back
      endDate: new Date(startTime.getTime() - 2 * 60 * 60 * 1000), // 2 hours before baseline
    };

    const similarCharts = await findSimilarCharts(
      frame.groundTruth,
      symbolId,
      timeframe,
      searchRange,
      5, // minMatchScore
      2, // maxResults
      [{ from: frame.from, to: frame.to }] // exclude baseline
    );

    result.similarChartsFound = similarCharts.length;
    console.log(`  Found ${similarCharts.length} similar charts`);

    // Run ICL loop
    console.log(`  Running ICL loop...`);
    const iclResult = await runICLLoop({
      modelId,
      symbolId,
      timeframe,
      baselineChart: {
        chartUrl: frame.chartUrl,
        groundTruth: frame.groundTruth,
        candles: frame.candles,
      },
      similarCharts: similarCharts.map(sc => ({
        chartUrl: sc.chartUrl,
        groundTruth: sc.groundTruth,
        candles: sc.candles,
        matchScore: sc.matchScore,
        matchedFields: sc.matchedFields,
      })),
      verbose: false,
    });

    // Extract metrics
    result.baselineAccuracy = iclResult.baselineAccuracy;
    result.sameChartAccuracy = iclResult.sameChartAccuracy;
    result.similarChartAccuracies = iclResult.similarChartAccuracies;
    result.avgSimilarChartAccuracy = iclResult.similarChartAccuracies.length > 0
      ? iclResult.similarChartAccuracies.reduce((a, b) => a + b, 0) / iclResult.similarChartAccuracies.length
      : 0;
    result.memorizationDelta = iclResult.memorizationDelta;
    result.abstractionDelta = iclResult.abstractionDelta;

    console.log(`  ✅ Baseline: ${(result.baselineAccuracy * 100).toFixed(1)}%`);
    console.log(`     Same Chart: ${(result.sameChartAccuracy * 100).toFixed(1)}% (Δ${(result.memorizationDelta * 100).toFixed(1)}%)`);
    console.log(`     Similar Avg: ${(result.avgSimilarChartAccuracy * 100).toFixed(1)}% (Δ${(result.abstractionDelta * 100).toFixed(1)}%)`);

  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.log(`  ❌ Error: ${result.error.slice(0, 60)}`);
  }

  return result;
}

function calculateStats(results: RunResult[]): AggregateStats {
  const successful = results.filter(r => !r.error);
  
  const mean = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const std = (arr: number[], m: number) => arr.length > 0 
    ? Math.sqrt(arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / arr.length) 
    : 0;

  const memDeltas = successful.map(r => r.memorizationDelta);
  const absDeltas = successful.map(r => r.abstractionDelta);
  const avgMemDelta = mean(memDeltas);
  const avgAbsDelta = mean(absDeltas);

  return {
    totalRuns: results.length,
    successfulRuns: successful.length,
    avgBaselineAccuracy: mean(successful.map(r => r.baselineAccuracy)),
    avgSameChartAccuracy: mean(successful.map(r => r.sameChartAccuracy)),
    avgSimilarChartAccuracy: mean(successful.map(r => r.avgSimilarChartAccuracy)),
    avgMemorizationDelta: avgMemDelta,
    avgAbstractionDelta: avgAbsDelta,
    stdMemorizationDelta: std(memDeltas, avgMemDelta),
    stdAbstractionDelta: std(absDeltas, avgAbsDelta),
    minMemorizationDelta: Math.min(...memDeltas),
    maxMemorizationDelta: Math.max(...memDeltas),
    minAbstractionDelta: Math.min(...absDeltas),
    maxAbstractionDelta: Math.max(...absDeltas),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const numRuns = parseInt(args.find(a => a.startsWith('--runs='))?.split('=')[1] ?? '10');
  const modelId = args.find(a => a.startsWith('--model='))?.split('=')[1] ?? 'google/gemini-2.0-flash';
  const timeframe = (args.find(a => a.startsWith('--timeframe='))?.split('=')[1] ?? '1m') as CandleTimeframe;
  
  const symbolId = process.env['SYMBOL_ID'] ?? 'COINBASE_SPOT_BTC_USD';
  const baseStartTime = new Date(process.env['SIMULATION_START_TIME'] ?? '2025-12-20T12:00:00Z');

  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║           MULTI-RUN ICL BENCHMARK                                 ║');
  console.log('║                                                                   ║');
  console.log('║  Running multiple iterations to measure average learning          ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Model: ${modelId}`);
  console.log(`Symbol: ${symbolId}`);
  console.log(`Timeframe: ${timeframe}`);
  console.log(`Number of runs: ${numRuns}`);
  console.log(`Base start time: ${baseStartTime.toISOString()}`);

  const results: RunResult[] = [];
  
  // Run iterations with different start times
  // Space them 1 hour apart for 1m timeframe, or proportionally for other timeframes
  const tfMinutes = timeframeToMinutes(timeframe);
  const intervalMs = Math.max(60 * 60 * 1000, 30 * tfMinutes * 60 * 1000); // At least 1 hour apart

  for (let i = 0; i < numRuns; i++) {
    // Vary start time: go backwards in time for each run
    const startTime = new Date(baseStartTime.getTime() - i * intervalMs);
    
    const result = await runSingleIteration(
      i + 1,
      modelId,
      symbolId,
      timeframe,
      startTime
    );
    
    results.push(result);
    
    // Small delay between runs
    await new Promise(r => setTimeout(r, 1000));
  }

  // Calculate aggregate statistics
  const stats = calculateStats(results);

  // Print summary
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                    AGGREGATE RESULTS                              ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Successful runs: ${stats.successfulRuns}/${stats.totalRuns}`);
  console.log();
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│ ACCURACY METRICS                                                │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log(`│ Average Baseline Accuracy:      ${(stats.avgBaselineAccuracy * 100).toFixed(1).padStart(6)}%                        │`);
  console.log(`│ Average Same Chart Accuracy:    ${(stats.avgSameChartAccuracy * 100).toFixed(1).padStart(6)}%                        │`);
  console.log(`│ Average Similar Chart Accuracy: ${(stats.avgSimilarChartAccuracy * 100).toFixed(1).padStart(6)}%                        │`);
  console.log('└─────────────────────────────────────────────────────────────────┘');
  console.log();
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│ LEARNING METRICS (Δ = change from baseline)                     │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log(`│ Memorization Delta (same chart):                                │`);
  console.log(`│   Mean: ${(stats.avgMemorizationDelta * 100).toFixed(1).padStart(6)}%  StdDev: ${(stats.stdMemorizationDelta * 100).toFixed(1).padStart(6)}%                       │`);
  console.log(`│   Range: [${(stats.minMemorizationDelta * 100).toFixed(1)}%, ${(stats.maxMemorizationDelta * 100).toFixed(1)}%]                               │`);
  console.log('│                                                                 │');
  console.log(`│ Abstraction Delta (similar charts):                             │`);
  console.log(`│   Mean: ${(stats.avgAbstractionDelta * 100).toFixed(1).padStart(6)}%  StdDev: ${(stats.stdAbstractionDelta * 100).toFixed(1).padStart(6)}%                       │`);
  console.log(`│   Range: [${(stats.minAbstractionDelta * 100).toFixed(1)}%, ${(stats.maxAbstractionDelta * 100).toFixed(1)}%]                               │`);
  console.log('└─────────────────────────────────────────────────────────────────┘');

  // Interpretation
  console.log();
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│ INTERPRETATION                                                  │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  
  if (stats.avgMemorizationDelta > 0.05) {
    console.log('│ ✅ Strong memorization: Model learns from seeing same chart    │');
  } else if (stats.avgMemorizationDelta > 0) {
    console.log('│ 🔶 Weak memorization: Some learning on same chart              │');
  } else {
    console.log('│ ❌ No memorization: Model doesn\'t improve on same chart        │');
  }

  if (stats.avgAbstractionDelta > 0.03) {
    console.log('│ ✅ Transfer learning: Knowledge generalizes to similar charts  │');
  } else if (stats.avgAbstractionDelta > 0) {
    console.log('│ 🔶 Weak transfer: Some generalization to similar charts        │');
  } else {
    console.log('│ ❌ No transfer: Learning doesn\'t generalize                    │');
  }

  console.log('└─────────────────────────────────────────────────────────────────┘');

  // Save results
  const resultsDir = './results_multi_run';
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = `${resultsDir}/multi_run_${modelId.replace('/', '_')}_${timestamp}.json`;
  
  writeFileSync(outputFile, JSON.stringify({
    config: {
      modelId,
      symbolId,
      timeframe,
      numRuns,
      baseStartTime: baseStartTime.toISOString(),
    },
    runs: results,
    stats,
  }, null, 2));

  console.log(`\n📁 Results saved to: ${outputFile}`);
}

main().catch(console.error);
