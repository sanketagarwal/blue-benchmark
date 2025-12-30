/* eslint-disable no-restricted-syntax -- BenchmarkLogger is the canonical console output wrapper, must use console.log internally */
import chalk from 'chalk';
import ora from 'ora';

import type { Ora } from 'ora';

/**
 * Options for BenchmarkLogger
 */
export interface BenchmarkLoggerOptions {
  verbose?: boolean;
}

// Shared separator for metric guide sections
const METRIC_GUIDE_SEPARATOR = '───────────────────────────────────────';

/**
 * Logger for benchmark CLI applications with spinner and verbose mode support
 */
export class BenchmarkLogger {
  private readonly verbose: boolean;
  private spinner: Ora | undefined = undefined;

  /**
   * Create a new BenchmarkLogger
   */
  constructor(options: BenchmarkLoggerOptions = {}) {
    this.verbose = options.verbose ?? false;
  }

  /**
   * Start a spinner with the given text
   */
  startSpinner(text: string): void {
    this.spinner = ora(text).start();
  }

  /**
   * Update the spinner text
   */
  updateSpinner(text: string): void {
    if (this.spinner) {
      this.spinner.text = text;
    }
  }

  /**
   * Mark the spinner as succeeded
   */
  succeedSpinner(text?: string): void {
    if (this.spinner) {
      this.spinner.succeed(text);
    }
    this.spinner = undefined;
  }

  /**
   * Mark the spinner as failed
   */
  failSpinner(text?: string): void {
    if (this.spinner) {
      this.spinner.fail(text);
    }
    this.spinner = undefined;
  }

  /**
   * Log a message (verbose only)
   */
  log(message: string): void {
    if (this.verbose) {
      console.log(message);
    }
  }

  /**
   * Log predictions (verbose only)
   */
  logPredictions(predictions: Record<string, number>): void {
    if (!this.verbose) {
      return;
    }
    console.log(chalk.cyan('\nPredictions:'));
    for (const [key, value] of Object.entries(predictions)) {
      console.log(chalk.gray(`  ${key.padEnd(20)} ${value.toFixed(3)}`));
    }
  }

  /**
   * Format a single ground truth entry with prediction verdict
   */
  private formatGroundTruthEntry(key: string, actual: boolean, prediction: number | undefined): string {
    const outcomeIcon = actual ? chalk.blue('YES') : chalk.gray('NO ');

    if (prediction === undefined) {
      return '  ' + key.padEnd(20) + ' ' + outcomeIcon;
    }

    const predictedYes = prediction >= 0.5;
    const correct = predictedYes === actual;
    const verdictIcon = correct ? chalk.green('✓') : chalk.red('✗');
    const verdictText = correct ? chalk.green('correct') : chalk.red('wrong');
    const predictionString = prediction.toFixed(2);
    const needed = actual ? '≥0.50' : '<0.50';
    const neededLabel = chalk.dim('(needed ' + needed + ')');

    return '  ' + key.padEnd(18) + ' ' + outcomeIcon + '  pred=' + predictionString + '  ' + verdictIcon + ' ' + verdictText + ' ' + neededLabel;
  }

  /**
   * Log ground truth values with prediction accuracy (verbose only)
   * Shows whether event occurred AND whether prediction was correct
   */
  logGroundTruth(actuals: Record<string, boolean>, predictions?: Record<string, number>): void {
    if (!this.verbose) {
      return;
    }
    console.log(chalk.cyan('\nGround Truth (outcome vs prediction):'));
    for (const [key, value] of Object.entries(actuals)) {
      console.log(this.formatGroundTruthEntry(key, value, predictions?.[key]));
    }
  }

