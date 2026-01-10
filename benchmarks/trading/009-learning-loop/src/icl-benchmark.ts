/**
 * 009 In-Context Learning Benchmark
 * 
 * Tests whether vision LLMs can learn from feedback and improve their chart analysis.
 * 
 * Flow:
 * 1. Run baseline analysis (007-style pattern recognition)
 * 2. Provide detailed feedback on mistakes
 * 3. Re-test on same chart (memorization)
 * 4. Test on similar charts with same conditions (transfer learning)
 * 5. Log results to PostgreSQL and trace with Langfuse
 * 
 * Usage:
 *   pnpm icl --quick                    # Quick test with 1 model, 1 frame
 *   pnpm icl --model=google/gemini-2.0-flash
 *   pnpm icl --cheap                    # Test cheap models
 *   pnpm icl --expensive                # Test frontier models
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createBenchmarkLogger } from '@nullagent/cli-utils';
import { loadCheapModels, loadExpensiveModels, type ModelConfig } from './matrix.js';
import { getSignedChartUrl, STANDARD_CHART_LAYERS } from './replay-lab/charts.js';
import { getCandles, type CandleTimeframe } from './replay-lab/ohlcv.js';
import { getLocalExtrema } from './replay-lab/annotations.js';
import { computeGroundTruth, type GroundTruthInput, type ChartMeta, type IndicatorValues } from './ground-truth/index.js';
import { findSimilarCharts, extractConditions, findSimilarChartsByFingerprint } from './similar-charts.js';
import { runICLSession, type ICLRoundInput, type ICLSessionResult } from './icl-loop.js';
import { initLangfuse, shutdownLangfuse } from './tracing.js';
import { getDatabase } from './db/client.js';
import { learningSessions, learningRounds } from './db/schema.js';
import * as fs from 'fs';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface BenchmarkConfig {
  symbolId: string;
  timeframes: CandleTimeframe[];
  samplesPerTimeframe: number;
  startTime: Date;
  similarChartsPerFrame: number;
  searchRangeDays: number;
  verbose: boolean;
  quickMode: boolean;
  singleModel?: string;
  cheap: boolean;
  expensive: boolean;
  skipDb: boolean;
}

function getConfig(): BenchmarkConfig {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const quickMode = args.includes('--quick');
  const cheap = args.includes('--cheap');
  const expensive = args.includes('--expensive');
  const skipDb = args.includes('--skip-db');
  const modelArg = args.find(a => a.startsWith('--model='));
  const singleModel = modelArg?.split('=')[1];

  const symbolId = process.env['SYMBOL_ID'] ?? 'COINBASE_SPOT_BTC_USD';
  const startTimeStr = process.env['SIMULATION_START_TIME'] ?? '2025-12-20T12:00:00Z';
  const startTime = new Date(startTimeStr);

  return {
    symbolId,
    timeframes: quickMode ? ['4h'] as CandleTimeframe[] : ['1h', '4h'] as CandleTimeframe[],
    samplesPerTimeframe: quickMode ? 1 : 2,
    startTime,
    similarChartsPerFrame: quickMode ? 1 : 2,
    searchRangeDays: 90, // Extended to find more similar charts
    verbose,
    quickMode,
    singleModel,
    cheap,
    expensive,
    skipDb,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function timeframeToMinutes(tf: CandleTimeframe): number {
  const map: Record<CandleTimeframe, number> = {
    '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440,
  };
  return map[tf];
}

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

// =============================================================================
// FRAME GENERATION
// =============================================================================

interface ICLFrame {
  frameId: string;
  baseline: ICLRoundInput;
  similarCharts: ICLRoundInput[];
}

async function generateICLFrames(
  config: BenchmarkConfig,
  _logger: ReturnType<typeof createBenchmarkLogger>
): Promise<ICLFrame[]> {
  const frames: ICLFrame[] = [];
  const { symbolId, timeframes, samplesPerTimeframe, startTime, similarChartsPerFrame, searchRangeDays } = config;

  for (const timeframe of timeframes) {
    const tfMinutes = timeframeToMinutes(timeframe);
    const candlesPerChart = 30;
    const chartDurationMs = candlesPerChart * tfMinutes * 60 * 1000;

    for (let i = 0; i < samplesPerTimeframe; i++) {
      const offsetMs = i * tfMinutes * 60 * 1000 * 10;
      const toTime = new Date(startTime.getTime() - offsetMs);
      const fromTime = new Date(toTime.getTime() - chartDurationMs);
      const frameId = `${timeframe}_${String(i + 1).padStart(2, '0')}`;

      console.log(`  Generating frame: ${frameId}`);

      try {
        // Get baseline chart
        const chartUrl = await getSignedChartUrl({
          symbolId,
          timeframe,
          from: fromTime,
          to: toTime,
          layers: STANDARD_CHART_LAYERS,
        });

        const candles = await getCandles(symbolId, timeframe, fromTime, toTime, candlesPerChart + 10);

        if (candles.length < 20) {
          console.log(`    ⚠️ Insufficient candles (${candles.length}), skipping`);
          continue;
        }

        // Fetch annotations
        let localExtrema: Awaited<ReturnType<typeof getLocalExtrema>> = [];
        try {
          localExtrema = await getLocalExtrema(symbolId, fromTime, toTime);
          console.log(`    📊 Fetched ${localExtrema.length} local extrema`);
        } catch {
          console.log(`    ⚠️ Could not fetch annotations`);
        }

        // Compute ground truth
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

        // Create baseline input
        const baseline: ICLRoundInput = {
          chartUrl,
          candles,
          groundTruth,
          timeframe,
          symbolId,
        };

        // Find similar charts using BOTH approaches
        console.log(`    🔍 Searching for similar charts...`);
        const targetConditions = extractConditions(groundTruth);
        const searchStart = new Date(fromTime.getTime() - searchRangeDays * 24 * 60 * 60 * 1000);
        const searchEnd = new Date(fromTime.getTime() - chartDurationMs); // Don't include the baseline chart

        // Approach 1: Ground Truth Matching (original)
        console.log(`    📊 Method 1: Ground Truth Matching...`);
        const groundTruthMatches = await findSimilarCharts(
          targetConditions,
          symbolId,
          timeframe,
          { startDate: searchStart, endDate: searchEnd },
          3, // Minimum 3 fields must match
          similarChartsPerFrame
        );
        console.log(`    ✓ Ground Truth: Found ${groundTruthMatches.length} matches (min 3/6 fields)`);

        // Approach 2: Fingerprint Matching (new - faster)
        console.log(`    🔬 Method 2: Fingerprint Matching...`);
        const fingerprintMatches = await findSimilarChartsByFingerprint(
          fromTime,
          toTime,
          symbolId,
          timeframe,
          { startDate: searchStart, endDate: searchEnd },
          4, // Minimum 4/10 fingerprint fields must match (lowered for better matches)
          similarChartsPerFrame
        );
        console.log(`    ✓ Fingerprint: Found ${fingerprintMatches.length} matches (min 6/10 fields)`);

        // Combine results (prefer fingerprint matches, deduplicate by time)
        const allMatches = [
          ...groundTruthMatches.map(m => ({ ...m, method: 'ground_truth' as const })),
          ...fingerprintMatches.map(m => ({ 
            chartUrl: m.chartUrl,
            timeframe: m.timeframe,
            from: m.from,
            to: m.to,
            groundTruth: m.groundTruth,
            candles: m.candles,
            matchScore: m.matchScore,
            matchedFields: m.matchedFields,
            method: 'fingerprint' as const,
            fingerprintDescription: m.description,
          })),
        ];

        // Deduplicate by time range (keep first occurrence)
        const seenTimes = new Set<string>();
        const similarChartResults = allMatches.filter(m => {
          const key = `${m.from.toISOString()}-${m.to.toISOString()}`;
          if (seenTimes.has(key)) return false;
          seenTimes.add(key);
          return true;
        }).slice(0, similarChartsPerFrame);

        console.log(`    ✓ Combined: ${similarChartResults.length} unique similar charts`);

        const similarCharts: ICLRoundInput[] = similarChartResults.map(sc => ({
          chartUrl: sc.chartUrl,
          candles: sc.candles,
          groundTruth: sc.groundTruth,
          timeframe: sc.timeframe,
          symbolId,
        }));

        frames.push({
          frameId,
          baseline,
          similarCharts,
        });

        console.log(`    ✓ Frame ready`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`    ✗ Error: ${message}`);
      }
    }
  }

  return frames;
}

// =============================================================================
// DATABASE LOGGING
// =============================================================================

async function logSessionToDatabase(
  result: ICLSessionResult,
  frameId: string,
  config: BenchmarkConfig
) {
  if (config.skipDb) return;

  try {
    const db = getDatabase();

    // Insert session
    await db.insert(learningSessions).values({
      sessionId: result.sessionId,
      modelId: result.modelId,
      symbolId: config.symbolId,
      totalRounds: 2 + result.similarCharts.length,
      feedbackType: 'detailed',
      baselineAccuracy: result.baselineAccuracy,
      finalAccuracy: result.learningCurve[result.learningCurve.length - 1]?.accuracy ?? result.baselineAccuracy,
      peakAccuracy: Math.max(...result.learningCurve.map(lc => lc.accuracy)),
      learningGain: result.memorizationDelta,
      config: config as unknown as Record<string, unknown>,
      summary: {
        memorizationDelta: result.memorizationDelta,
        avgTransferDelta: result.avgTransferDelta,
        learningCurve: result.learningCurve,
      },
    });

    // Insert rounds
    const rounds = [
      { roundNumber: 1, roundType: 'baseline' as const, result: result.baseline, chartUrl: result.baseline.score ? undefined : undefined },
      { roundNumber: 2, roundType: 'same_chart' as const, result: result.sameChart },
      ...result.similarCharts.map((r, i) => ({
        roundNumber: i + 3,
        roundType: 'similar_chart' as const,
        result: r,
      })),
    ];

    for (const round of rounds) {
      await db.insert(learningRounds).values({
        sessionId: result.sessionId,
        roundNumber: round.roundNumber,
        roundType: round.roundType,
        timeframe: config.timeframes[0] ?? '4h',
        accuracy: round.result.score.accuracy,
        exactMatches: round.result.score.exactMatchCount,
        totalFields: round.result.score.totalFields,
        fieldResults: round.result.score.fieldScores,
        feedbackProvided: round.roundNumber === 2 ? result.feedbackProvided : undefined,
        latencyMs: round.result.latencyMs,
        tokensUsed: round.result.tokensUsed?.total,
      });
    }
  } catch (error) {
    console.warn(`⚠️ Database logging failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// =============================================================================
// RESULTS FORMATTING
// =============================================================================

function formatResultsToMarkdown(
  results: Array<{ frameId: string; session: ICLSessionResult }>,
  config: BenchmarkConfig
): string {
  let md = `# 009 In-Context Learning Benchmark Results\n\n`;
  md += `**Generated**: ${new Date().toISOString()}\n`;
  md += `**Symbol**: ${config.symbolId}\n`;
  md += `**Timeframes**: ${config.timeframes.join(', ')}\n\n`;

  // Summary table
  md += `## Summary\n\n`;
  md += `| Model | Baseline | Memorization | Transfer | Δ Memorize | Δ Transfer |\n`;
  md += `|-------|----------|--------------|----------|------------|------------|\n`;

  // Group by model
  const byModel = new Map<string, typeof results>();
  for (const r of results) {
    const existing = byModel.get(r.session.modelId) ?? [];
    existing.push(r);
    byModel.set(r.session.modelId, existing);
  }

  for (const [modelId, modelResults] of byModel) {
    const avgBaseline = modelResults.reduce((s, r) => s + r.session.baselineAccuracy, 0) / modelResults.length;
    const avgMem = modelResults.reduce((s, r) => s + r.session.memorizationAccuracy, 0) / modelResults.length;
    const avgTransfer = modelResults.reduce((s, r) => s + (r.session.transferAccuracies[0] ?? r.session.baselineAccuracy), 0) / modelResults.length;
    const avgMemDelta = modelResults.reduce((s, r) => s + r.session.memorizationDelta, 0) / modelResults.length;
    const avgTransferDelta = modelResults.reduce((s, r) => s + r.session.avgTransferDelta, 0) / modelResults.length;

    const memSign = avgMemDelta >= 0 ? '+' : '';
    const transferSign = avgTransferDelta >= 0 ? '+' : '';

    md += `| ${modelId} | ${(avgBaseline * 100).toFixed(1)}% | ${(avgMem * 100).toFixed(1)}% | ${(avgTransfer * 100).toFixed(1)}% | ${memSign}${(avgMemDelta * 100).toFixed(1)}% | ${transferSign}${(avgTransferDelta * 100).toFixed(1)}% |\n`;
  }

  // Detailed results
  md += `\n---\n\n## Detailed Results\n\n`;

  for (const [modelId, modelResults] of byModel) {
    md += `### ${modelId}\n\n`;

    for (const r of modelResults) {
      const s = r.session;
      md += `#### Frame: ${r.frameId}\n\n`;

      md += `| Round | Type | Accuracy | Δ from Baseline |\n`;
      md += `|-------|------|----------|------------------|\n`;

      for (const lc of s.learningCurve) {
        const roundType = lc.round === 1 ? 'Baseline' : lc.round === 2 ? 'Memorization' : `Transfer #${lc.round - 2}`;
        const delta = lc.round === 1 ? '-' : `${lc.delta >= 0 ? '+' : ''}${(lc.delta * 100).toFixed(1)}%`;
        md += `| ${lc.round} | ${roundType} | ${(lc.accuracy * 100).toFixed(1)}% | ${delta} |\n`;
      }

      md += '\n';

      // Field-by-field for baseline
      if (s.baseline.prediction) {
        md += `**Field Analysis (Baseline → Memorization):**\n\n`;
        md += `| Field | Ground Truth | Baseline | After Feedback |\n`;
        md += `|-------|--------------|----------|----------------|\n`;

        const fields = [
          'uptrend_pullback_to_vwap',
          'volatility_direction_combo',
          'tested_and_held_support',
          'breakout_with_volume',
          'potential_reversal_at_support',
          'overall_bias',
        ] as const;

        for (const field of fields) {
          const gt = s.baseline.score.fieldScores[field] === 1 ? '✅' : '❌';
          const mem = s.sameChart.score.fieldScores[field] === 1 ? '✅' : '❌';
          const improved = s.sameChart.score.fieldScores[field] > s.baseline.score.fieldScores[field] ? '📈' : '';
          md += `| ${field} | - | ${gt} | ${mem} ${improved} |\n`;
        }

        md += '\n';
      }
    }
  }

  // Insights
  md += `---\n\n## Insights\n\n`;

  const allMemDeltas = results.map(r => r.session.memorizationDelta);
  const allTransferDeltas = results.map(r => r.session.avgTransferDelta);
  const avgMemDelta = allMemDeltas.reduce((a, b) => a + b, 0) / allMemDeltas.length;
  const avgTransferDelta = allTransferDeltas.reduce((a, b) => a + b, 0) / allTransferDeltas.length;

  md += `- **Average Memorization Delta**: ${avgMemDelta >= 0 ? '+' : ''}${(avgMemDelta * 100).toFixed(1)}%\n`;
  md += `- **Average Transfer Delta**: ${avgTransferDelta >= 0 ? '+' : ''}${(avgTransferDelta * 100).toFixed(1)}%\n\n`;

  if (avgMemDelta > 0.10) {
    md += `✅ **Strong memorization**: Models significantly improve when seeing the same chart after feedback.\n`;
  } else if (avgMemDelta > 0) {
    md += `⚠️ **Weak memorization**: Models show some improvement on same chart, but feedback impact is limited.\n`;
  } else {
    md += `❌ **No memorization**: Models do not improve on same chart - feedback may be ignored entirely.\n`;
  }

  if (avgTransferDelta > 0.05) {
    md += `✅ **Transfer learning**: Models can apply learning to similar charts.\n`;
  } else if (avgTransferDelta > avgMemDelta * 0.3) {
    md += `⚠️ **Partial transfer**: Models partially transfer learning to similar charts.\n`;
  } else {
    md += `❌ **No transfer**: Models cannot generalize learning to new charts.\n`;
  }

  return md;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const config = getConfig();
  const logger = createBenchmarkLogger(config.verbose);

  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║           009 IN-CONTEXT LEARNING BENCHMARK                       ║');
  console.log('║                                                                   ║');
  console.log('║  Testing: Can models learn from feedback?                         ║');
  console.log('║                                                                   ║');
  console.log('║  Round 1: Baseline analysis (no context)                          ║');
  console.log('║  Round 2: Same chart + feedback (memorization)                    ║');
  console.log('║  Round 3+: Similar charts (transfer learning)                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  console.log(`Symbol: ${config.symbolId}`);
  console.log(`Timeframes: ${config.timeframes.join(', ')}`);
  console.log(`Samples per timeframe: ${config.samplesPerTimeframe}`);
  console.log(`Similar charts per frame: ${config.similarChartsPerFrame}`);
  console.log(`Mode: ${config.quickMode ? 'Quick' : 'Full'}`);
  if (config.singleModel) {
    console.log(`Single model: ${config.singleModel}`);
  }
  if (config.skipDb) {
    console.log(`⚠️ Database logging: DISABLED`);
  }
  console.log('');

  // Initialize Langfuse
  initLangfuse();

  // Determine which models to test
  let models: ModelConfig[];
  if (config.singleModel) {
    models = [{
      id: config.singleModel,
      provider: 'custom',
      inputCostPerMillion: 0,
      outputCostPerMillion: 0,
      tier: 'budget' as const,
      vision: true,
      notes: 'Single model test',
    }];
  } else if (config.expensive) {
    models = loadExpensiveModels();
  } else {
    models = loadCheapModels();
  }

  console.log(`Models to test: ${models.length}`);
  models.forEach(m => console.log(`  - ${m.id}`));
  console.log('');

  // Generate frames
  console.log('📊 Generating ICL frames...\n');
  const frames = await generateICLFrames(config, logger);

  if (frames.length === 0) {
    console.log('❌ No frames generated, exiting');
    return;
  }

  console.log(`\n✓ Generated ${frames.length} frames\n`);

  // Run ICL sessions
  const allResults: Array<{ frameId: string; session: ICLSessionResult }> = [];

  for (const model of models) {
    console.log(`════════════════════════════════════════════════════════════`);
    console.log(`🤖 Testing: ${model.id}`);
    console.log(`════════════════════════════════════════════════════════════`);

    for (const frame of frames) {
      console.log(`\n────────────────────────────────────────────────────────────`);
      console.log(`📈 Frame: ${frame.frameId}`);
      console.log(`────────────────────────────────────────────────────────────`);

      try {
        const session = await runICLSession(
          model.id,
          frame.baseline,
          frame.similarCharts,
          config.verbose
        );

        allResults.push({ frameId: frame.frameId, session });

        // Log to database
        await logSessionToDatabase(session, frame.frameId, config);

        console.log(`\n  ✅ Session complete:`);
        console.log(`     Baseline:     ${(session.baselineAccuracy * 100).toFixed(1)}%`);
        console.log(`     Memorization: ${(session.memorizationAccuracy * 100).toFixed(1)}% (${session.memorizationDelta >= 0 ? '+' : ''}${(session.memorizationDelta * 100).toFixed(1)}%)`);
        if (session.transferAccuracies.length > 0) {
          const avgTransfer = session.transferAccuracies.reduce((a, b) => a + b, 0) / session.transferAccuracies.length;
          console.log(`     Transfer Avg: ${(avgTransfer * 100).toFixed(1)}% (${session.avgTransferDelta >= 0 ? '+' : ''}${(session.avgTransferDelta * 100).toFixed(1)}%)`);
        }
      } catch (error) {
        console.log(`\n  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // Write results
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('                     WRITING RESULTS');
  console.log('════════════════════════════════════════════════════════════\n');

  const timestamp = new Date().toISOString().split('T')[0];
  const modelSuffix = config.singleModel?.replace(/\//g, '_') ?? (config.expensive ? 'expensive' : 'cheap');
  const outputFile = `BENCHMARK_ICL_${modelSuffix}_${timestamp}.md`;
  const jsonFile = `BENCHMARK_ICL_${modelSuffix}_${timestamp}.json`;

  const markdown = formatResultsToMarkdown(allResults, config);
  fs.writeFileSync(outputFile, markdown);
  fs.writeFileSync(jsonFile, JSON.stringify(allResults, null, 2));

  console.log(`📄 Markdown: ${outputFile}`);
  console.log(`📄 JSON: ${jsonFile}`);

  // Final summary
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('                       FINAL SUMMARY');
  console.log('════════════════════════════════════════════════════════════\n');

  const byModel = new Map<string, typeof allResults>();
  for (const r of allResults) {
    const existing = byModel.get(r.session.modelId) ?? [];
    existing.push(r);
    byModel.set(r.session.modelId, existing);
  }

  for (const [modelId, modelResults] of byModel) {
    const avgBaseline = modelResults.reduce((s, r) => s + r.session.baselineAccuracy, 0) / modelResults.length;
    const avgMemDelta = modelResults.reduce((s, r) => s + r.session.memorizationDelta, 0) / modelResults.length;
    const avgTransferDelta = modelResults.reduce((s, r) => s + r.session.avgTransferDelta, 0) / modelResults.length;

    console.log(`${modelId}:`);
    console.log(`  Baseline:     ${(avgBaseline * 100).toFixed(1)}%`);
    console.log(`  📝 Memorize:  ${avgMemDelta >= 0 ? '+' : ''}${(avgMemDelta * 100).toFixed(1)}%`);
    console.log(`  🔬 Transfer:  ${avgTransferDelta >= 0 ? '+' : ''}${(avgTransferDelta * 100).toFixed(1)}%`);
    console.log('');
  }

  // Shutdown
  await shutdownLangfuse();
  console.log('✅ Benchmark complete!\n');
}

main().catch(console.error);
