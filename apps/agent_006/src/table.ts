/* eslint-disable no-restricted-syntax -- CLI table output requires console.log */
import chalk from 'chalk';
import Table from 'cli-table3';

import type { Horizon } from './horizon-config.js';
import type { PerHorizonRankings } from './scorers/phase-3-scorer.js';

// Quality thresholds for color coding
const LOG_LOSS_GOOD = 0.5;
const LOG_LOSS_OK = 0.8;

type Quality = 'good' | 'ok' | 'poor';

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

function getRankMedal(rank: number): string {
  if (rank === 1) {
    return '🥇';
  }
  if (rank === 2) {
    return '🥈';
  }
  if (rank === 3) {
    return '🥉';
  }
  return `${String(rank)}.`;
}

/**
 * Print per-horizon arena results table
 *
 * @param rankings - Per-horizon rankings from Phase 3
 */
export function printPerHorizonArenaTable(
  rankings: PerHorizonRankings
): void {
  const HORIZONS: Horizon[] = ['15m', '1h', '24h', '7d'];

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const horizonRankings = rankings[horizon];
    if (horizonRankings.length === 0) {
      continue;
    }

    const title = `${horizon} Arena Winners:`;
    // eslint-disable-next-line no-console -- CLI output
    console.log(`\n${chalk.bold.cyan(title)}`);

    const table = new Table({
      chars: {
        'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
        'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
        'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
        'right': '│', 'right-mid': '┤', 'middle': '│'
      },
      style: { head: [], border: [] }
    });

    table.push([
      { content: chalk.dim('Rank'), hAlign: 'center' },
      { content: chalk.dim('Model'), hAlign: 'center' },
      { content: chalk.dim('Score'), hAlign: 'center' },
      { content: chalk.dim('Log Loss'), hAlign: 'center' },
    ]);

    for (const [index, r] of horizonRankings.entries()) {
      const medal = getRankMedal(index + 1);
      const llQuality = getQuality(r.logLoss, LOG_LOSS_GOOD, LOG_LOSS_OK, true);
      table.push([
        { content: medal, hAlign: 'center' },
        { content: chalk.cyan(r.modelId), hAlign: 'left' },
        { content: r.score.toFixed(4), hAlign: 'right' },
        { content: colorize(r.logLoss.toFixed(3), llQuality, false), hAlign: 'right' },
      ]);
    }

    // eslint-disable-next-line no-console -- CLI output
    console.log(table.toString());
  }
}

/**
 * Minimal model state required for summary table
 */
interface MinimalModelState {
  modelId: string;
  eliminated: boolean;
  eliminatedInPhase?: number;
}

/**
 * Print final summary table with ALL models and ALL metrics
 *
 * @param models - Array of all model states
 * @param computeMeanLogLoss - Function to compute mean log loss for a model
 */
export function printFinalSummaryTable<T extends MinimalModelState>(
  models: T[],
  computeMeanLogLoss: (state: T) => Record<Horizon, number>
): void {
  const table = new Table({
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
    },
    colWidths: [6, 35, 12, 10, 10, 10, 10, 10],
    wordWrap: true,
    style: { head: [], border: [] }
  });

  // Title
  table.push([{
    colSpan: 8,
    content: chalk.bold('Final Model Summary'),
    hAlign: 'center'
  }]);

  // Headers
  table.push([
    { content: chalk.dim('Rank'), hAlign: 'center' },
    { content: chalk.dim('Model'), hAlign: 'center' },
    { content: chalk.dim('Status'), hAlign: 'center' },
    { content: chalk.dim('LL-15m'), hAlign: 'center' },
    { content: chalk.dim('LL-1h'), hAlign: 'center' },
    { content: chalk.dim('LL-24h'), hAlign: 'center' },
    { content: chalk.dim('LL-7d'), hAlign: 'center' },
    { content: chalk.dim('Mean'), hAlign: 'center' },
  ]);

  // Build sorted list of all models by mean log loss
  const allModelsSorted: { state: T; meanLL: number; status: string }[] = [];

  for (const state of models) {
    const meanLogLoss = computeMeanLogLoss(state);
    const mean = (meanLogLoss['15m'] + meanLogLoss['1h'] + meanLogLoss['24h'] + meanLogLoss['7d']) / 4;
    const status = state.eliminated
      ? `P${String(state.eliminatedInPhase ?? '?')}`
      : 'WINNER';
    allModelsSorted.push({ state, meanLL: mean, status });
  }
  allModelsSorted.sort((a, b) => a.meanLL - b.meanLL);

  // Helper to format log loss with color (returns dim "-" for NaN)
  const formatLogLossColored = (value: number): string => {
    if (Number.isNaN(value)) {
      return chalk.dim('-');
    }
    const quality = getQuality(value, LOG_LOSS_GOOD, LOG_LOSS_OK, true);
    return colorize(value.toFixed(3), quality, false);
  };

  // Add data rows
  for (const [index, { state, meanLL, status }] of allModelsSorted.entries()) {
    const rank = index + 1;
    const ll = computeMeanLogLoss(state);
    const statusContent = status === 'WINNER' ? chalk.green(status) : chalk.red(status);

    table.push([
      { content: String(rank), hAlign: 'center' },
      { content: chalk.cyan(state.modelId), hAlign: 'left' },
      { content: statusContent, hAlign: 'center' },
      { content: formatLogLossColored(ll['15m']), hAlign: 'right' },
      { content: formatLogLossColored(ll['1h']), hAlign: 'right' },
      { content: formatLogLossColored(ll['24h']), hAlign: 'right' },
      { content: formatLogLossColored(ll['7d']), hAlign: 'right' },
      { content: Number.isNaN(meanLL) ? chalk.dim('-') : formatLogLossColored(meanLL), hAlign: 'right' },
    ]);
  }

  // eslint-disable-next-line no-console -- CLI output
  console.log(table.toString());
}
/* eslint-enable no-restricted-syntax -- Re-enable after CLI table output */