  /**
   * Log scores with quality indicators (verbose only)
   */
  logScores(scores: { brier?: number; logLoss?: number; accuracy?: number }): void {
    if (!this.verbose) {
      return;
    }
    const parts: string[] = [];
    if (scores.brier !== undefined) {
      const quality = this.getScoreQuality(scores.brier, 0.25, 0.5, true);
      const qualityLabel = chalk.dim('(' + quality + ')');
      parts.push(`Brier=${scores.brier.toFixed(3)} ${qualityLabel}`);
    }
    if (scores.logLoss !== undefined) {
      const quality = this.getScoreQuality(scores.logLoss, 0.5, 1, true);
      const qualityLabel = chalk.dim('(' + quality + ')');
      parts.push(`LogLoss=${scores.logLoss.toFixed(3)} ${qualityLabel}`);
    }
    if (scores.accuracy !== undefined) {
      const quality = this.getScoreQuality(scores.accuracy, 0.7, 0.5, false);
      const qualityLabel = chalk.dim('(' + quality + ')');
      parts.push(`Accuracy=${(scores.accuracy * 100).toFixed(1)}% ${qualityLabel}`);
    }
    console.log(chalk.yellow('\nScores: ' + parts.join(', ')));
  }

  /**
   * Get quality indicator for a score
   * @param value - The score value
   * @param goodThreshold - Threshold for "good" quality
   * @param okThreshold - Threshold for "ok" quality
   * @param lowerIsBetter - If true, lower values are better (Brier, LogLoss)
   */
  private getScoreQuality(value: number, goodThreshold: number, okThreshold: number, lowerIsBetter: boolean): string {
    if (lowerIsBetter) {
      if (value < goodThreshold) {
        return chalk.green('good');
      }
      if (value < okThreshold) {
        return chalk.yellow('ok');
      }
      return chalk.red('poor');
    }
    // Higher is better (accuracy)
    if (value > goodThreshold) {
      return chalk.green('good');
    }
    if (value > okThreshold) {
      return chalk.yellow('ok');
    }
    return chalk.red('poor');
  }

  /**
   * Log a hint/tip message (verbose only)
   */
  hint(message: string): void {
    if (!this.verbose) {
      return;
    }
    console.log(chalk.dim(`\n💡 ${message}`));
  }

  /**
   * Output a header (always displayed)
   */
  header(title: string): void {
    console.log(chalk.bold(title));
    console.log('='.repeat(title.length));
  }

  /**
   * Output agent objective/context (verbose only)
   */
  objective(description: string): void {
    if (!this.verbose) {
      return;
    }
    console.log(chalk.cyan(`\n📊 Objective: ${description}`));
  }

  /**
   * Output metric explanations (verbose only)
   */
  explainMetrics(): void {
    if (!this.verbose) {
      return;
    }
    console.log(chalk.dim('\n' + METRIC_GUIDE_SEPARATOR));
    console.log(chalk.dim('📖 Metric Guide:'));
    console.log(chalk.dim('   Brier Score: 0=perfect, 1=worst (measures probability calibration)'));
    console.log(chalk.dim('   Log Loss: 0=perfect, ∞=worst (penalizes confident wrong predictions)'));
    console.log(chalk.dim('   Accuracy: % correct at 0.5 threshold (did prediction match outcome?)'));
    console.log(chalk.dim(METRIC_GUIDE_SEPARATOR));
  }

  /**
   * Output a summary (always displayed)
   */
  summary(data: Record<string, string | number>): void {
    console.log(chalk.bold('\nResults'));
    console.log('-------');
    for (const [key, value] of Object.entries(data)) {
      const formatted = typeof value === 'number' ? value.toFixed(3) : value;
      console.log(`${key}: ${formatted}`);
    }
  }

  /**
   * Log a move (verbose only)
   */
  logMove(move: string, result: string): void {
    if (!this.verbose) {
      return;
    }
    console.log(chalk.gray(`  Move: ${move} \u2192 ${result}`));
  }

  /**
   * Log game state (verbose only)
   */
  logGameState(state: string): void {
    if (!this.verbose) {
      return;
    }
    console.log(chalk.dim(state));
  }

