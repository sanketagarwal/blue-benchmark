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
   * Log ground truth values (verbose only)
   */
  logGroundTruth(actuals: Record<string, boolean>, predictions?: Record<string, number>): void {
    if (!this.verbose) {
      return;
    }
    console.log(chalk.cyan('\nGround Truth:'));
    for (const [key, value] of Object.entries(actuals)) {
      const icon = value ? chalk.green('\u2713') : chalk.red('\u2717');
      const prediction = predictions?.[key];
      const predictionString = prediction === undefined ? '' : chalk.gray(` (predicted ${prediction.toFixed(2)})`);
      console.log(`  ${icon} ${key.padEnd(20)}${predictionString}`);
    }
  }

  /**
   * Log scores (verbose only)
   */
  logScores(scores: { brier?: number; logLoss?: number; accuracy?: number }): void {
    if (!this.verbose) {
      return;
    }
    const parts: string[] = [];
    if (scores.brier !== undefined) {
      parts.push(`Brier=${scores.brier.toFixed(3)}`);
    }
    if (scores.logLoss !== undefined) {
      parts.push(`LogLoss=${scores.logLoss.toFixed(3)}`);
    }
    if (scores.accuracy !== undefined) {
      parts.push(`Accuracy=${(scores.accuracy * 100).toFixed(1)}%`);
    }
    console.log(chalk.yellow(`\nScores: ${parts.join(', ')}`));
  }

  /**
   * Output a header (always displayed)
   */
  header(title: string): void {
    console.log(chalk.bold(title));
    console.log('='.repeat(title.length));
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
