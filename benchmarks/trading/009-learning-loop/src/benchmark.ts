/**
 * 009 Learning Loop Benchmark - Main Entry Point
 * 
 * Tests whether vision LLMs can learn from feedback and improve their chart analysis.
 * 
 * Usage:
 *   npx tsx src/benchmark.ts --quick --model=google/gemini-2.0-flash
 *   npx tsx src/benchmark.ts --cheap
 *   npx tsx src/benchmark.ts --expensive
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createBenchmarkLogger } from '@nullagent/cli-utils';
import { loadCheapModels, loadExpensiveModels, type ModelConfig } from './matrix.js';
import { generateLearningFrames, runLearningLoop, type LearningLoopResult } from './learning-loop.js';
import type { CandleTimeframe } from './replay-lab/ohlcv.js';
import * as fs from 'fs';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface BenchmarkConfig {
  symbolId: string;
  timeframes: CandleTimeframe[];
  samplesPerTimeframe: number;
  startTime: Date;
  verbose: boolean;
  quickMode: boolean;
  singleModel?: string;
  cheap: boolean;
  expensive: boolean;
}

function getConfig(): BenchmarkConfig {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const quickMode = args.includes('--quick');
  const cheap = args.includes('--cheap');
  const expensive = args.includes('--expensive');
  const modelArg = args.find(a => a.startsWith('--model='));
  const singleModel = modelArg?.split('=')[1];

  const symbolId = process.env['SYMBOL_ID'] ?? 'COINBASE_SPOT_BTC_USD';
  const startTimeStr = process.env['SIMULATION_START_TIME'] ?? '2025-12-20T12:00:00Z';
  const startTime = new Date(startTimeStr);

  return {
    symbolId,
    timeframes: quickMode ? ['1h', '4h'] as CandleTimeframe[] : ['15m', '1h', '4h'] as CandleTimeframe[],
    samplesPerTimeframe: quickMode ? 1 : 2,
    startTime,
    verbose,
    quickMode,
    singleModel,
    cheap,
    expensive,
  };
}

// =============================================================================
// RESULTS FORMATTING
// =============================================================================

function formatResultsToMarkdown(results: LearningLoopResult[]): string {
  let md = `# 009 Learning Loop Benchmark Results\n\n`;
  md += `**Generated**: ${new Date().toISOString()}\n\n`;
  
  // Summary table
  md += `## Summary\n\n`;
  md += `| Model | Baseline | Memorization | Abstraction | Δ Memorize | Δ Abstract |\n`;
  md += `|-------|----------|--------------|-------------|------------|------------|\n`;
  
  // Group by model
  const byModel = new Map<string, LearningLoopResult[]>();
  for (const r of results) {
    const existing = byModel.get(r.modelId) || [];
    existing.push(r);
    byModel.set(r.modelId, existing);
  }

  for (const [modelId, modelResults] of byModel) {
    const avgBaseline = modelResults.reduce((s, r) => s + r.baselineAccuracy, 0) / modelResults.length;
    const avgSameChart = modelResults.reduce((s, r) => s + r.sameChartAccuracy, 0) / modelResults.length;
    const avgDiffTf = modelResults.reduce((s, r) => s + r.differentTimeframeAccuracy, 0) / modelResults.length;
    const avgMemDelta = modelResults.reduce((s, r) => s + r.memorizationDelta, 0) / modelResults.length;
    const avgAbsDelta = modelResults.reduce((s, r) => s + r.abstractionDelta, 0) / modelResults.length;

    const memSign = avgMemDelta >= 0 ? '+' : '';
    const absSign = avgAbsDelta >= 0 ? '+' : '';

    md += `| ${modelId} | ${avgBaseline.toFixed(1)}% | ${avgSameChart.toFixed(1)}% | ${avgDiffTf.toFixed(1)}% | ${memSign}${avgMemDelta.toFixed(1)}% | ${absSign}${avgAbsDelta.toFixed(1)}% |\n`;
  }

  // Detailed results per model
  md += `\n---\n\n## Detailed Results\n\n`;

  for (const [modelId, modelResults] of byModel) {
    md += `### ${modelId}\n\n`;

    for (const r of modelResults) {
      md += `#### Frame: ${r.frameId}\n\n`;
      
      md += `| Round | Accuracy | Delta |\n`;
      md += `|-------|----------|-------|\n`;
      md += `| Baseline (Round 1) | ${r.baselineAccuracy.toFixed(1)}% | - |\n`;
      md += `| Same Chart (Round 2) | ${r.sameChartAccuracy.toFixed(1)}% | ${r.memorizationDelta >= 0 ? '+' : ''}${r.memorizationDelta.toFixed(1)}% |\n`;
      md += `| Diff Timeframe (Round 3) | ${r.differentTimeframeAccuracy.toFixed(1)}% | ${r.abstractionDelta >= 0 ? '+' : ''}${r.abstractionDelta.toFixed(1)}% |\n\n`;

      // Field-by-field comparison
      if (r.baseline.prediction && r.sameChart.prediction && r.differentTimeframe.prediction) {
        md += `**Field-by-Field Analysis:**\n\n`;
        md += `| Field | Ground Truth | Baseline | Same Chart | Diff TF |\n`;
        md += `|-------|--------------|----------|------------|--------|\n`;

        const fields = [
          'uptrend_pullback_to_vwap',
          'volatility_direction_combo',
          'tested_and_held_support',
          'breakout_with_volume',
          'potential_reversal_at_support',
          'overall_bias',
        ] as const;

        for (const field of fields) {
          const gt = r.baseline.groundTruth.multi_step[field];
          const base = r.baseline.prediction.multi_step[field];
          const same = r.sameChart.prediction.multi_step[field];
          const diff = r.differentTimeframe.prediction.multi_step[field];

          const baseMatch = base === gt ? '✅' : '❌';
          const sameMatch = same === gt ? '✅' : '❌';
          const diffMatch = diff === gt ? '✅' : '❌';

          md += `| ${field} | ${String(gt)} | ${String(base)} ${baseMatch} | ${String(same)} ${sameMatch} | ${String(diff)} ${diffMatch} |\n`;
        }
        md += '\n';
      }

      // Include feedback (truncated)
      md += `<details>\n<summary>Feedback Provided</summary>\n\n\`\`\`\n${r.feedback.slice(0, 1500)}${r.feedback.length > 1500 ? '...' : ''}\n\`\`\`\n</details>\n\n`;
    }
  }

  // Insights
  md += `---\n\n## Insights\n\n`;
  
  const allMemDeltas = results.map(r => r.memorizationDelta);
  const allAbsDeltas = results.map(r => r.abstractionDelta);
  const avgMemDelta = allMemDeltas.reduce((a, b) => a + b, 0) / allMemDeltas.length;
  const avgAbsDelta = allAbsDeltas.reduce((a, b) => a + b, 0) / allAbsDeltas.length;

  md += `- **Average Memorization Delta**: ${avgMemDelta >= 0 ? '+' : ''}${avgMemDelta.toFixed(1)}%\n`;
  md += `- **Average Abstraction Delta**: ${avgAbsDelta >= 0 ? '+' : ''}${avgAbsDelta.toFixed(1)}%\n\n`;

  if (avgMemDelta > 5) {
    md += `✅ Models show significant learning from feedback on the same chart.\n`;
  } else if (avgMemDelta > 0) {
    md += `⚠️ Models show slight improvement on same chart, but feedback impact is limited.\n`;
  } else {
    md += `❌ Models do not improve on same chart after feedback - feedback may be ignored.\n`;
  }

  if (avgAbsDelta > 5) {
    md += `✅ Models can abstract learning to different timeframes.\n`;
  } else if (avgAbsDelta > avgMemDelta * 0.5) {
    md += `⚠️ Models partially transfer learning to different timeframes.\n`;
  } else {
    md += `❌ Models struggle to apply learning to different visual representations.\n`;
  }

  return md;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const config = getConfig();
  const logger = createBenchmarkLogger(config.verbose);

  logger.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  logger.log('║                 009 LEARNING LOOP BENCHMARK                       ║');
  logger.log('║                                                                   ║');
  logger.log('║  Testing: Can models learn from feedback?                         ║');
  logger.log('║                                                                   ║');
  logger.log('║  Round 1: Baseline analysis                                       ║');
  logger.log('║  Round 2: Same chart after feedback (memorization)                ║');
  logger.log('║  Round 3: Different timeframe (abstraction)                       ║');
  logger.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  logger.log(`Symbol: ${config.symbolId}`);
  logger.log(`Timeframes: ${config.timeframes.join(', ')}`);
  logger.log(`Samples per timeframe: ${config.samplesPerTimeframe}`);
  logger.log(`Mode: ${config.quickMode ? 'Quick' : 'Full'}`);
  if (config.singleModel) {
    logger.log(`Single model: ${config.singleModel}`);
  }
  logger.log('');

  // Determine which models to test
  let models: ModelConfig[];
  if (config.singleModel) {
    models = [{ id: config.singleModel, provider: 'custom', inputCostPerMillion: 0, outputCostPerMillion: 0, tier: 'budget' as const, vision: true, notes: 'Single model test' }];
  } else if (config.expensive) {
    models = loadExpensiveModels();
  } else {
    // Default to cheap models
    models = loadCheapModels();
  }

  logger.log(`Models to test: ${models.length}`);
  models.forEach(m => logger.log(`  - ${m.id}`));
  logger.log('');

  // Generate learning frames
  logger.log('📊 Generating learning frames...\n');
  const frames = await generateLearningFrames(
    config.symbolId,
    config.timeframes,
    config.samplesPerTimeframe,
    config.startTime
  );
  
  logger.log(`Generated ${frames.length} frames:`);
  frames.forEach(f => logger.log(`  - ${f.frameId}: ${f.originalTimeframe} → ${f.drillDownTimeframe}`));
  logger.log('');

  // Run learning loops for each model
  const allResults: LearningLoopResult[] = [];

  for (const model of models) {
    logger.log(`════════════════════════════════════════════════════════════`);
    logger.log(`🤖 Testing: ${model.id}`);
    logger.log(`════════════════════════════════════════════════════════════`);

    for (const frame of frames) {
      logger.log(`\n────────────────────────────────────────────────────────────`);
      logger.log(`📈 Frame: ${frame.frameId} (${frame.originalTimeframe} → ${frame.drillDownTimeframe})`);
      logger.log(`────────────────────────────────────────────────────────────`);

      try {
        const result = await runLearningLoop(frame, model.id, config.verbose);
        allResults.push(result);

        logger.log(`\n  ✅ Complete:`);
        logger.log(`     Baseline:     ${result.baselineAccuracy.toFixed(1)}%`);
        logger.log(`     Memorization: ${result.sameChartAccuracy.toFixed(1)}% (${result.memorizationDelta >= 0 ? '+' : ''}${result.memorizationDelta.toFixed(1)}%)`);
        logger.log(`     Abstraction:  ${result.differentTimeframeAccuracy.toFixed(1)}% (${result.abstractionDelta >= 0 ? '+' : ''}${result.abstractionDelta.toFixed(1)}%)`);
      } catch (error) {
        logger.log(`\n  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // Write results
  logger.log('\n════════════════════════════════════════════════════════════');
  logger.log('                     WRITING RESULTS');
  logger.log('════════════════════════════════════════════════════════════\n');

  const timestamp = new Date().toISOString().split('T')[0];
  const modelSuffix = config.singleModel?.replace(/\//g, '_') ?? (config.expensive ? 'expensive' : 'cheap');
  const outputFile = `BENCHMARK_learning_${modelSuffix}_${timestamp}.md`;
  const jsonFile = `BENCHMARK_learning_${modelSuffix}_${timestamp}.json`;

  const markdown = formatResultsToMarkdown(allResults);
  fs.writeFileSync(outputFile, markdown);
  fs.writeFileSync(jsonFile, JSON.stringify(allResults, null, 2));

  logger.log(`📄 Markdown: ${outputFile}`);
  logger.log(`📄 JSON: ${jsonFile}`);

  // Final summary
  logger.log('\n════════════════════════════════════════════════════════════');
  logger.log('                       FINAL SUMMARY');
  logger.log('════════════════════════════════════════════════════════════\n');

  const byModel = new Map<string, LearningLoopResult[]>();
  for (const r of allResults) {
    const existing = byModel.get(r.modelId) || [];
    existing.push(r);
    byModel.set(r.modelId, existing);
  }

  for (const [modelId, modelResults] of byModel) {
    const avgBaseline = modelResults.reduce((s, r) => s + r.baselineAccuracy, 0) / modelResults.length;
    const avgMemDelta = modelResults.reduce((s, r) => s + r.memorizationDelta, 0) / modelResults.length;
    const avgAbsDelta = modelResults.reduce((s, r) => s + r.abstractionDelta, 0) / modelResults.length;

    logger.log(`${modelId}:`);
    logger.log(`  Baseline:     ${avgBaseline.toFixed(1)}%`);
    logger.log(`  📝 Memorize:  ${avgMemDelta >= 0 ? '+' : ''}${avgMemDelta.toFixed(1)}%`);
    logger.log(`  🔬 Abstract:  ${avgAbsDelta >= 0 ? '+' : ''}${avgAbsDelta.toFixed(1)}%`);
    logger.log('');
  }

  logger.log('✅ Benchmark complete!\n');
}

main().catch(console.error);