  /**
   * Log model round start with colored model name (always displayed)
   * For multi-model matrix benchmarks
   */
  logModelRound(modelId: string, roundNumber: number, totalRounds: number): void {
    const modelLabel = chalk.cyan(modelId);
    console.log(`  Round ${String(roundNumber)}/${String(totalRounds)}: ${modelLabel}`);
  }

  /**
   * Log model round scores in compact format (non-verbose only)
   * Shows basic metrics without verbose details
   * Skips logging if verbose mode is enabled (since detailed logs are shown instead)
   */
  logModelScoreCompact(modelId: string, brier: number, accuracy: number): void {
    if (this.verbose) {
      return;
    }
    const modelLabel = chalk.cyan(modelId);
    console.log(`  ${modelLabel}: Brier=${brier.toFixed(3)}, Accuracy=${(accuracy * 100).toFixed(1)}%`);
  }

  /**
   * Log EV metrics with quality indicators (verbose only)
   * Shows delta-mid MAE, PnL, EV, and EV-PnL gap
   */
  logEVMetrics(metrics: {
    deltaMidMAE?: number | undefined;
    deltaMidBias?: number | undefined;
    totalPnL?: number | undefined;
    meanPnL?: number | undefined;
    filledCount?: number | undefined;
    totalEV?: number | undefined;
    meanEV?: number | undefined;
    evPnlGap?: number | undefined;
    systematicOverestimation?: boolean | undefined;
  }): void {
    if (!this.verbose) {
      return;
    }

    this.logDeltaMidMetrics(metrics.deltaMidMAE, metrics.deltaMidBias);
    this.logPnlMetrics(metrics.meanPnL, metrics.totalPnL, metrics.filledCount);
    this.logExpectedValueMetrics(metrics.meanEV, metrics.totalEV);
    this.logEvPnlGapMetrics(metrics.evPnlGap, metrics.systematicOverestimation);
  }

  /**
   * Log delta-mid metrics line
   */
  private logDeltaMidMetrics(mae: number | undefined, bias: number | undefined): void {
    if (mae === undefined) {
      return;
    }
    const maeQuality = this.getScoreQuality(mae, 1, 2, true);
    const biasLabel = bias === undefined ? '' : `, Bias=${bias.toFixed(4)}`;
    console.log(chalk.gray(`    Delta-Mid MAE=${mae.toFixed(4)}${biasLabel} ${chalk.dim('(' + maeQuality + ')')}`));
  }

  /**
   * Log PnL metrics line
   */
  private logPnlMetrics(meanPnL: number | undefined, totalPnL: number | undefined, filledCount: number | undefined): void {
    if (meanPnL === undefined) {
      return;
    }
    const pnlQuality = this.getScoreQuality(meanPnL, 0, -0.1, false);
    const filledLabel = filledCount === undefined ? '' : `, Fills=${String(filledCount)}`;
    const totalLabel = totalPnL === undefined ? '' : `Total=${totalPnL.toFixed(4)}, `;
    console.log(chalk.gray(`    PnL ${totalLabel}Mean=${meanPnL.toFixed(4)}${filledLabel} ${chalk.dim('(' + pnlQuality + ')')}`));
  }

  /**
   * Log EV metrics line
   */
  private logExpectedValueMetrics(meanEV: number | undefined, totalEV: number | undefined): void {
    if (meanEV === undefined) {
      return;
    }
    const totalLabel = totalEV === undefined ? '' : `Total=${totalEV.toFixed(4)}, `;
    console.log(chalk.gray(`    EV ${totalLabel}Mean=${meanEV.toFixed(4)}`));
  }

