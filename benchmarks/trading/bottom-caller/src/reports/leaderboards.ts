/**
 * Per-timeframe leaderboard report generation for agent_006 benchmark
 *
 * Generates leaderboards showing model rankings per horizon with key metrics:
 * - Log Loss and Brier Score (provided)
 * - Win Rate (prediction > 0.5 matches label)
 * - Precision (TP / (TP + FP) for hasBottomed=true predictions)
 * - Expected Calibration Error (ECE)
 */
import chalk from 'chalk';
import Table from 'cli-table3';

import type { TimeframeId } from '../timeframe-config.js';

/**
 * A single entry in the leaderboard
 */
export interface LeaderboardEntry {
  modelId: string;
  rank: number;
  meanLogLoss: number;
  meanBrier: number;
  /** Percentage of rounds where prediction > 0.5 matched the actual label */
  winRate: number;
  /** TP / (TP + FP) for predictions where hasBottomed=true (p > 0.5) */
  precision: number;
  /** Expected Calibration Error - measures how well-calibrated predictions are */
  calibrationError: number;
  /** Number of rounds the model participated in */
  roundsPlayed: number;
}

/**
 * Complete leaderboard for a single timeframe and method
 */
export interface TimeframeLeaderboard {
  horizon: TimeframeId;
  method: 'fractal' | 'zigzag';
  entries: LeaderboardEntry[];
}

/**
 * Input data for a single model's scoring
 */
export interface ModelScoreData {
  logLosses: number[];
  briers: number[];
  /** Predicted probabilities (0-1) */
  predictions: number[];
  /** Actual outcomes */
  labels: boolean[];
}

/**
 * Number of bins for Expected Calibration Error calculation
 */
const ECE_BIN_COUNT = 10;

/**
 * Minimum samples required for calibration error to be meaningful
 * With fewer samples, ECE calculation is unreliable noise
 */
const MIN_SAMPLES_FOR_CALIBRATION = 20;

/**
 * Calculate mean of an array of numbers
 * @param values - Array of numbers
 * @returns Mean value, or NaN if empty
 */
export function calculateMean(values: number[]): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

/**
 * Validate that prediction and label arrays have matching lengths
 * @param predictions - Array of predicted probabilities
 * @param labels - Array of actual outcomes
 * @throws Error if lengths don't match
 */
function validateArrayLengths(predictions: number[], labels: boolean[]): void {
  if (predictions.length !== labels.length) {
    throw new Error(
      `Array length mismatch: predictions (${String(predictions.length)}) vs labels (${String(labels.length)})`
    );
  }
}

/**
 * Calculate win rate: percentage of predictions where (p > 0.5) matches the label
 * @param predictions - Array of predicted probabilities
 * @param labels - Array of actual outcomes
 * @returns Win rate as a decimal (0-1)
 */
export function calculateWinRate(predictions: number[], labels: boolean[]): number {
  validateArrayLengths(predictions, labels);
  if (predictions.length === 0) {
    return Number.NaN;
  }

  let correct = 0;
  for (const [index, prediction] of predictions.entries()) {
    // eslint-disable-next-line security/detect-object-injection -- Array access with entries() index
    const label = labels[index];
    if (label === undefined) {
      throw new TypeError(`Invalid label at index ${String(index)}`);
    }
    const predictedPositive = prediction > 0.5;
    if (predictedPositive === label) {
      correct++;
    }
  }
  return correct / predictions.length;
}

/**
 * Count true positives and false positives from prediction/label pairs
 * @param predictions - Array of predicted probabilities
 * @param labels - Array of actual outcomes
 * @returns Object with truePositives and falsePositives counts
 */
function countPositivePredictions(
  predictions: number[],
  labels: boolean[]
): { truePositives: number; falsePositives: number } {
  let truePositives = 0;
  let falsePositives = 0;

  for (const [index, prediction] of predictions.entries()) {
    // eslint-disable-next-line security/detect-object-injection -- Array access with entries() index
    const label = labels[index];
    if (label === undefined) {
      throw new TypeError(`Invalid label at index ${String(index)}`);
    }
    const predictedPositive = prediction > 0.5;
    if (predictedPositive) {
      if (label) {
        truePositives++;
      } else {
        falsePositives++;
      }
    }
  }

  return { truePositives, falsePositives };
}

/**
 * Calculate precision: TP / (TP + FP) for positive predictions (p > 0.5)
 * @param predictions - Array of predicted probabilities
 * @param labels - Array of actual outcomes
 * @returns Precision as a decimal (0-1), or NaN if no positive predictions
 */
