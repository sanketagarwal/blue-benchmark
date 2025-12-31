/**
 * Model Quality Profiles Report Module
 *
 * Generates comprehensive quality profiles for prediction models, including:
 * - Log Loss and Brier Score (overall calibration)
 * - Calibration slope (linear regression on predicted vs actual)
 * - Expected Calibration Error (10-bin ECE)
 * - True positive, false positive, and false negative rates
 * - Variance of predictions by horizon
 */
import chalk from 'chalk';
import Table from 'cli-table3';

import { TIMEFRAME_IDS } from '../timeframe-config.js';

import type { TimeframeId } from '../timeframe-config.js';

/**
 * Number of bins for Expected Calibration Error calculation
 */
const ECE_BIN_COUNT = 10;

/**
 * Comprehensive quality profile for a single model
 */
export interface ModelQualityProfile {
  modelId: string;
  meanLogLoss: number;
  meanBrier: number;
  /** Slope of calibration curve (1.0 = perfect calibration) */
  calibrationSlope: number;
  /** Expected Calibration Error using 10 bins */
  expectedCalibrationError: number;
  /** True positive rate: TP / (TP + FN) */
  tpRate: number;
  /** False positive rate: FP / (FP + TN) */
  fpRate: number;
  /** False negative rate: FN / (TP + FN) */
  fnRate: number;
  /** Variance of predictions per horizon */
  varianceByHorizon: Record<TimeframeId, number>;
}

/**
 * Input data for a single round of predictions
 */
export interface RoundData {
  predictions: Record<TimeframeId, number>;
  labels: Record<TimeframeId, boolean>;
}

/**
 * Input data for a single round including scores
 */
export interface RoundDataWithScores extends RoundData {
  logLosses: Record<TimeframeId, number>;
  briers: Record<TimeframeId, number>;
}

/**
 * Calculate the mean of an array of numbers
 * @param values - Array of numbers
 * @returns Mean value, or NaN if empty
 */