  /**
   * Log EV-PnL gap metrics line
   */
  private logEvPnlGapMetrics(gap: number | undefined, systematicOverestimation: boolean | undefined): void {
    if (gap === undefined) {
      return;
    }
    const gapQuality = this.getScoreQuality(Math.abs(gap), 0.1, 0.5, true);
    const estimationLabel = systematicOverestimation === true ? 'overestimates' : 'underestimates';
    console.log(chalk.gray(`    EV-PnL Gap=${gap.toFixed(4)} ${chalk.dim('(' + gapQuality + ', model ' + estimationLabel + ')')}`));
  }

  /**
   * Output EV metric explanations (verbose only)
   */
  explainEVMetrics(): void {
    if (!this.verbose) {
      return;
    }
    console.log(chalk.dim('\n' + METRIC_GUIDE_SEPARATOR));
    console.log(chalk.dim('📖 EV Metric Guide:'));
    console.log(chalk.dim('   Delta-mid MAE: Measures how well the model predicts price movement after fills'));
    console.log(chalk.dim('   PnL: Realized profit/loss from filled trades'));
    console.log(chalk.dim('   EV: Expected value of trades based on model predictions'));
    console.log(chalk.dim('   EV-PnL Gap: Shows if model predictions match reality'));
    console.log(chalk.dim('     - Negative gap = model underestimates value (conservative)'));
    console.log(chalk.dim('     - Positive gap = model overestimates value (optimistic)'));
    console.log(chalk.dim(METRIC_GUIDE_SEPARATOR));
  }

  /**
   * Log round header with timestamp (always displayed)
   * For multi-model matrix benchmarks
   */
  logRoundHeader(roundNumber: number, totalRounds: number, timestamp: Date): void {
    console.log(chalk.bold(`\nRound ${String(roundNumber)}/${String(totalRounds)}`) + chalk.dim(` (${timestamp.toISOString()})`));
  }

  /**
   * Log detailed model predictions (verbose only)
   * Shows all predictions in a nicely formatted way
   */
  logModelPredictions(modelId: string, predictions: Record<string, number>): void {
    if (!this.verbose) {
      return;
    }
    console.log(chalk.cyan(`  ${modelId}:`));
    console.log(chalk.gray(`    Predictions: ${JSON.stringify(predictions)}`));
  }

  /**
   * Log basic scores inline (verbose only)
   * Shows Brier and Accuracy in compact format
   */
  logBasicScoresInline(brier: number, accuracy: number): void {
    if (!this.verbose) {
      return;
    }
    const brierQuality = this.getScoreQuality(brier, 0.25, 0.5, true);
    const accuracyQuality = this.getScoreQuality(accuracy, 0.7, 0.5, false);
    console.log(chalk.gray(`    Brier=${brier.toFixed(3)} ${chalk.dim('(' + brierQuality + ')')}, Accuracy=${(accuracy * 100).toFixed(1)}% ${chalk.dim('(' + accuracyQuality + ')')}`));
  }

  /**
   * Output benchmark info header (always displayed)
   */
  logBenchmarkInfo(info: { symbol?: string; startTime?: string; models?: string[]; rounds?: number }): void {
    if (info.symbol !== undefined) {
      console.log(`Symbol: ${info.symbol}`);
    }
    if (info.startTime !== undefined) {
      console.log(`Start Time: ${info.startTime}`);
    }
    if (info.models !== undefined && info.models.length > 0) {
      console.log(`Models: ${info.models.join(', ')}`);
    }
    if (info.rounds !== undefined) {
      console.log(`Rounds: ${String(info.rounds)}`);
    }
    console.log('');
  }

  /**
   * Output a blank newline (always displayed)
   */
  newline(): void {
    console.log('');
  }
}

/**
 * Factory function to create a BenchmarkLogger
 */
export function createBenchmarkLogger(verbose?: boolean): BenchmarkLogger {
  if (verbose === undefined) {
    return new BenchmarkLogger({});
  }
  return new BenchmarkLogger({ verbose });
}
/* eslint-enable no-restricted-syntax -- Re-enable after BenchmarkLogger implementation */
