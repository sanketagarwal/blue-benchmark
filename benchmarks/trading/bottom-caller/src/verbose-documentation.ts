/**
 * Code-driven documentation module for --verbose mode.
 * All documentation is derived from actual code structures to prevent drift.
 */

import {
  TIMEFRAME_IDS,
  getTimeframeConfig,
  getLookbackBars,
} from './timeframe-config.js';

import type { TimeframeId } from './timeframe-config.js';

const SYSTEM_PROMPT = 'You are an expert technical analyst specializing in identifying structural market bottoms across multiple timeframes.';
const HORIZON_PREDICTION_SCHEMA_TYPE = 'HorizonPredictionSchema';
const CODE_BLOCK_TYPESCRIPT = '```typescript';

function formatMinutesAsTime(minutes: number): string {
  if (minutes >= 1440) {
    const days = minutes / 1440;
    return days === 1 ? '1 day' : `${String(days)} days`;
  }
  if (minutes >= 60) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hour' : `${String(hours)} hours`;
  }
  return `${String(minutes)} minutes`;
}

function formatBarSize(minutes: number): string {
  if (minutes >= 60) {
    const hours = minutes / 60;
    return hours === 1 ? '1-hour' : `${String(hours)}-hour`;
  }
  return `${String(minutes)}-minute`;
}

function padRight(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - text.length));
}

function padLeft(text: string, width: number): string {
  return ' '.repeat(Math.max(0, width - text.length)) + text;
}

/**
 * Generate documentation of the prompt template from actual code structures.
 * Extracts system prompt, multimodal structure, task instructions, and output schema.
 * @returns Formatted markdown string documenting the prompt template
 */
export function generatePromptDocumentation(): string {
  const lines: string[] = [];

  lines.push('# Bottom Caller Prompt Documentation');
  lines.push('');
  lines.push('## System Prompt');
  lines.push('');
  lines.push(`> ${SYSTEM_PROMPT}`);
  lines.push('');

  lines.push('## Multimodal Prompt Structure');
  lines.push('');
  lines.push('The prompt consists of:');
  lines.push('1. **Text intro** - Describes the 4 chart images with current time and symbol');
  lines.push('2. **4 chart images** - One per horizon (15m, 1h, 4h, 24h)');
  lines.push('3. **Task instructions** - Definition of noNewLow and output format');
  lines.push('');

  lines.push('### Chart Image Descriptions (from config):');
  lines.push('');

  for (const [index, id] of TIMEFRAME_IDS.entries()) {
    const config = getTimeframeConfig(id);
    const barSize = formatBarSize(config.chart.barSizeMinutes);
    const lookbackBars = getLookbackBars(id);
    const lookbackTime = formatMinutesAsTime(config.chart.range.fromMinutesAgo);
    const horizonTime = formatMinutesAsTime(config.task.forwardWindowMinutes);

    lines.push(`**Image ${String(index + 1)} – ${id} horizon chart**`);
    lines.push(`- Bar size: ${barSize} candles`);
    lines.push(`- Lookback: ${String(lookbackBars)} bars (${lookbackTime})`);
    lines.push(`- Prediction horizon: next ${horizonTime}`);
    lines.push('');
  }

  lines.push('## Task Definition');
  lines.push('');
  lines.push('For each horizon, predict whether the reference low will hold or be undercut within the prediction horizon.');
  lines.push('');
  lines.push('### noNewLow Definition:');
  lines.push('- `noNewLow = true`: The reference low will NOT be undercut within the prediction horizon');
  lines.push('- `noNewLow = false`: Price will make a new low below the reference low within the prediction horizon');
  lines.push('');
  lines.push('### Confidence:');
  lines.push('- Range: 0.5 to 1.0');
  lines.push('- 0.5 = uncertain/guess, 1.0 = high conviction');
  lines.push('');

  lines.push('## Output Schema (Zod)');
  lines.push('');
  lines.push(CODE_BLOCK_TYPESCRIPT);
  lines.push(`const ${HORIZON_PREDICTION_SCHEMA_TYPE} = z.object({`);
  lines.push('  noNewLow: z.boolean(),');
  lines.push('  confidence: z.number().min(0.5).max(1),');
  lines.push('});');
  lines.push('');
  lines.push('const OutputSchema = z.object({');
  lines.push('  reasoning: z.string().optional(),');
  lines.push('  predictions: z.object({');
  lines.push(`    '15m': ${HORIZON_PREDICTION_SCHEMA_TYPE},`);
  lines.push(`    '1h': ${HORIZON_PREDICTION_SCHEMA_TYPE},`);
  lines.push(`    '4h': ${HORIZON_PREDICTION_SCHEMA_TYPE},`);
  lines.push(`    '24h': ${HORIZON_PREDICTION_SCHEMA_TYPE},`);
  lines.push('  }),');
  lines.push('});');
  lines.push('```');

  return lines.join('\n');
}

