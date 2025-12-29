import chalk from 'chalk';
import ora from 'ora';

import type { Ora } from 'ora';

/**
 * Options for BenchmarkLogger
 */
export interface BenchmarkLoggerOptions {
  verbose?: boolean;
}

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
    const separator = '───────────────────────────────────────';
    console.log(chalk.dim('\n' + separator));
    console.log(chalk.dim('📖 Metric Guide:'));
    console.log(chalk.dim('   Brier Score: 0=perfect, 1=worst (measures probability calibration)'));
    console.log(chalk.dim('   Log Loss: 0=perfect, ∞=worst (penalizes confident wrong predictions)'));
    console.log(chalk.dim('   Accuracy: % correct at 0.5 threshold (did prediction match outcome?)'));
    console.log(chalk.dim(separator));
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