function calculateMean(values: number[]): number {
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
 * Calculate variance of an array of numbers
 * @param values - Array of numbers
 * @returns Variance, or NaN if less than 2 values
 */
function calculateVariance(values: number[]): number {
  if (values.length < 2) {
    return Number.NaN;
  }
  const mean = calculateMean(values);
  let sumSquaredDiff = 0;
  for (const value of values) {
    const diff = value - mean;
    sumSquaredDiff += diff * diff;
  }
  // Sample variance (n-1 denominator)
  return sumSquaredDiff / (values.length - 1);
}

/**
 * Calculate calibration slope using simple linear regression
 * Fits a line y = mx + b to (predicted, actual) pairs
 * Returns the slope m (1.0 = perfect calibration)
 *
 * @param predictions - Array of predicted probabilities
 * @param labels - Array of actual outcomes (converted to 0/1)
 * @returns Slope of calibration curve
 */
export function calculateCalibrationSlope(
  predictions: number[],
  labels: boolean[]
): number {
  if (predictions.length !== labels.length) {
    throw new Error(
      `Array length mismatch: predictions (${String(predictions.length)}) vs labels (${String(labels.length)})`
    );
  }

  const n = predictions.length;
  if (n < 2) {
    return Number.NaN;
  }

  // Convert labels to 0/1
  const actuals = labels.map((label) => (label ? 1 : 0));

  // Calculate means
  let sumX = 0;
  let sumY = 0;
  for (let index = 0; index < n; index++) {
    // eslint-disable-next-line security/detect-object-injection -- index from loop
    sumX += predictions[index] ?? 0;
    // eslint-disable-next-line security/detect-object-injection -- index from loop
    sumY += actuals[index] ?? 0;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  // Calculate slope using least squares formula: slope = sum((x-meanX)(y-meanY)) / sum((x-meanX)^2)
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < n; index++) {
    // eslint-disable-next-line security/detect-object-injection -- index from loop
    const xDiff = (predictions[index] ?? 0) - meanX;
    // eslint-disable-next-line security/detect-object-injection -- index from loop
    const yDiff = (actuals[index] ?? 0) - meanY;
    numerator += xDiff * yDiff;
    denominator += xDiff * xDiff;
  }

  // If all predictions are the same, denominator is 0
  if (denominator === 0) {
    return Number.NaN;
  }

  return numerator / denominator;
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
function assignToBin(
  bins: CalibrationBin[],
  prediction: number,
  label: boolean
): void {
  // Determine bin index (0-9), prediction = 1.0 goes into bin 9 (last bin)
  const binIndex = Math.min(
    Math.floor(prediction * ECE_BIN_COUNT),
    ECE_BIN_COUNT - 1
  );
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
function computeEceFromBins(
  bins: CalibrationBin[],
  totalSamples: number
): number {
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
  if (predictions.length !== labels.length) {
    throw new Error(
      `Array length mismatch: predictions (${String(predictions.length)}) vs labels (${String(labels.length)})`
    );
  }

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
 * Confusion matrix counts
 */
interface ConfusionCounts {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

/**
 * Classify a single prediction-label pair
 * @param predictedPositive - Whether prediction > 0.5
 * @param actualPositive - The actual label
 * @returns Classification: 'tp' | 'fp' | 'tn' | 'fn'
 */
function classifyPrediction(
  predictedPositive: boolean,
  actualPositive: boolean
): 'tp' | 'fp' | 'tn' | 'fn' {
  if (predictedPositive && actualPositive) {
    return 'tp';
  }
  if (predictedPositive && !actualPositive) {
    return 'fp';
  }
  if (!predictedPositive && !actualPositive) {
    return 'tn';
  }
  return 'fn';
}

/**
 * Calculate confusion matrix counts from predictions and labels
 * @param predictions - Array of predicted probabilities
 * @param labels - Array of actual outcomes
 * @returns Confusion matrix counts
 */
function calculateConfusionCounts(
  predictions: number[],
  labels: boolean[]
): ConfusionCounts {
  const counts: ConfusionCounts = { tp: 0, fp: 0, tn: 0, fn: 0 };

  for (const [index, prediction] of predictions.entries()) {
    // eslint-disable-next-line security/detect-object-injection -- Array access with entries() index
    const label = labels[index];
    if (label === undefined) {
      throw new TypeError(`Invalid label at index ${String(index)}`);
    }
    const classification = classifyPrediction(prediction > 0.5, label);
    // eslint-disable-next-line security/detect-object-injection -- classification is literal union type
    counts[classification]++;
  }

  return counts;
}

/**
 * Calculate true positive rate (sensitivity/recall): TP / (TP + FN)
 * @param counts - Confusion matrix counts
 * @returns TPR as decimal, or NaN if no actual positives
 */
function calculateTpRate(counts: ConfusionCounts): number {
  const actualPositives = counts.tp + counts.fn;
  return actualPositives === 0 ? Number.NaN : counts.tp / actualPositives;
}

/**
 * Calculate false positive rate: FP / (FP + TN)
 * @param counts - Confusion matrix counts
 * @returns FPR as decimal, or NaN if no actual negatives
 */
function calculateFpRate(counts: ConfusionCounts): number {
  const actualNegatives = counts.fp + counts.tn;
  return actualNegatives === 0 ? Number.NaN : counts.fp / actualNegatives;
}

/**
 * Calculate false negative rate: FN / (TP + FN)
 * @param counts - Confusion matrix counts
 * @returns FNR as decimal, or NaN if no actual positives
 */
function calculateFunctionRate(counts: ConfusionCounts): number {
  const actualPositives = counts.tp + counts.fn;
  return actualPositives === 0 ? Number.NaN : counts.fn / actualPositives;
}

/**
 * Flatten round data into arrays of predictions and labels
 * @param roundData - Array of round data with predictions/labels per horizon
 * @returns Flattened predictions and labels arrays
 */
function flattenRoundData(roundData: RoundData[]): {
  predictions: number[];
  labels: boolean[];
} {
  const predictions: number[] = [];
  const labels: boolean[] = [];

  for (const round of roundData) {
    for (const horizon of TIMEFRAME_IDS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      const pred = round.predictions[horizon];
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      const label = round.labels[horizon];
      predictions.push(pred);
      labels.push(label);
    }
  }

  return { predictions, labels };
}

/**
 * Calculate variance of predictions per horizon
 * @param roundData - Array of round data
 * @returns Record of variance per timeframe
 */
function calculateVarianceByHorizon(
  roundData: RoundData[]
): Record<TimeframeId, number> {
  const predictionsByHorizon: Record<TimeframeId, number[]> = {
    '15m': [],
    '1h': [],
    '4h': [],
    '24h': [],
  };

  for (const round of roundData) {
    for (const horizon of TIMEFRAME_IDS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      const pred = round.predictions[horizon];
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      predictionsByHorizon[horizon].push(pred);
    }
  }

  const result: Record<TimeframeId, number> = {
    '15m': Number.NaN,
    '1h': Number.NaN,
    '4h': Number.NaN,
    '24h': Number.NaN,
  };

  for (const horizon of TIMEFRAME_IDS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    result[horizon] = calculateVariance(predictionsByHorizon[horizon]);
  }

  return result;
}

/**
 * Calculate mean log loss from round data with scores
 * @param roundData - Array of round data with scores
 * @returns Mean log loss across all horizons and rounds
 */
function calculateMeanLogLossFromRounds(
  roundData: RoundDataWithScores[]
): number {
  const allLogLosses: number[] = [];
  for (const round of roundData) {
    for (const horizon of TIMEFRAME_IDS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      const ll = round.logLosses[horizon];
      if (!Number.isNaN(ll)) {
        allLogLosses.push(ll);
      }
    }
  }
  return calculateMean(allLogLosses);
}

/**
 * Calculate mean Brier score from round data with scores
 * @param roundData - Array of round data with scores
 * @returns Mean Brier score across all horizons and rounds
 */
function calculateMeanBrierFromRounds(
  roundData: RoundDataWithScores[]
): number {
  const allBriers: number[] = [];
  for (const round of roundData) {
    for (const horizon of TIMEFRAME_IDS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      const brier = round.briers[horizon];
      if (!Number.isNaN(brier)) {
        allBriers.push(brier);
      }
    }
  }
  return calculateMean(allBriers);
}

/**
 * Build a comprehensive quality profile for a model
 *
 * @param modelId - The model identifier
 * @param roundData - Array of round data with predictions and labels per horizon
 * @returns Complete quality profile for the model
 */
export function buildModelProfile(
  modelId: string,
  roundData: {
    predictions: Record<TimeframeId, number>;
    labels: Record<TimeframeId, boolean>;
    logLosses?: Record<TimeframeId, number>;
    briers?: Record<TimeframeId, number>;
  }[]
): ModelQualityProfile {
  // Flatten all predictions and labels across horizons
  const { predictions, labels } = flattenRoundData(roundData);

  // Calculate confusion matrix and rates
  const confusionCounts = calculateConfusionCounts(predictions, labels);
  const tpRate = calculateTpRate(confusionCounts);
  const fpRate = calculateFpRate(confusionCounts);
  const functionRate = calculateFunctionRate(confusionCounts);

  // Calculate calibration metrics
  const calibrationSlope = calculateCalibrationSlope(predictions, labels);
  const expectedCalibrationError = calculateExpectedCalibrationError(
    predictions,
    labels
  );

  // Calculate variance by horizon
  const varianceByHorizon = calculateVarianceByHorizon(roundData);

  // Calculate mean log loss and Brier from scores if provided, otherwise compute from predictions
  let meanLogLoss: number;
  let meanBrier: number;

  const firstRound = roundData[0];
  const hasScores =
    firstRound?.logLosses !== undefined &&
    firstRound.briers !== undefined;

  if (hasScores) {
    // Use provided scores
    meanLogLoss = calculateMeanLogLossFromRounds(
      roundData as RoundDataWithScores[]
    );
    meanBrier = calculateMeanBrierFromRounds(
      roundData as RoundDataWithScores[]
    );
  } else {
    // Compute from predictions/labels directly
    // Log loss: -y*log(p) - (1-y)*log(1-p)
    // Brier: (p - y)^2
    const logLosses: number[] = [];
    const briers: number[] = [];
    const EPSILON = 1e-15;

    for (const [index, p] of predictions.entries()) {
      // eslint-disable-next-line security/detect-object-injection -- index from entries
      const label = labels[index];
      const y = label === true ? 1 : 0;
      const pClamped = Math.max(EPSILON, Math.min(1 - EPSILON, p));
      const ll = -(y * Math.log(pClamped) + (1 - y) * Math.log(1 - pClamped));
      logLosses.push(ll);
      briers.push((p - y) ** 2);
    }

    meanLogLoss = calculateMean(logLosses);
    meanBrier = calculateMean(briers);
  }

  return {
    modelId,
    meanLogLoss,
    meanBrier,
    calibrationSlope,
    expectedCalibrationError,
    tpRate,
    fpRate,
    fnRate: functionRate,
    varianceByHorizon,
  };
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
 * Get color for calibration slope (1.0 is perfect)
 * @param slope - The calibration slope
 * @returns Chalk color function
 */
function getSlopeColor(slope: number): typeof chalk.green {
  if (Number.isNaN(slope)) {
    return chalk.dim;
  }
  const deviation = Math.abs(slope - 1);
  if (deviation < 0.2) {
    return chalk.green;
  }
  if (deviation < 0.5) {
    return chalk.yellow;
  }
  return chalk.red;
}

/**
 * Get color for ECE (lower is better)
 * @param ece - The expected calibration error
 * @returns Chalk color function
 */
function getEceColor(ece: number): typeof chalk.green {
  if (Number.isNaN(ece)) {
    return chalk.dim;
  }
  if (ece < 0.1) {
    return chalk.green;
  }
  if (ece < 0.2) {
    return chalk.yellow;
  }
  return chalk.red;
}

/**
 * Format profile table as a CLI table string
 *
 * @param profiles - Array of model quality profiles
 * @returns Formatted table string ready for console output
 */
export function formatProfileTable(profiles: ModelQualityProfile[]): string {
  const table = new Table({
    chars: {
      top: '\u2500',
      'top-mid': '\u252C',
      'top-left': '\u250C',
      'top-right': '\u2510',
      bottom: '\u2500',
      'bottom-mid': '\u2534',
      'bottom-left': '\u2514',
      'bottom-right': '\u2518',
      left: '\u2502',
      'left-mid': '\u251C',
      mid: '\u2500',
      'mid-mid': '\u253C',
      right: '\u2502',
      'right-mid': '\u2524',
      middle: '\u2502',
    },
    style: { head: [], border: [] },
  });

  // Title row
  table.push([
    {
      colSpan: 9,
      content: chalk.bold.cyan('Model Quality Profiles'),
      hAlign: 'center' as const,
    },
  ]);

  // Header row
  table.push([
    { content: chalk.dim('Model'), hAlign: 'center' as const },
    { content: chalk.dim('LL'), hAlign: 'center' as const },
    { content: chalk.dim('Brier'), hAlign: 'center' as const },
    { content: chalk.dim('Slope'), hAlign: 'center' as const },
    { content: chalk.dim('ECE'), hAlign: 'center' as const },
    { content: chalk.dim('TPR'), hAlign: 'center' as const },
    { content: chalk.dim('FPR'), hAlign: 'center' as const },
    { content: chalk.dim('FNR'), hAlign: 'center' as const },
    { content: chalk.dim('Var(15m)'), hAlign: 'center' as const },
  ]);

  // Data rows sorted by mean log loss
  const sortedProfiles = [...profiles].sort((a, b) => {
    const aIsNaN = Number.isNaN(a.meanLogLoss);
    const bIsNaN = Number.isNaN(b.meanLogLoss);
    if (aIsNaN && bIsNaN) {
      return 0;
    }
    if (aIsNaN) {
      return 1;
    }
    if (bIsNaN) {
      return -1;
    }
    return a.meanLogLoss - b.meanLogLoss;
  });

  for (const profile of sortedProfiles) {
    const slopeColor = getSlopeColor(profile.calibrationSlope);
    const eceColor = getEceColor(profile.expectedCalibrationError);

    table.push([
      { content: chalk.cyan(profile.modelId), hAlign: 'left' as const },
      { content: formatNumber(profile.meanLogLoss, 3), hAlign: 'right' as const },
      { content: formatNumber(profile.meanBrier, 3), hAlign: 'right' as const },
      {
        content: slopeColor(formatNumber(profile.calibrationSlope, 2)),
        hAlign: 'right' as const,
      },
      {
        content: eceColor(formatNumber(profile.expectedCalibrationError, 3)),
        hAlign: 'right' as const,
      },
      { content: formatPercent(profile.tpRate), hAlign: 'right' as const },
      { content: formatPercent(profile.fpRate), hAlign: 'right' as const },
      { content: formatPercent(profile.fnRate), hAlign: 'right' as const },
      {
        content: formatNumber(profile.varianceByHorizon['15m'], 4),
        hAlign: 'right' as const,
      },
    ]);
  }

  return table.toString();
}