/**
 * Generate a markdown table of the Task Spec from TIMEFRAME_CONFIG.
 * Shows bar size, lookback bars, lookback time, and forward window for each horizon.
 * @returns Formatted markdown table string documenting task specifications
 */
export function generateTaskSpecTable(): string {
  const headers = ['Horizon', 'Bar Size', 'Lookback Bars', 'Lookback Time', 'Forward Window'];
  const widths = [7, 8, 13, 13, 14];

  // eslint-disable-next-line security/detect-object-injection -- index is a controlled loop variable from Array.map
  const headerRow = headers.map((header, index) => padRight(header, widths[index] ?? 0)).join(' | ');
  const separatorRow = widths.map(w => '-'.repeat(w)).join(' | ');

  const dataRows = TIMEFRAME_IDS.map((id: TimeframeId) => {
    const config = getTimeframeConfig(id);
    const lookbackBars = getLookbackBars(id);

    const barSize = formatBarSize(config.chart.barSizeMinutes);
    const lookbackTime = formatMinutesAsTime(config.chart.range.fromMinutesAgo);
    const forwardWindow = formatMinutesAsTime(config.task.forwardWindowMinutes);

    const cells = [
      padRight(id, widths[0] ?? 0),
      padRight(barSize, widths[1] ?? 0),
      padLeft(String(lookbackBars), widths[2] ?? 0),
      padRight(lookbackTime, widths[3] ?? 0),
      padRight(forwardWindow, widths[4] ?? 0),
    ];
    return cells.join(' | ');
  });

  const lines = [
    '# Task Spec',
    '',
    `| ${headerRow} |`,
    `| ${separatorRow} |`,
    ...dataRows.map(row => `| ${row} |`),
    '',
    '## Invariants (from validateTimeframeConfig):',
    '- lookbackBars = 8 × horizonBars',
    '- groundTruth.window.durationMinutes = task.forwardWindowMinutes',
    '- pivot.barTimeframe = chart.barTimeframe',
  ];

  return lines.join('\n');
}

/**
 * Generate documentation of the scoring methodology from actual scorer functions.
 * References probability conversion, log loss, Brier score, and baselines.
 * @returns Formatted markdown string documenting scoring methodology
 */
export function generateScoringMethodology(): string {
  const lines: string[] = [];

  lines.push('# Scoring Methodology');
  lines.push('');

  lines.push('## Probability Conversion (from benchmark.ts)');
  lines.push('');
  lines.push('Converts prediction to probability of no new low occurring:');
  lines.push('');
  lines.push(CODE_BLOCK_TYPESCRIPT);
  lines.push('function predictionToProbability(pred: { noNewLow: boolean; confidence: number }): number {');
  lines.push('  return pred.noNewLow ? pred.confidence : (1 - pred.confidence);');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push('- If `noNewLow=true`: p = confidence (model believes no new low will occur)');
  lines.push('- If `noNewLow=false`: p = 1 - confidence (model believes new low likely)');
  lines.push('');

  lines.push('## Log Loss (from log-loss-scorer.ts)');
  lines.push('');
  lines.push('Formula: `LL = -(y*log(p) + (1-y)*log(1-p))`');
  lines.push('');
  lines.push('- Predictions clipped to [ε, 1-ε] where ε = 1e-15 to prevent log(0)');
  lines.push('- Lower is better; perfect prediction = 0');
  lines.push('');

  lines.push('## Brier Score (from brier-scorer.ts)');
  lines.push('');
  lines.push('Formula: `BS = (p - y)²` where y is 0 or 1');
  lines.push('');
  lines.push('- 0 is perfect, 1 is worst');
  lines.push('- Brier Skill Score: `BSS = 1 - (model / baseline)`');
  lines.push('');

  lines.push('## Baselines (from phase-0-scorer.ts)');
  lines.push('');
  lines.push('| Baseline      | Strategy                              | Log Loss       |');
  lines.push('| ------------- | ------------------------------------- | -------------- |');
  lines.push('| random        | Always predict 0.5                    | log(2) ≈ 0.693 |');
  lines.push('| alwaysFalse   | Always predict ε (near 0)             | Depends on labels |');
  lines.push('| alwaysTrue    | Always predict 1-ε (near 1)           | Depends on labels |');
  lines.push('| trivialBest   | min(alwaysFalse, alwaysTrue)          | Best constant  |');
  lines.push('');
  lines.push('### Disqualification Thresholds:');
  lines.push('- Worse than random: meanLL > log(2) × 1.1');
  lines.push('- Degenerate: all predictions > 0.9 or < 0.1 for a horizon');
  lines.push('- Extreme error rate: > 20% confident wrong predictions (p > 0.8 when label = false)');
  lines.push('- Skill margin: meanLL >= trivialBest + 0.1 (when trivialBest >= 0.1)');

  return lines.join('\n');
}

