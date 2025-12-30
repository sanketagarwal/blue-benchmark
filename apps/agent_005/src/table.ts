/* eslint-disable no-restricted-syntax -- CLI table output requires console.log */
/* eslint-disable unicorn/no-array-reduce -- reduce() is appropriate for finding min-by-predicate */
/* eslint-disable @typescript-eslint/no-use-before-define -- Table helpers organized by logical grouping */
import chalk from 'chalk';
import Table from 'cli-table3';

import type { ModelSummary } from './results.js';
import type { QuintileBucket } from './scorers/quintile-analyzer.js';

// Quality thresholds for color coding
const BRIER_GOOD = 0.25;
const BRIER_OK = 0.5;
const EV_GOOD = 0;
const EV_OK = -0.1;
const GAP_GOOD = 0.1;
const GAP_OK = 0.3;
const ACCURACY_GOOD = 0.7;
const ACCURACY_OK = 0.5;
const NO_WINNER_TEXT = 'No winner determined';

// Low sample warning constants
const MIN_FILLS_PER_SIDE_HORIZON = 10;
const LOW_SAMPLE_MARKER = '†';

type Quality = 'good' | 'ok' | 'poor';

interface LowSampleFlags {
  bidMAE: boolean;
  askMAE: boolean;
  bidEV: boolean;
  askEV: boolean;
  bidPnL: boolean;
  askPnL: boolean;
}

function getLowSampleFlags(summary: ModelSummary): LowSampleFlags {
  const fillCounts = summary.fillCounts;
  if (fillCounts === undefined) {
    return { bidMAE: false, askMAE: false, bidEV: false, askEV: false, bidPnL: false, askPnL: false };
  }

  const bidTotal = fillCounts.bid['1m'] + fillCounts.bid['5m'] + fillCounts.bid['15m'];
  const askTotal = fillCounts.ask['1m'] + fillCounts.ask['5m'] + fillCounts.ask['15m'];

  return {
    bidMAE: bidTotal < MIN_FILLS_PER_SIDE_HORIZON,
    askMAE: askTotal < MIN_FILLS_PER_SIDE_HORIZON,
    bidEV: bidTotal < MIN_FILLS_PER_SIDE_HORIZON,
    askEV: askTotal < MIN_FILLS_PER_SIDE_HORIZON,
    bidPnL: bidTotal < MIN_FILLS_PER_SIDE_HORIZON,
    askPnL: askTotal < MIN_FILLS_PER_SIDE_HORIZON,
  };
}

function formatWithWarning(value: string, isLowSample: boolean): string {
  if (isLowSample) {
    return chalk.dim(`${value}${LOW_SAMPLE_MARKER}`);
  }
  return value;
}

interface BestValues {
  brier: number;
  accuracy: number;
  deltaMAE: number | undefined;
  meanEV: number | undefined;
  evPnLGap: number | undefined;
}

function getQuality(value: number, goodThreshold: number, okThreshold: number, lowerIsBetter: boolean): Quality {
  if (lowerIsBetter) {
    if (value <= goodThreshold) {
      return 'good';
    }
    if (value <= okThreshold) {
      return 'ok';
    }
    return 'poor';
  }
  if (value >= goodThreshold) {
    return 'good';
  }
  if (value >= okThreshold) {
    return 'ok';
  }
  return 'poor';
}

function getQualityColor(quality: Quality): typeof chalk.green {
  if (quality === 'good') {
    return chalk.green;
  }
  if (quality === 'ok') {
    return chalk.yellow;
  }
  return chalk.red;
}

function colorize(text: string, quality: Quality, isBest: boolean): string {
  const colorFunction = getQualityColor(quality);
  return isBest ? chalk.bold(colorFunction(text)) : colorFunction(text);
}

