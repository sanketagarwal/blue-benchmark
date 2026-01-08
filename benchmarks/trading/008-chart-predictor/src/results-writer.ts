/**
 * Results writer for Multi-Step Reasoning benchmark.
 * Outputs detailed per-frame results for the 6 multi-step reasoning fields.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

import type { ChartReadingScore } from './scorers/index.js';
import type { ChartReadingOutput } from './output-schema.js';
import type { CandleTimeframe } from './replay-lab/ohlcv.js';

/**
 * Individual frame result with full prediction and ground truth
 */
export interface FrameResult {
  frameId: string;
  timeframe: CandleTimeframe;
  chartUrl: string;
  timestamp: string;
  prediction: ChartReadingOutput | null;
  groundTruth: ChartReadingOutput;
  score: ChartReadingScore | null;
  error: string | null;
  durationMs: number;
}

/**
 * Per-model results with all frame details
 */
export interface ModelResult {
  modelId: string;
  frames: FrameResult[];
  failures: number;
  successCount: number;
}

export interface BenchmarkResults {
  config: {
    symbolId: string;
    timeframes: CandleTimeframe[];
    samplesPerTimeframe: number;
    startTime: Date;
    quickMode: boolean;
    totalFrames: number;
    modelsEvaluated: number;
  };
  results: ModelResult[];
  startedAt: Date;
  completedAt: Date;
}

/**
 * Get emoji for score
 */
function scoreEmoji(score: number): string {
  if (score >= 1) return '✅';
  if (score >= 0.5) return '🟡';
  return '❌';
}

/**
 * Format a value for display
 */
function formatValue(val: unknown): string {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'string') return `"${val}"`;
  if (typeof val === 'number') return val.toFixed(2);
  return String(val);
}

/**
 * Generate detailed markdown results file
 */
export function generateResultsMarkdown(results: BenchmarkResults): string {
  const { config, results: modelResults, startedAt, completedAt } = results;
  const duration = (completedAt.getTime() - startedAt.getTime()) / 1000;

  let md = `# Multi-Step Reasoning Benchmark — Results

**Focus:** Testing models' ability to combine multiple chart signals into compound trading conclusions.

**Run Date:** ${startedAt.toISOString().split('T')[0]}  
**Symbol:** ${config.symbolId}  
**Duration:** ${duration.toFixed(1)}s  
**Mode:** ${config.quickMode ? 'Quick' : 'Full'}  
**Total Frames:** ${config.totalFrames}  
**Models Evaluated:** ${config.modelsEvaluated}

---

## 📊 The 6 Multi-Step Reasoning Fields

| # | Field | What It Tests |
|---|-------|---------------|
| 1 | \`uptrend_pullback_to_vwap\` | Trend detection + VWAP proximity |
| 2 | \`volatility_direction_combo\` | Volatility assessment + direction |
| 3 | \`tested_and_held_support\` | Support identification + reaction |
| 4 | \`breakout_with_volume\` | Price breakout + volume confirmation |
| 5 | \`potential_reversal_at_support\` | Support + reversal pattern |
| 6 | \`overall_bias\` | Synthesis of all signals |

---

## 📋 Per-Model Results

`;

  for (const modelResult of modelResults) {
    // Calculate aggregate stats
    const successfulFrames = modelResult.frames.filter(f => f.score !== null);
    const avgAccuracy = successfulFrames.length > 0
      ? successfulFrames.reduce((sum, f) => sum + (f.score?.accuracy ?? 0), 0) / successfulFrames.length
      : 0;

    md += `### 🤖 ${modelResult.modelId}

**Success Rate:** ${modelResult.successCount}/${modelResult.frames.length} frames  
**Average Accuracy:** ${(avgAccuracy * 100).toFixed(1)}%

`;

    for (const frame of modelResult.frames) {
      md += `#### Frame: ${frame.frameId} (${frame.timeframe})

**Timestamp:** ${frame.timestamp}  
**Duration:** ${frame.durationMs}ms  
**Status:** ${frame.error ? `❌ Error: ${frame.error}` : '✅ Success'}

`;

      if (frame.prediction && frame.score) {
        md += `| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
`;
        const pred = frame.prediction.multi_step;
        const truth = frame.groundTruth.multi_step;
        const scores = frame.score.fieldScores;

        md += `| uptrend_pullback_to_vwap | ${formatValue(pred.uptrend_pullback_to_vwap)} | ${formatValue(truth.uptrend_pullback_to_vwap)} | ${scoreEmoji(scores.uptrend_pullback_to_vwap)} |
`;
        md += `| volatility_direction_combo | ${formatValue(pred.volatility_direction_combo)} | ${formatValue(truth.volatility_direction_combo)} | ${scoreEmoji(scores.volatility_direction_combo)} |
`;
        md += `| tested_and_held_support | ${formatValue(pred.tested_and_held_support)} | ${formatValue(truth.tested_and_held_support)} | ${scoreEmoji(scores.tested_and_held_support)} |
`;
        md += `| breakout_with_volume | ${formatValue(pred.breakout_with_volume)} | ${formatValue(truth.breakout_with_volume)} | ${scoreEmoji(scores.breakout_with_volume)} |
`;
        md += `| potential_reversal_at_support | ${formatValue(pred.potential_reversal_at_support)} | ${formatValue(truth.potential_reversal_at_support)} | ${scoreEmoji(scores.potential_reversal_at_support)} |
`;
        md += `| overall_bias | ${formatValue(pred.overall_bias)} | ${formatValue(truth.overall_bias)} | ${scoreEmoji(scores.overall_bias)} |
`;

        md += `
**Frame Accuracy:** ${(frame.score.accuracy * 100).toFixed(1)}% (${frame.score.exactMatchCount}/${frame.score.totalFields} exact matches)

`;
      }

      md += `---

`;
    }
  }

  // Summary table
  md += `## 📈 Summary by Model

| Model | Success Rate | Avg Accuracy | Exact Matches |
|-------|-------------|--------------|---------------|
`;

  for (const modelResult of modelResults) {
    const successfulFrames = modelResult.frames.filter(f => f.score !== null);
    const avgAccuracy = successfulFrames.length > 0
      ? successfulFrames.reduce((sum, f) => sum + (f.score?.accuracy ?? 0), 0) / successfulFrames.length
      : 0;
    const avgExact = successfulFrames.length > 0
      ? successfulFrames.reduce((sum, f) => sum + (f.score?.exactMatchCount ?? 0), 0) / successfulFrames.length
      : 0;

    md += `| ${modelResult.modelId} | ${modelResult.successCount}/${modelResult.frames.length} | ${(avgAccuracy * 100).toFixed(1)}% | ${avgExact.toFixed(1)}/6 |
`;
  }

  md += `
---

*Auto-generated by Multi-Step Reasoning Benchmark*  
*Completed: ${completedAt.toISOString()}*
`;

  return md;
}

