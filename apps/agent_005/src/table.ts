/* eslint-disable no-restricted-syntax -- CLI table output requires console.log */
/* eslint-disable unicorn/no-array-reduce -- reduce() is appropriate for finding min-by-predicate */
/* eslint-disable @typescript-eslint/no-use-before-define -- Table helpers organized by logical grouping */
import chalk from 'chalk';
import Table from 'cli-table3';

import type { ModelSummary } from './results.js';

// Quality thresholds for color coding
const BRIER_GOOD = 0.25;
const BRIER_OK = 0.5;
const DELTA_MAE_GOOD = 1;
const DELTA_MAE_OK = 2;
const EV_GOOD = 0;
const EV_OK = -0.1;
const GAP_GOOD = 0.1;
const GAP_OK = 0.3;
const ACCURACY_GOOD = 0.7;
const ACCURACY_OK = 0.5;
const NO_WINNER_TEXT = 'No winner determined';

type Quality = 'good' | 'ok' | 'poor';

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
  const definedDeltaMAE = summaries.map((s) => s.meanDeltaMAE).filter((v): v is number => v !== undefined);
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

function formatDeltaMAE(value: number | undefined, best: number | undefined): string {
  if (value === undefined) {
    return chalk.dim('-');
  }
  const quality = getQuality(value, DELTA_MAE_GOOD, DELTA_MAE_OK, true);
  return colorize(formatDecimal(value, 4), quality, value === best);
}

function formatEV(value: number | undefined, best: number | undefined): string {
  if (value === undefined) {
    return chalk.dim('-');
  }
  const quality = getQuality(value, EV_GOOD, EV_OK, false);
  return colorize(formatSigned(value), quality, value === best);
}

function formatGap(value: number | undefined, best: number | undefined): string {
  if (value === undefined) {
    return chalk.dim('-');
  }
  const quality = getQuality(Math.abs(value), GAP_GOOD, GAP_OK, true);
  const isBest = best !== undefined && Math.abs(value) === Math.abs(best);
  return colorize(formatSigned(value), quality, isBest);
}

export function printResultsTable(
  summaries: ModelSummary[],
  totalRounds: number,
  winner: ModelSummary | undefined
): void {
  const hasEVMetrics = summaries.some((s) => s.meanDeltaMAE !== undefined);
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
  // Get the shared PnL baseline (same for all models)
  const baselinePnL = summaries.find((s) => s.meanPnL !== undefined)?.meanPnL;

  const table = new Table({
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
    },
    colWidths: [26, 9, 9, 12, 12, 12],
    wordWrap: true,
    style: { head: [], border: [] }
  });

  // Title row
  table.push([{
    colSpan: 6,
    content: chalk.bold(`agent_005 EV Benchmark Results (${String(totalRounds)} rounds)`),
    hAlign: 'center'
  }]);

  // Group header row
  table.push([
    { content: '', hAlign: 'center' },
    { colSpan: 2, content: chalk.cyan.bold('Leg 1: Fill'), hAlign: 'center' },
    { content: chalk.cyan.bold('Leg 2: Δ'), hAlign: 'center' },
    { colSpan: 2, content: chalk.cyan.bold('Leg 3: Value'), hAlign: 'center' },
  ]);

  // Column header row
  table.push([
    { content: chalk.dim('Model'), hAlign: 'center' },
    { content: chalk.dim('Brier↓'), hAlign: 'center' },
    { content: chalk.dim('Acc↑'), hAlign: 'center' },
    { content: chalk.dim('MAE↓'), hAlign: 'center' },
    { content: chalk.dim('EV'), hAlign: 'center' },
    { content: chalk.dim('Gap→0'), hAlign: 'center' },
  ]);

  // Data rows
  for (const s of summaries) {
    const isWinner = winner !== undefined && s.modelId === winner.modelId;
    const modelName = isWinner ? chalk.bold.cyan(s.modelId) : chalk.cyan(s.modelId);

    table.push([
      { content: modelName, hAlign: 'left' },
      { content: formatBrier(s.meanBrier, best.brier), hAlign: 'right' },
      { content: formatAccuracy(s.meanAccuracy, best.accuracy), hAlign: 'right' },
      { content: formatDeltaMAE(s.meanDeltaMAE, best.deltaMAE), hAlign: 'right' },
      { content: formatEV(s.meanEV, best.meanEV), hAlign: 'right' },
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
    colSpan: 6,
    content: `${chalk.dim(pnlText)}  │  ${winnerText}`,
    hAlign: 'left'
  }]);

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
/* eslint-enable no-restricted-syntax, unicorn/no-array-reduce, @typescript-eslint/no-use-before-define -- Re-enable after CLI table output */
