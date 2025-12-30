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

function padCenter(text: string, width: number): string {
  const padding = width - text.length;
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

function padLeft(text: string, width: number): string {
  return text.padStart(width);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDecimal(value: number): string {
  return value.toFixed(3);
}

function formatDecimal4(value: number | undefined): string {
  if (value === undefined) {
    return '-';
  }
  return value.toFixed(4);
}

function formatSignedDecimal4(value: number | undefined): string {
  if (value === undefined) {
    return '-';
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(4)}`;
}

export function printResultsTable(
  summaries: ModelSummary[],
  totalRounds: number,
  winner: ModelSummary | undefined
): void {
  // Check if any summary has expected value metrics
  const hasExpectedValueMetrics = summaries.some(
    (s) => s.meanDeltaMAE !== undefined
  );

  // Calculate total width based on whether EV metrics are present
  const totalWidth = hasExpectedValueMetrics
    ? COL_WIDTH_MODEL +
      1 +
      COL_WIDTH_METRIC +
      1 +
      COL_WIDTH_EV_METRIC * 4 +
      4
    : COL_WIDTH_MODEL + 1 + COL_WIDTH_METRIC * 3 + 4;

  // Title
  const title = `agent_005 Benchmark Results (${String(totalRounds)} rounds)`;
  const titleLine = VERTICAL + padCenter(title, totalWidth - 2) + VERTICAL;

  // Top border
  const topBorder = CORNER_TL + BORDER_CHAR.repeat(totalWidth - 2) + CORNER_TR;

  // Build separators and headers based on whether EV metrics are present
  let titleSeparator: string;
  let header: string;
  let headerSeparator: string;
  let footerSeparator: string;

  if (hasExpectedValueMetrics) {
    // Title separator with EV columns
    titleSeparator =
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

    // Header with EV columns
    header =
      VERTICAL +
      padCenter('Model', COL_WIDTH_MODEL) +
      VERTICAL +
      padCenter('Brier', COL_WIDTH_METRIC) +
      VERTICAL +
      padCenter('DeltaMAE', COL_WIDTH_EV_METRIC) +
      VERTICAL +
      padCenter('Mean EV', COL_WIDTH_EV_METRIC) +
      VERTICAL +
      padCenter('Mean PnL', COL_WIDTH_EV_METRIC) +
      VERTICAL +
      padCenter('EV-PnL', COL_WIDTH_EV_METRIC) +
      VERTICAL;

    // Header separator with EV columns
    headerSeparator =
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

    // Footer separator with EV columns
    footerSeparator =
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
  } else {
    // Original 3-column layout
    titleSeparator =
      T_RIGHT +
      BORDER_CHAR.repeat(COL_WIDTH_MODEL) +
      T_DOWN +
      BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
      T_DOWN +
      BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
      T_DOWN +
      BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
      T_LEFT;

    header =
      VERTICAL +
      padCenter('Model', COL_WIDTH_MODEL) +
      VERTICAL +
      padCenter('Brier', COL_WIDTH_METRIC) +
      VERTICAL +
      padCenter('LogLoss', COL_WIDTH_METRIC) +
      VERTICAL +
      padCenter('Accuracy', COL_WIDTH_METRIC) +
      VERTICAL;

    headerSeparator =
      T_RIGHT +
      BORDER_CHAR.repeat(COL_WIDTH_MODEL) +
      CROSS +
      BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
      CROSS +
      BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
      CROSS +
      BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
      T_LEFT;

    footerSeparator =
      T_RIGHT +
      BORDER_CHAR.repeat(COL_WIDTH_MODEL) +
      T_UP +
      BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
      T_UP +
      BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
      T_UP +
      BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
      T_LEFT;
  }

  // Data rows
  const dataRows = hasExpectedValueMetrics
    ? summaries.map(
        (s) =>
          VERTICAL +
          ' ' +
          s.modelId.padEnd(COL_WIDTH_MODEL - 1) +
          VERTICAL +
          padLeft(formatDecimal(s.meanBrier), COL_WIDTH_METRIC - 1) +
          ' ' +
          VERTICAL +
          padLeft(formatDecimal4(s.meanDeltaMAE), COL_WIDTH_EV_METRIC - 1) +
          ' ' +
          VERTICAL +
          padLeft(formatSignedDecimal4(s.meanEV), COL_WIDTH_EV_METRIC - 1) +
          ' ' +
          VERTICAL +
          padLeft(formatSignedDecimal4(s.meanPnL), COL_WIDTH_EV_METRIC - 1) +
          ' ' +
          VERTICAL +
          padLeft(formatSignedDecimal4(s.evPnLGap), COL_WIDTH_EV_METRIC - 1) +
          ' ' +
          VERTICAL
      )
    : summaries.map(
        (s) =>
          VERTICAL +
          ' ' +
          s.modelId.padEnd(COL_WIDTH_MODEL - 1) +
          VERTICAL +
          padLeft(formatDecimal(s.meanBrier), COL_WIDTH_METRIC - 1) +
          ' ' +
          VERTICAL +
          padLeft(formatDecimal(s.meanLogLoss), COL_WIDTH_METRIC - 1) +
          ' ' +
          VERTICAL +
          padLeft(formatPercent(s.meanAccuracy), COL_WIDTH_METRIC - 1) +
          ' ' +
          VERTICAL
      );

  // Winner line
  const winnerText =
    winner === undefined
      ? 'No winner determined'
      : `Winner: ${winner.modelId} (lowest Brier score)`;
  const winnerLine =
    VERTICAL + ' ' + winnerText.padEnd(totalWidth - 3) + VERTICAL;

  // Bottom border
  const bottomBorder =
    CORNER_BL + BORDER_CHAR.repeat(totalWidth - 2) + CORNER_BR;

  // Print everything
  /* eslint-disable no-console -- CLI table output */
  console.log(topBorder);
  console.log(titleLine);
  console.log(titleSeparator);
  console.log(header);
  console.log(headerSeparator);
  for (const row of dataRows) {
    console.log(row);
  }
  console.log(footerSeparator);
  console.log(winnerLine);
  console.log(bottomBorder);
  /* eslint-enable no-console -- Re-enable console rule after CLI table output */
}