function formatDecimal(value: number, places = 3): string {
  return value.toFixed(places);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSigned(value: number, places = 4): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(places)}`;
}

function findBestValues(summaries: ModelSummary[]): BestValues {
  const definedDeltaMAE = summaries.map((s) => s.meanNormalizedDeltaMAE).filter((v): v is number => v !== undefined);
  const definedMeanEV = summaries.map((s) => s.meanEV).filter((v): v is number => v !== undefined);
  const definedGap = summaries.map((s) => s.evPnLGap).filter((v): v is number => v !== undefined);

  return {
    brier: Math.min(...summaries.map((s) => s.meanBrier)),
    accuracy: Math.max(...summaries.map((s) => s.meanAccuracy)),
    deltaMAE: definedDeltaMAE.length > 0 ? Math.min(...definedDeltaMAE) : undefined,
    meanEV: definedMeanEV.length > 0 ? Math.max(...definedMeanEV) : undefined,
    evPnLGap: definedGap.length > 0 ? definedGap.reduce((best, v) => (Math.abs(v) < Math.abs(best) ? v : best)) : undefined,
  };
}

function formatBrier(value: number, best: number): string {
  const quality = getQuality(value, BRIER_GOOD, BRIER_OK, true);
  return colorize(formatDecimal(value), quality, value === best);
}

function formatAccuracy(value: number, best: number): string {
  const quality = getQuality(value, ACCURACY_GOOD, ACCURACY_OK, false);
  return colorize(formatPercent(value), quality, value === best);
}

function formatGap(value: number | undefined, best: number | undefined): string {
  if (value === undefined) {
    return chalk.dim('-');
  }
  const quality = getQuality(Math.abs(value), GAP_GOOD, GAP_OK, true);
  const isBest = best !== undefined && Math.abs(value) === Math.abs(best);
  return colorize(formatSigned(value), quality, isBest);
}

// Normalized MAE thresholds: good ≤ 0.5 ATR, ok ≤ 1.0 ATR
const NORMALIZED_MAE_GOOD = 0.5;
const NORMALIZED_MAE_OK = 1;

function formatNormalizedMAE(value: number | undefined): string {
  if (value === undefined) {
    return chalk.dim('-');
  }
  const quality = getQuality(value, NORMALIZED_MAE_GOOD, NORMALIZED_MAE_OK, true);
  return getQualityColor(quality)(value.toFixed(2));
}

function formatEVValue(value: number | undefined): string {
  if (value === undefined) {
    return chalk.dim('-');
  }
  const quality = getQuality(value, EV_GOOD, EV_OK, false);
  return getQualityColor(quality)(formatSigned(value, 3));
}

function formatPnLValue(value: number | undefined): string {
  if (value === undefined) {
    return chalk.dim('-');
  }
  return formatSigned(value, 3);
}

export function printResultsTable(
  summaries: ModelSummary[],
  totalRounds: number,
  winner: ModelSummary | undefined
): void {
  const hasEVMetrics = summaries.some((s) => s.meanNormalizedDeltaMAE !== undefined);
  const best = findBestValues(summaries);

  // eslint-disable-next-line no-console -- CLI output
  console.log();

  if (hasEVMetrics) {
    printEVTable(summaries, totalRounds, winner, best);
  } else {
    printBasicTable(summaries, totalRounds, winner, best);
  }
}

function printEVTable(
  summaries: ModelSummary[],
  totalRounds: number,
  winner: ModelSummary | undefined,
  best: BestValues
): void {
  const baselinePnL = summaries.find((s) => s.meanPnL !== undefined)?.meanPnL;

  const table = new Table({
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
    },
    colWidths: [22, 8, 8, 10, 10, 10, 10, 10, 10, 10],
    wordWrap: true,
    style: { head: [], border: [] }
  });

  // Title row
  table.push([{
    colSpan: 10,
    content: chalk.bold(`agent_005 EV Benchmark Results (${String(totalRounds)} rounds)`),
    hAlign: 'center'
  }]);

  // Group header row
  table.push([
    { content: '', hAlign: 'center' },
    { colSpan: 2, content: chalk.cyan.bold('Leg 1: Fill'), hAlign: 'center' },
    { colSpan: 2, content: chalk.cyan.bold('Leg 2: Δ MAE'), hAlign: 'center' },
    { colSpan: 2, content: chalk.cyan.bold('Leg 3: EV'), hAlign: 'center' },
    { colSpan: 2, content: chalk.cyan.bold('Leg 3: PnL'), hAlign: 'center' },
    { content: chalk.cyan.bold('Gap'), hAlign: 'center' },
  ]);

  // Column header row
  table.push([
    { content: chalk.dim('Model'), hAlign: 'center' },
    { content: chalk.dim('Brier↓'), hAlign: 'center' },
    { content: chalk.dim('Acc↑'), hAlign: 'center' },
    { content: chalk.dim('Bid↓'), hAlign: 'center' },
    { content: chalk.dim('Ask↓'), hAlign: 'center' },
    { content: chalk.dim('Bid'), hAlign: 'center' },
    { content: chalk.dim('Ask'), hAlign: 'center' },
    { content: chalk.dim('Bid'), hAlign: 'center' },
    { content: chalk.dim('Ask'), hAlign: 'center' },
    { content: chalk.dim('→0'), hAlign: 'center' },
  ]);

  // Data rows
  for (const s of summaries) {
    const isWinner = winner !== undefined && s.modelId === winner.modelId;
    const modelName = isWinner ? chalk.bold.cyan(s.modelId) : chalk.cyan(s.modelId);
    const flags = getLowSampleFlags(s);

    const bidMAE = s.bidMetrics?.meanNormalizedMAE;
    const askMAE = s.askMetrics?.meanNormalizedMAE;
    const bidEV = s.bidMetrics?.meanEV;
    const askEV = s.askMetrics?.meanEV;
    const bidPnL = s.bidMetrics?.meanPnL;
    const askPnL = s.askMetrics?.meanPnL;

    table.push([
      { content: modelName, hAlign: 'left' },
      { content: formatBrier(s.meanBrier, best.brier), hAlign: 'right' },
      { content: formatAccuracy(s.meanAccuracy, best.accuracy), hAlign: 'right' },
      { content: formatWithWarning(formatNormalizedMAE(bidMAE), flags.bidMAE), hAlign: 'right' },
      { content: formatWithWarning(formatNormalizedMAE(askMAE), flags.askMAE), hAlign: 'right' },
      { content: formatWithWarning(formatEVValue(bidEV), flags.bidEV), hAlign: 'right' },
      { content: formatWithWarning(formatEVValue(askEV), flags.askEV), hAlign: 'right' },
      { content: formatWithWarning(formatPnLValue(bidPnL), flags.bidPnL), hAlign: 'right' },
      { content: formatWithWarning(formatPnLValue(askPnL), flags.askPnL), hAlign: 'right' },
      { content: formatGap(s.evPnLGap, best.evPnLGap), hAlign: 'right' },
    ]);
  }

  // Footer with baseline PnL and winner
  const pnlText = baselinePnL === undefined
    ? 'Realized PnL: -'
    : `Realized PnL: ${formatSigned(baselinePnL)}`;
  const winnerText = winner === undefined
    ? NO_WINNER_TEXT
    : `Winner: ${chalk.bold.green(winner.modelId)}`;
  table.push([{
    colSpan: 10,
    content: `${chalk.dim(pnlText)}  │  ${winnerText}`,
    hAlign: 'left'
  }]);

  // Footnote for low sample warning
  const hasLowSamples = summaries.some((s) => {
    const flags = getLowSampleFlags(s);
    return Object.values(flags).some(Boolean);
  });
  if (hasLowSamples) {
    table.push([{
      colSpan: 10,
      content: chalk.dim(`${LOW_SAMPLE_MARKER} Low sample size (<${String(MIN_FILLS_PER_SIDE_HORIZON)} fills) - interpret with caution`),
      hAlign: 'left'
    }]);
  }

  // eslint-disable-next-line no-console -- CLI table output
  console.log(table.toString());
}

function printBasicTable(
  summaries: ModelSummary[],
  totalRounds: number,
  winner: ModelSummary | undefined,
  best: BestValues
): void {
  const table = new Table({
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
    },
    style: { head: [], border: [] }
  });

  // Title
  table.push([{ colSpan: 4, content: chalk.bold(`agent_005 Benchmark Results (${String(totalRounds)} rounds)`), hAlign: 'center' }]);

  // Headers
  table.push([
    { content: chalk.dim('Model'), hAlign: 'center' },
    { content: chalk.dim('Brier↓'), hAlign: 'center' },
    { content: chalk.dim('LogLoss↓'), hAlign: 'center' },
    { content: chalk.dim('Accuracy↑'), hAlign: 'center' },
  ]);

  // Data rows
  for (const s of summaries) {
    const isWinner = winner !== undefined && s.modelId === winner.modelId;
    const modelName = isWinner ? chalk.bold.cyan(s.modelId) : chalk.cyan(s.modelId);

    const logLossQuality = getQuality(s.meanLogLoss, 0.5, 1, true);
    const logLossFormatted = colorize(formatDecimal(s.meanLogLoss), logLossQuality, s.meanLogLoss === Math.min(...summaries.map((x) => x.meanLogLoss)));

    table.push([
      { content: modelName, hAlign: 'left' },
      { content: formatBrier(s.meanBrier, best.brier), hAlign: 'right' },
      { content: logLossFormatted, hAlign: 'right' },
      { content: formatAccuracy(s.meanAccuracy, best.accuracy), hAlign: 'right' },
    ]);
  }

  // Winner
  const winnerText = winner === undefined
    ? NO_WINNER_TEXT
    : `Winner: ${chalk.bold.green(winner.modelId)} (lowest Brier score)`;
  table.push([{ colSpan: 4, content: winnerText, hAlign: 'left' }]);

  // eslint-disable-next-line no-console -- CLI table output
  console.log(table.toString());
}

/**
 * Print EV quintile analysis table for a single model.
 * Shows calibration across the prediction distribution.
 *
 * @param buckets - Array of 5 quintile buckets
 * @param modelId - Model identifier for the table title
 */
export function printQuintileTable(buckets: QuintileBucket[], modelId: string): void {
  const table = new Table({
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
    },
    style: { head: [], border: [] }
  });

  // Title row
  table.push([{
    colSpan: 5,
    content: chalk.bold(`EV Quintile Analysis: ${modelId}`),
    hAlign: 'center'
  }]);

  // Column header row
  table.push([
    { content: chalk.dim('Quintile'), hAlign: 'center' },
    { content: chalk.dim('Mean EV'), hAlign: 'center' },
    { content: chalk.dim('Mean PnL'), hAlign: 'center' },
    { content: chalk.dim('Gap'), hAlign: 'center' },
    { content: chalk.dim('N'), hAlign: 'center' },
  ]);

  // Data rows
  for (const bucket of buckets) {
    const gapQuality = getQuality(Math.abs(bucket.evPnLGap), GAP_GOOD, GAP_OK, true);
    const gapColor = getQualityColor(gapQuality);

    table.push([
      { content: bucket.label, hAlign: 'left' },
      { content: bucket.sampleCount > 0 ? formatSigned(bucket.meanPredictedEV, 3) : '-', hAlign: 'right' },
      { content: bucket.sampleCount > 0 ? formatSigned(bucket.meanRealizedPnL, 3) : '-', hAlign: 'right' },
      { content: bucket.sampleCount > 0 ? gapColor(formatSigned(bucket.evPnLGap, 3)) : '-', hAlign: 'right' },
      { content: String(bucket.sampleCount), hAlign: 'right' },
    ]);
  }

  // eslint-disable-next-line no-console -- CLI table output
  console.log(table.toString());
}
/* eslint-enable no-restricted-syntax, unicorn/no-array-reduce, @typescript-eslint/no-use-before-define -- Re-enable after CLI table output */