/**
 * Write results to BENCHMARK_RESULTS.md
 */
export function writeResultsFile(results: BenchmarkResults, outputPath = 'BENCHMARK_RESULTS.md'): void {
  const markdown = generateResultsMarkdown(results);
  writeFileSync(outputPath, markdown, 'utf-8');
}

/**
 * Generate JSON with all data
 */
export function generateResultsJson(results: BenchmarkResults): string {
  return JSON.stringify({
    config: {
      ...results.config,
      startTime: results.config.startTime.toISOString(),
    },
    results: results.results.map((r) => ({
      modelId: r.modelId,
      successCount: r.successCount,
      failures: r.failures,
      frames: r.frames.map((f) => ({
        frameId: f.frameId,
        timeframe: f.timeframe,
        chartUrl: f.chartUrl,
        timestamp: f.timestamp,
        durationMs: f.durationMs,
        error: f.error,
        prediction: f.prediction,
        groundTruth: f.groundTruth,
        score: f.score,
      })),
    })),
    startedAt: results.startedAt.toISOString(),
    completedAt: results.completedAt.toISOString(),
  }, null, 2);
}

/**
 * Write JSON results file
 */
export function writeJsonResultsFile(results: BenchmarkResults, outputPath = 'BENCHMARK_RESULTS.json'): void {
  const json = generateResultsJson(results);
  writeFileSync(outputPath, json, 'utf-8');
}

/**
 * Write individual frame results as separate JSON files
 */
export function writePerFrameResults(results: BenchmarkResults, outputDir = 'results'): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  for (const model of results.results) {
    const modelDir = `${outputDir}/${model.modelId.replace('/', '_')}`;
    if (!existsSync(modelDir)) {
      mkdirSync(modelDir, { recursive: true });
    }

    for (const frame of model.frames) {
      const frameFile = `${modelDir}/${frame.frameId}.json`;
      writeFileSync(frameFile, JSON.stringify({
        frameId: frame.frameId,
        timeframe: frame.timeframe,
        chartUrl: frame.chartUrl,
        timestamp: frame.timestamp,
        durationMs: frame.durationMs,
        error: frame.error,
        prediction: frame.prediction,
        groundTruth: frame.groundTruth,
        score: frame.score,
      }, null, 2), 'utf-8');
    }
  }
}