export function calculatePrecision(predictions: number[], labels: boolean[]): number {
  validateArrayLengths(predictions, labels);
  if (predictions.length === 0) {
    return Number.NaN;
  }

  const { truePositives, falsePositives } = countPositivePredictions(predictions, labels);
  const totalPositivePredictions = truePositives + falsePositives;
  return totalPositivePredictions === 0 ? Number.NaN : truePositives / totalPositivePredictions;
}

/**
 * Bin structure for ECE calculation
 */
interface CalibrationBin {
  sumPredicted: number;
  countPositive: number;
  count: number;
}

/**
 * Initialize empty calibration bins
 * @returns Array of empty bins
 */
function initializeCalibrationBins(): CalibrationBin[] {
  return Array.from({ length: ECE_BIN_COUNT }, () => ({
    sumPredicted: 0,
    countPositive: 0,
    count: 0,
  }));
}

/**
 * Assign a prediction to its appropriate bin
 * @param bins - The calibration bins
 * @param prediction - The predicted probability
 * @param label - The actual outcome
 */
function assignToBin(bins: CalibrationBin[], prediction: number, label: boolean): void {
  // Determine bin index (0-9), prediction = 1.0 goes into bin 9 (last bin)
  const binIndex = Math.min(Math.floor(prediction * ECE_BIN_COUNT), ECE_BIN_COUNT - 1);
  // eslint-disable-next-line security/detect-object-injection -- binIndex is bounded 0-9
  const bin = bins[binIndex];
  if (bin === undefined) {
    throw new Error(`Unexpected undefined bin at index ${String(binIndex)}`);
  }
  bin.sumPredicted += prediction;
  bin.count++;
  if (label) {
    bin.countPositive++;
  }
}

/**
 * Calculate ECE from populated bins
 * @param bins - The calibration bins with data
 * @param totalSamples - Total number of samples
 * @returns ECE value
 */
function computeEceFromBins(bins: CalibrationBin[], totalSamples: number): number {
  let ece = 0;
  for (const bin of bins) {
    if (bin.count === 0) {
      continue;
    }
    const avgPredicted = bin.sumPredicted / bin.count;
    const actualFrequency = bin.countPositive / bin.count;
    const binWeight = bin.count / totalSamples;
    ece += binWeight * Math.abs(avgPredicted - actualFrequency);
  }
  return ece;
}

/**
 * Calculate Expected Calibration Error (ECE)
 *
 * ECE measures how well-calibrated predictions are by:
 * 1. Binning predictions into 10 equally-spaced bins (0-0.1, 0.1-0.2, etc.)
 * 2. For each bin, computing |average_predicted - actual_frequency|
 * 3. Weighting by the proportion of samples in each bin
 *
 * @param predictions - Array of predicted probabilities
 * @param labels - Array of actual outcomes
 * @returns ECE value (0 is perfectly calibrated, 1 is worst)
 */
export function calculateExpectedCalibrationError(
  predictions: number[],
  labels: boolean[]
): number {
  validateArrayLengths(predictions, labels);
  if (predictions.length === 0) {
    return Number.NaN;
  }

  const bins = initializeCalibrationBins();

  for (const [index, prediction] of predictions.entries()) {
    // eslint-disable-next-line security/detect-object-injection -- Array access with entries() index
    const label = labels[index];
    if (label === undefined) {
      throw new TypeError(`Invalid label at index ${String(index)}`);
    }
    assignToBin(bins, prediction, label);
  }

  return computeEceFromBins(bins, predictions.length);
}

/**
 * Compare two entries by meanLogLoss for sorting (lower is better)
 * NaN values are pushed to the end
 * @param entryA - First entry
 * @param entryB - Second entry
 * @returns Comparison result for sort
 */
function compareByLogLoss(entryA: LeaderboardEntry, entryB: LeaderboardEntry): number {
  const aIsNaN = Number.isNaN(entryA.meanLogLoss);
  const bIsNaN = Number.isNaN(entryB.meanLogLoss);
  if (aIsNaN && bIsNaN) {
    return 0;
  }
  if (aIsNaN) {
    return 1;
  }
  if (bIsNaN) {
    return -1;
  }
  return entryA.meanLogLoss - entryB.meanLogLoss;
}

/**
 * Generate a leaderboard for a specific timeframe and method
 *
 * @param horizon - The timeframe ID (15m, 1h, 4h, 24h)
 * @param method - The pivot detection method (fractal or zigzag)
 * @param modelScores - Map of model IDs to their scoring data
 * @returns Complete leaderboard with ranked entries
 */