/**
 * Generate documentation of ground truth computation from no-new-low.ts.
 * References computeReferenceLow, computeForwardWindow, and labelNoNewLow.
 * @returns Formatted markdown string documenting ground truth methodology
 */
export function generateGroundTruthMethodology(): string {
  const lines: string[] = [];

  lines.push('# Ground Truth Methodology');
  lines.push('');
  lines.push('Ground truth is computed from no-new-low.ts using OHLCV candle data.');
  lines.push('');

  lines.push('## Step 1: Compute Reference Low (computeReferenceLow)');
  lines.push('');
  lines.push('Find the lowest low price across all candles in the lookback window.');
  lines.push('');
  lines.push(CODE_BLOCK_TYPESCRIPT);
  lines.push('function computeReferenceLow(lookbackCandles: Candle[]): ReferenceLowResult {');
  lines.push('  // Returns { price: number, candleIndex: number }');
  lines.push('  // price = lowest low in lookback window');
  lines.push('  // candleIndex = which candle had that low');
  lines.push('}');
  lines.push('```');
  lines.push('');

  lines.push('## Step 2: Compute Forward Window Low (computeForwardWindow)');
  lines.push('');
  lines.push('Find the lowest low price in the forward window (prediction horizon).');
  lines.push('');
  lines.push(CODE_BLOCK_TYPESCRIPT);
  lines.push('function computeForwardWindow(forwardCandles: Candle[]): ForwardWindowResult {');
  lines.push('  // Returns { lowestPrice: number }');
  lines.push('}');
  lines.push('```');
  lines.push('');

  lines.push('## Step 3: Label Assignment (labelNoNewLow)');
  lines.push('');
  lines.push('Compare forward low to reference low:');
  lines.push('');
  lines.push(CODE_BLOCK_TYPESCRIPT);
  lines.push('function labelNoNewLow(refLowPrice: number, forwardLow: number): 0 | 1 {');
  lines.push('  return forwardLow >= refLowPrice ? 1 : 0;');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push('- **Label = 1 (noNewLow = true)**: Forward low ≥ reference low (bottom held)');
  lines.push('- **Label = 0 (noNewLow = false)**: Forward low < reference low (new low made)');
  lines.push('');

  lines.push('## Window Configuration (from TIMEFRAME_CONFIG)');
  lines.push('');
  lines.push('| Horizon | Lookback Window | Forward Window | Max Drawdown |');
  lines.push('| ------- | --------------- | -------------- | ------------ |');

  for (const id of TIMEFRAME_IDS) {
    const config = getTimeframeConfig(id);
    const lookback = formatMinutesAsTime(config.chart.range.fromMinutesAgo);
    const forward = formatMinutesAsTime(config.task.forwardWindowMinutes);
    const maxDrawdown = `${String(config.task.maxDrawdown * 100)}%`;
    lines.push(`| ${id}     | ${padRight(lookback, 15)} | ${padRight(forward, 14)} | ${maxDrawdown}       |`);
  }
  lines.push('');
  lines.push('Max drawdown tolerance is 0% - any undercut of the reference low means a new low was made (strict definition).');

  return lines.join('\n');
}

/**
 * Generate all documentation sections combined.
 * @returns Combined markdown documentation with all sections separated by horizontal rules
 */
export function generateAllDocumentation(): string {
  const sections = [
    generatePromptDocumentation(),
    generateTaskSpecTable(),
    generateScoringMethodology(),
    generateGroundTruthMethodology(),
  ];

  return sections.join('\n\n---\n\n');
}
