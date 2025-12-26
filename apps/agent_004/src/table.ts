import type { ModelSummary } from './results.js';

const COL_WIDTH_MODEL = 33;
const COL_WIDTH_METRIC = 9;
const BORDER_CHAR = '─';
const CORNER_TL = '┌';
const CORNER_TR = '┐';
const CORNER_BL = '└';
const CORNER_BR = '┘';
const T_DOWN = '┬';
const T_UP = '┴';
const T_RIGHT = '├';
const T_LEFT = '┤';
const CROSS = '┼';
const VERTICAL = '│';

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

export function printResultsTable(
  summaries: ModelSummary[],
  totalRounds: number,
  winner: ModelSummary | undefined
): void {
  const totalWidth = COL_WIDTH_MODEL + 1 + COL_WIDTH_METRIC * 3 + 4;

  // Title
  const title = `agent_004 Benchmark Results (${String(totalRounds)} rounds)`;
  const titleLine = VERTICAL + padCenter(title, totalWidth - 2) + VERTICAL;

  // Top border
  const topBorder =
    CORNER_TL +
    BORDER_CHAR.repeat(totalWidth - 2) +
    CORNER_TR;

  // Title separator
  const titleSep =
    T_RIGHT +
    BORDER_CHAR.repeat(COL_WIDTH_MODEL) +
    T_DOWN +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_DOWN +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_DOWN +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_LEFT;

  // Header
  const header =
    VERTICAL +
    padCenter('Model', COL_WIDTH_MODEL) +
    VERTICAL +
    padCenter('Brier', COL_WIDTH_METRIC) +
    VERTICAL +
    padCenter('LogLoss', COL_WIDTH_METRIC) +
    VERTICAL +
    padCenter('Accuracy', COL_WIDTH_METRIC) +
    VERTICAL;

  // Header separator
  const headerSep =
    T_RIGHT +
    BORDER_CHAR.repeat(COL_WIDTH_MODEL) +
    CROSS +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    CROSS +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    CROSS +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_LEFT;

  // Data rows
  const dataRows = summaries.map((s) =>
    VERTICAL +
    ' ' + s.modelId.padEnd(COL_WIDTH_MODEL - 1) +
    VERTICAL +
    padLeft(formatDecimal(s.meanBrier), COL_WIDTH_METRIC - 1) + ' ' +
    VERTICAL +
    padLeft(formatDecimal(s.meanLogLoss), COL_WIDTH_METRIC - 1) + ' ' +
    VERTICAL +
    padLeft(formatPercent(s.meanAccuracy), COL_WIDTH_METRIC - 1) + ' ' +
    VERTICAL
  );

  // Footer separator
  const footerSep =
    T_RIGHT +
    BORDER_CHAR.repeat(COL_WIDTH_MODEL) +
    T_UP +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_UP +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_UP +
    BORDER_CHAR.repeat(COL_WIDTH_METRIC) +
    T_LEFT;

  // Winner line
  const winnerText = winner
    ? `Winner: ${winner.modelId} (lowest Brier score)`
    : 'No winner determined';
  const winnerLine = VERTICAL + ' ' + winnerText.padEnd(totalWidth - 3) + VERTICAL;

  // Bottom border
  const bottomBorder =
    CORNER_BL +
    BORDER_CHAR.repeat(totalWidth - 2) +
    CORNER_BR;

  // Print everything
  console.log(topBorder);
  console.log(titleLine);
  console.log(titleSep);
  console.log(header);
  console.log(headerSep);
  for (const row of dataRows) {
    console.log(row);
  }
  console.log(footerSep);
  console.log(winnerLine);
  console.log(bottomBorder);
}