export function generateLeaderboard(
  horizon: TimeframeId,
  method: 'fractal' | 'zigzag',
  modelScores: Map<string, ModelScoreData>
): TimeframeLeaderboard {
  const entries: LeaderboardEntry[] = [];

  for (const [modelId, data] of modelScores) {
    const meanLogLoss = calculateMean(data.logLosses);
    const meanBrier = calculateMean(data.briers);
    const winRate = calculateWinRate(data.predictions, data.labels);
    const precision = calculatePrecision(data.predictions, data.labels);

    // Calibration error requires minimum sample size to be meaningful
    const sampleCount = data.predictions.length;
    const calibrationError = sampleCount < MIN_SAMPLES_FOR_CALIBRATION
      ? Number.NaN
      : calculateExpectedCalibrationError(data.predictions, data.labels);

    entries.push({
      modelId,
      rank: 0, // Will be set after sorting
      meanLogLoss,
      meanBrier,
      winRate,
      precision,
      calibrationError,
      roundsPlayed: sampleCount,
    });
  }

  // Sort by meanLogLoss (lower is better)
  entries.sort(compareByLogLoss);

  // Assign ranks
  for (const [index, entry] of entries.entries()) {
    entry.rank = index + 1;
  }

  return {
    horizon,
    method,
    entries,
  };
}

/**
 * Get rank medal emoji for top 3 positions
 * @param rank - The rank (1-based)
 * @returns Medal emoji or formatted rank string
 */
function getRankDisplay(rank: number): string {
  if (rank === 1) {
    return '\u{1F947}'; // Gold medal
  }
  if (rank === 2) {
    return '\u{1F948}'; // Silver medal
  }
  if (rank === 3) {
    return '\u{1F949}'; // Bronze medal
  }
  return String(rank);
}

/**
 * Format a number for table display
 * @param value - The number to format
 * @param decimals - Number of decimal places
 * @returns Formatted string or dash for NaN
 */
function formatNumber(value: number, decimals: number): string {
  return Number.isNaN(value) ? chalk.dim('-') : value.toFixed(decimals);
}

/**
 * Format a percentage for table display
 * @param value - The decimal value (0-1)
 * @returns Formatted percentage string or dash for NaN
 */
function formatPercent(value: number): string {
  return Number.isNaN(value) ? chalk.dim('-') : `${(value * 100).toFixed(1)}%`;
}

/**
 * Get human-readable method name
 * @param method - The method identifier
 * @returns Capitalized method name
 */
function getMethodDisplayName(method: 'fractal' | 'zigzag'): string {
  return method.charAt(0).toUpperCase() + method.slice(1);
}

/**
 * Format a leaderboard as a CLI table string
 *
 * @param leaderboard - The leaderboard to format
 * @returns Formatted table string ready for console output
 */
export function formatLeaderboardTable(leaderboard: TimeframeLeaderboard): string {
  const title = `${leaderboard.horizon} Arena - ${getMethodDisplayName(leaderboard.method)} Track`;

  const table = new Table({
    chars: {
      'top': '\u2500',
      'top-mid': '\u252C',
      'top-left': '\u250C',
      'top-right': '\u2510',
      'bottom': '\u2500',
      'bottom-mid': '\u2534',
      'bottom-left': '\u2514',
      'bottom-right': '\u2518',
      'left': '\u2502',
      'left-mid': '\u251C',
      'mid': '\u2500',
      'mid-mid': '\u253C',
      'right': '\u2502',
      'right-mid': '\u2524',
      'middle': '\u2502',
    },
    style: { head: [], border: [] },
  });

  // Title row
  table.push([
    {
      colSpan: 7,
      content: chalk.bold.cyan(title),
      hAlign: 'center' as const,
    },
  ]);

  // Header row
  table.push([
    { content: chalk.dim('Rank'), hAlign: 'center' as const },
    { content: chalk.dim('Model'), hAlign: 'center' as const },
    { content: chalk.dim('LL'), hAlign: 'center' as const },
    { content: chalk.dim('Brier'), hAlign: 'center' as const },
    { content: chalk.dim('Win%'), hAlign: 'center' as const },
    { content: chalk.dim('Prec%'), hAlign: 'center' as const },
    { content: chalk.dim('CalErr'), hAlign: 'center' as const },
  ]);

  // Data rows
  for (const entry of leaderboard.entries) {
    table.push([
      { content: getRankDisplay(entry.rank), hAlign: 'center' as const },
      { content: chalk.cyan(entry.modelId), hAlign: 'left' as const },
      { content: formatNumber(entry.meanLogLoss, 3), hAlign: 'right' as const },
      { content: formatNumber(entry.meanBrier, 3), hAlign: 'right' as const },
      { content: formatPercent(entry.winRate), hAlign: 'right' as const },
      { content: formatPercent(entry.precision), hAlign: 'right' as const },
      { content: formatNumber(entry.calibrationError, 3), hAlign: 'right' as const },
    ]);
  }

  return table.toString();
}
