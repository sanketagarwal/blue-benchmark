/* eslint-disable no-restricted-syntax -- CLI table output requires console.log, cannot use BenchmarkLogger for ASCII table formatting */
/* eslint-disable jsdoc/require-returns, jsdoc/require-param-description -- Internal table formatting helpers don't need verbose JSDoc */
/* eslint-disable @typescript-eslint/no-use-before-define -- Table helpers are organized by logical grouping, not definition order */
/* eslint-disable unicorn/no-array-reduce -- reduce() is appropriate for finding min-by-predicate in evPnLGap */
import chalk from 'chalk';

import type { ModelSummary } from './results.js';

const COL_WIDTH_MODEL = 29;
const COL_WIDTH_METRIC = 9;
const COL_WIDTH_EV_METRIC = 10;
const BORDER_CHAR = '-';
const CORNER_TL = '+';
const CORNER_TR = '+';
const CORNER_BL = '+';
const CORNER_BR = '+';
const T_DOWN = '+';
const T_UP = '+';
const T_RIGHT = '+';
const T_LEFT = '+';
const CROSS = '+';
const VERTICAL = '|';

/**
 * Strips ANSI escape codes from text to get visual length
 * @param text
 */
function stripAnsiCodes(text: string): string {
  // eslint-disable-next-line no-control-regex -- ANSI escape code pattern
  return text.replaceAll(/\u001B\[[\d;]*m/g, '');
}

/**
 * Gets visual length of text (excluding ANSI codes)
 * @param text
 */
function visualLength(text: string): number {
  return stripAnsiCodes(text).length;
}

/**
 * Right-pads text to width (accounting for ANSI codes)
 * @param text
 * @param width
 */
function padEndVisual(text: string, width: number): string {
  const textWidth = visualLength(text);
  const padding = width - textWidth;
  return text + ' '.repeat(Math.max(0, padding));
}

/**
 * Centers text within a given width (accounting for ANSI codes)
 * @param text
 * @param width
 */
function padCenter(text: string, width: number): string {
  const textWidth = visualLength(text);
  const padding = width - textWidth;
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return ' '.repeat(Math.max(0, left)) + text + ' '.repeat(Math.max(0, right));
}

/**
 * Formats a number as a percentage
 * @param value
 */
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Formats a number to 3 decimal places
 * @param value
 */
function formatDecimal(value: number): string {
  return value.toFixed(3);
}

/**
 * Formats a number to 4 decimal places or returns '-' if undefined
 * @param value
 */
function formatDecimal4(value: number | undefined): string {
  if (value === undefined) {
    return '-';
  }
  return value.toFixed(4);
}

/**
 * Formats a number with sign to 4 decimal places
 * @param value
 */
function formatSignedDecimal4(value: number | undefined): string {
  if (value === undefined) {
    return '-';
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(4)}`;
}

type Quality = 'good' | 'ok' | 'poor';

/**
 * Determines quality rating for a metric value
 * @param value
 * @param goodThreshold
 * @param okThreshold
 * @param lowerIsBetter
 */
function getQuality(
  value: number,
  goodThreshold: number,
  okThreshold: number,
  lowerIsBetter: boolean
): Quality {
  if (lowerIsBetter) {
    if (value <= goodThreshold) {return 'good';}
    if (value <= okThreshold) {return 'ok';}
    return 'poor';
  }
  // Higher is better
  if (value >= goodThreshold) {return 'good';}
  if (value >= okThreshold) {return 'ok';}
  return 'poor';
}

/**
 * Applies chalk color based on quality
 * @param text
 * @param quality
 * @param isBest
 */
function applyQualityColor(text: string, quality: Quality, isBest: boolean): string {
  if (isBest) {
    if (quality === 'good') {return chalk.bold.green(text);}
    if (quality === 'ok') {return chalk.bold.yellow(text);}
    return chalk.bold.red(text);
  }
  if (quality === 'good') {return chalk.green(text);}
  if (quality === 'ok') {return chalk.yellow(text);}
  return chalk.red(text);
}

/**
 * Formats Brier score with quality coloring
 * @param value
 * @param isBest
 */
function formatBrierWithColor(value: number, isBest: boolean): string {
  const text = formatDecimal(value);
  const quality = getQuality(value, 0.25, 0.5, true);
  return applyQualityColor(text, quality, isBest);
}

/**
 * Formats DeltaMAE with quality coloring
 * @param value
 * @param isBest
 */
function formatDeltaMAEWithColor(value: number | undefined, isBest: boolean): string {
  if (value === undefined) {return '-';}
  const text = formatDecimal4(value);
  const quality = getQuality(value, 1, 2, true);
  return applyQualityColor(text, quality, isBest);
}

/**
 * Formats EV or PnL with quality coloring (higher is better)
 * @param value
 * @param isBest
 */
function formatEVWithColor(value: number | undefined, isBest: boolean): string {
  if (value === undefined) {return '-';}
  const text = formatSignedDecimal4(value);
  const quality = getQuality(value, 0, -0.1, false);
  return applyQualityColor(text, quality, isBest);
}

/**
 * Formats EV-PnL gap with quality coloring (closer to 0 is better)
 * @param value
 * @param isBest
 */
function formatGapWithColor(value: number | undefined, isBest: boolean): string {
  if (value === undefined) {return '-';}
  const text = formatSignedDecimal4(value);
  const quality = getQuality(Math.abs(value), 0.1, 0.3, true);
  return applyQualityColor(text, quality, isBest);
}

/**
 * Best values for each metric
 */
interface BestValues {
  brier: number;
  deltaMAE: number | undefined;
  meanEV: number | undefined;
  meanPnL: number | undefined;
  evPnLGap: number | undefined;
  logLoss: number;
  accuracy: number;
}

/**
 * Finds best (winning) values for each metric across all summaries
 * @param summaries
 */
function findBestValues(summaries: ModelSummary[]): BestValues {
  const definedDeltaMAE = summaries.map((s) => s.meanDeltaMAE).filter((v) => v !== undefined);
  const definedMeanEV = summaries.map((s) => s.meanEV).filter((v) => v !== undefined);
  const definedMeanPnL = summaries.map((s) => s.meanPnL).filter((v) => v !== undefined);
  const definedEventPnLGap = summaries.map((s) => s.evPnLGap).filter((v) => v !== undefined);

  return {
    brier: Math.min(...summaries.map((s) => s.meanBrier)),
    deltaMAE: definedDeltaMAE.length > 0 ? Math.min(...definedDeltaMAE) : undefined,
    meanEV: definedMeanEV.length > 0 ? Math.max(...definedMeanEV) : undefined,
    meanPnL: definedMeanPnL.length > 0 ? Math.max(...definedMeanPnL) : undefined,
    evPnLGap:
      definedEventPnLGap.length > 0
        ? definedEventPnLGap.reduce((best, v) => (Math.abs(v) < Math.abs(best) ? v : best))
        : undefined,
    logLoss: Math.min(...summaries.map((s) => s.meanLogLoss)),
    accuracy: Math.max(...summaries.map((s) => s.meanAccuracy)),
  };
}

/**
 * Prints the benchmark results table with color-coded metrics
 * @param summaries
 * @param totalRounds
 * @param winner
 */
export function printResultsTable(
  summaries: ModelSummary[],
  totalRounds: number,
  winner: ModelSummary | undefined
): void {
  const hasExpectedValueMetrics = summaries.some((s) => s.meanDeltaMAE !== undefined);
  const best = findBestValues(summaries);

  const totalWidth = hasExpectedValueMetrics
    ? COL_WIDTH_MODEL + 1 + COL_WIDTH_METRIC + 1 + COL_WIDTH_EV_METRIC * 4 + 4
    : COL_WIDTH_MODEL + 1 + COL_WIDTH_METRIC * 3 + 4;

  // Borders
  const topBorder = CORNER_TL + BORDER_CHAR.repeat(totalWidth - 2) + CORNER_TR;
  const bottomBorder = CORNER_BL + BORDER_CHAR.repeat(totalWidth - 2) + CORNER_BR;

  // Title
  const title = `agent_005 Benchmark Results (${String(totalRounds)} rounds)`;
  const titleLine = VERTICAL + padCenter(chalk.bold(title), totalWidth - 2) + VERTICAL;

  // Build layout based on mode
  const layout = hasExpectedValueMetrics
    ? buildEVLayout(totalWidth)
    : buildBasicLayout(totalWidth);

  // Data rows
  const dataRows = hasExpectedValueMetrics
    ? buildEVDataRows(summaries, best, winner)
    : buildBasicDataRows(summaries, best, winner);

  // Winner line
  const winnerText =
    winner === undefined
      ? 'No winner determined'
      : `Winner: ${chalk.bold.green(winner.modelId)} (lowest Brier score)`;
  const winnerLine = VERTICAL + ' ' + padEndVisual(winnerText, totalWidth - 4) + VERTICAL;

  // Print table
  /* eslint-disable no-console -- CLI table output */
  console.log(topBorder);
  console.log(titleLine);
  console.log(layout.titleSeparator);
  console.log(layout.header);
  console.log(layout.headerSeparator);
  for (const row of dataRows) {
    console.log(row);
  }
  console.log(layout.footerSeparator);
  console.log(winnerLine);
  console.log(bottomBorder);
  /* eslint-enable no-console -- Re-enable console rule */
}

interface TableLayout {
  titleSeparator: string;
  header: string;
  headerSeparator: string;
  footerSeparator: string;
}

/**
 * Builds layout for EV metrics table
 * @param totalWidth
 */
function buildEVLayout(totalWidth: number): TableLayout {
  void totalWidth; // Unused but kept for API consistency
  const titleSeparator =
    T_RIGHT +
    BORDER_CHAR.repeat(COL_WIDTH_MODEL) +
    T_DOWN +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_DOWN +
    BORDER_CHAR.repeat(COL_WIDTH_EV_METRIC) +
    T_DOWN +
    BORDER_CHAR.repeat(COL_WIDTH_EV_METRIC) +
    T_DOWN +
    BORDER_CHAR.repeat(COL_WIDTH_EV_METRIC) +
    T_DOWN +
    BORDER_CHAR.repeat(COL_WIDTH_EV_METRIC) +
    T_LEFT;

  const header =
    VERTICAL +
    padCenter(chalk.dim('Model'), COL_WIDTH_MODEL) +
    VERTICAL +
    padCenter(chalk.dim('Brier'), COL_WIDTH_METRIC) +
    VERTICAL +
    padCenter(chalk.dim('DeltaMAE'), COL_WIDTH_EV_METRIC) +
    VERTICAL +
    padCenter(chalk.dim('Mean EV'), COL_WIDTH_EV_METRIC) +
    VERTICAL +
    padCenter(chalk.dim('Mean PnL'), COL_WIDTH_EV_METRIC) +
    VERTICAL +
    padCenter(chalk.dim('EV-PnL'), COL_WIDTH_EV_METRIC) +
    VERTICAL;

  const headerSeparator =
    T_RIGHT +
    BORDER_CHAR.repeat(COL_WIDTH_MODEL) +
    CROSS +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    CROSS +
    BORDER_CHAR.repeat(COL_WIDTH_EV_METRIC) +
    CROSS +
    BORDER_CHAR.repeat(COL_WIDTH_EV_METRIC) +
    CROSS +
    BORDER_CHAR.repeat(COL_WIDTH_EV_METRIC) +
    CROSS +
    BORDER_CHAR.repeat(COL_WIDTH_EV_METRIC) +
    T_LEFT;

  const footerSeparator =
    T_RIGHT +
    BORDER_CHAR.repeat(COL_WIDTH_MODEL) +
    T_UP +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_UP +
    BORDER_CHAR.repeat(COL_WIDTH_EV_METRIC) +
    T_UP +
    BORDER_CHAR.repeat(COL_WIDTH_EV_METRIC) +
    T_UP +
    BORDER_CHAR.repeat(COL_WIDTH_EV_METRIC) +
    T_UP +
    BORDER_CHAR.repeat(COL_WIDTH_EV_METRIC) +
    T_LEFT;

  return { titleSeparator, header, headerSeparator, footerSeparator };
}

/**
 * Builds layout for basic 3-column table
 * @param totalWidth
 */
function buildBasicLayout(totalWidth: number): TableLayout {
  void totalWidth;
  const titleSeparator =
    T_RIGHT +
    BORDER_CHAR.repeat(COL_WIDTH_MODEL) +
    T_DOWN +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_DOWN +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_DOWN +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_LEFT;

  const header =
    VERTICAL +
    padCenter(chalk.dim('Model'), COL_WIDTH_MODEL) +
    VERTICAL +
    padCenter(chalk.dim('Brier'), COL_WIDTH_METRIC) +
    VERTICAL +
    padCenter(chalk.dim('LogLoss'), COL_WIDTH_METRIC) +
    VERTICAL +
    padCenter(chalk.dim('Accuracy'), COL_WIDTH_METRIC) +
    VERTICAL;

  const headerSeparator =
    T_RIGHT +
    BORDER_CHAR.repeat(COL_WIDTH_MODEL) +
    CROSS +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    CROSS +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    CROSS +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_LEFT;

  const footerSeparator =
    T_RIGHT +
    BORDER_CHAR.repeat(COL_WIDTH_MODEL) +
    T_UP +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_UP +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_UP +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_LEFT;

  return { titleSeparator, header, headerSeparator, footerSeparator };
}

/**
 * Builds data rows for EV metrics table
 * @param summaries
 * @param best
 * @param winner
 */
function buildEVDataRows(
  summaries: ModelSummary[],
  best: BestValues,
  winner: ModelSummary | undefined
): string[] {
  return summaries.map((s) => {
    const isWinner = winner !== undefined && s.modelId === winner.modelId;
    const modelName = isWinner ? chalk.bold.cyan(s.modelId) : chalk.cyan(s.modelId);
    const modelCell = ' ' + padEndVisual(modelName, COL_WIDTH_MODEL - 2);

    const brierCell = formatColoredCell(
      formatBrierWithColor(s.meanBrier, s.meanBrier === best.brier),
      COL_WIDTH_METRIC
    );
    const deltaCell = formatColoredCell(
      formatDeltaMAEWithColor(s.meanDeltaMAE, s.meanDeltaMAE === best.deltaMAE),
      COL_WIDTH_EV_METRIC
    );
    const eventCell = formatColoredCell(
      formatEVWithColor(s.meanEV, s.meanEV === best.meanEV),
      COL_WIDTH_EV_METRIC
    );
    const pnlCell = formatColoredCell(
      formatEVWithColor(s.meanPnL, s.meanPnL === best.meanPnL),
      COL_WIDTH_EV_METRIC
    );

    const isBestGap =
      s.evPnLGap !== undefined &&
      best.evPnLGap !== undefined &&
      Math.abs(s.evPnLGap) === Math.abs(best.evPnLGap);
    const gapCell = formatColoredCell(formatGapWithColor(s.evPnLGap, isBestGap), COL_WIDTH_EV_METRIC);

    return (
      VERTICAL +
      modelCell +
      VERTICAL +
      brierCell +
      VERTICAL +
      deltaCell +
      VERTICAL +
      eventCell +
      VERTICAL +
      pnlCell +
      VERTICAL +
      gapCell +
      VERTICAL
    );
  });
}

/**
 * Builds data rows for basic 3-column table
 * @param summaries
 * @param best
 * @param winner
 */
function buildBasicDataRows(
  summaries: ModelSummary[],
  best: BestValues,
  winner: ModelSummary | undefined
): string[] {
  return summaries.map((s) => {
    const isWinner = winner !== undefined && s.modelId === winner.modelId;
    const modelName = isWinner ? chalk.bold.cyan(s.modelId) : chalk.cyan(s.modelId);
    const modelCell = ' ' + padEndVisual(modelName, COL_WIDTH_MODEL - 2);

    const brierColored = formatBrierWithColor(s.meanBrier, s.meanBrier === best.brier);
    const logLossFormatted = formatDecimal(s.meanLogLoss);
    const logLossColored =
      s.meanLogLoss === best.logLoss ? chalk.bold.green(logLossFormatted) : logLossFormatted;
    const accuracyFormatted = formatPercent(s.meanAccuracy);
    const accuracyColored =
      s.meanAccuracy === best.accuracy ? chalk.bold.green(accuracyFormatted) : accuracyFormatted;

    return (
      VERTICAL +
      modelCell +
      VERTICAL +
      formatColoredCell(brierColored, COL_WIDTH_METRIC) +
      VERTICAL +
      formatColoredCell(logLossColored, COL_WIDTH_METRIC) +
      VERTICAL +
      formatColoredCell(accuracyColored, COL_WIDTH_METRIC) +
      VERTICAL
    );
  });
}

/**
 * Formats a colored string into a table cell with proper padding
 * Accounts for ANSI escape codes in the string
 * @param coloredText
 * @param width
 */
function formatColoredCell(coloredText: string, width: number): string {
  const textWidth = visualLength(coloredText);
  const padding = width - 1 - textWidth;
  return ' '.repeat(Math.max(0, padding)) + coloredText + ' ';
}
/* eslint-enable no-restricted-syntax, jsdoc/require-returns, jsdoc/require-param-description, @typescript-eslint/no-use-before-define, unicorn/no-array-reduce -- Re-enable after CLI table output */
