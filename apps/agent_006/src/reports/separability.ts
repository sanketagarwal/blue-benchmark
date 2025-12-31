/**
 * Metric separability analysis module for agent_006 benchmark
 *
 * Analyzes how well different metrics separate models in ranking:
 * - Range (max - min across models)
 * - Standard deviation
 * - Spearman rank correlation with overall ranking (by meanLogLoss)
 * - Separability flag (range > 0.1 AND stdDev > 0.05)
 */
import chalk from 'chalk';
import Table from 'cli-table3';

/**
 * Separability analysis result for a single metric
 */
export interface MetricSeparability {
  metricName: string;
  range: number; // max - min across models
  stdDev: number; // standard deviation
  rankCorrelation: number; // Spearman correlation with overall ranking
  separates: boolean; // range > 0.1 && stdDev > 0.05
}

/**
 * Input profile data for separability analysis
 */
export interface ModelProfile {
  modelId: string;
  meanLogLoss: number;
  meanBrier: number;
  expectedCalibrationError: number;
  tpRate: number;
  fpRate: number;
}

/**
 * Metric definition for extraction
 */
interface MetricDefinition {
  name: string;
  accessor: (profile: ModelProfile) => number;
}

/**
 * Metrics to analyze
 */
const METRICS: MetricDefinition[] = [
  { name: 'meanLogLoss', accessor: (p) => p.meanLogLoss },
  { name: 'meanBrier', accessor: (p) => p.meanBrier },
  { name: 'expectedCalibrationError', accessor: (p) => p.expectedCalibrationError },
  { name: 'tpRate', accessor: (p) => p.tpRate },
  { name: 'fpRate', accessor: (p) => p.fpRate },
];

/**
 * Calculate the range (max - min) of an array
 * @param values - Array of numbers
 * @returns Range value, or NaN if empty or all NaN
 */
export function calculateRange(values: number[]): number {
  const validValues = values.filter((value) => !Number.isNaN(value));
  if (validValues.length === 0) {
    return Number.NaN;
  }
  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  return max - min;
}

/**
 * Calculate standard deviation of an array
 * @param values - Array of numbers
 * @returns Standard deviation, or NaN if empty or insufficient valid values
 */
export function calculateStandardDeviation(values: number[]): number {
  const validValues = values.filter((value) => !Number.isNaN(value));
  if (validValues.length < 2) {
    return Number.NaN;
  }

  const mean = validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
  const squaredDiffs = validValues.map((value) => (value - mean) ** 2);
  const variance = squaredDiffs.reduce((sum, value) => sum + value, 0) / validValues.length;
  return Math.sqrt(variance);
}

/**
 * Item with value and original index for ranking
 */
interface IndexedValue {
  value: number;
  originalIndex: number;
}

/**
 * Find the end of a tie group starting at position
 * @param indexed - Sorted array of indexed values
 * @param startPosition - Position to start from
 * @param currentValue - Value to match for ties
 * @returns End position (exclusive)
 */
function findTieGroupEnd(
  indexed: IndexedValue[],
  startPosition: number,
  currentValue: number
): number {
  let tieEnd = startPosition + 1;
  while (tieEnd < indexed.length) {
    // eslint-disable-next-line security/detect-object-injection -- tieEnd is bounded by loop condition
    const nextItem = indexed[tieEnd];
    if (nextItem?.value !== currentValue) {
      break;
    }
    tieEnd++;
  }
  return tieEnd;
}

/**
 * Assign ranks to a tie group
 * @param indexed - Array of indexed values
 * @param ranks - Ranks array to fill
 * @param startPosition - Start of tie group
 * @param endPosition - End of tie group (exclusive)
 * @param avgRank - Average rank to assign
 */
function assignTieGroupRanks(
  indexed: IndexedValue[],
  ranks: number[],
  startPosition: number,
  endPosition: number,
  avgRank: number
): void {
  const tieGroup = indexed.slice(startPosition, endPosition);
  for (const item of tieGroup) {
    ranks.splice(item.originalIndex, 1, avgRank);
  }
}

/**
 * Compute ranks for an array (1-based, handles ties with average ranks)
 * Lower values get lower ranks (rank 1 is the smallest value)
 * @param values - Array of numbers
 * @returns Array of ranks corresponding to input positions
 */
export function computeRanks(values: number[]): number[] {
  const indexed = values.map((value, originalIndex) => ({ value, originalIndex }));
  indexed.sort((first, second) => first.value - second.value);

  const ranks: number[] = Array.from({ length: values.length }, () => 0);
  let currentRank = 1;
  let position = 0;

  while (position < indexed.length) {
    // eslint-disable-next-line security/detect-object-injection -- position is bounded by loop condition
    const currentItem = indexed[position];
    if (currentItem === undefined) {
      position++;
      continue;
    }

    const tieEnd = findTieGroupEnd(indexed, position, currentItem.value);
    const tieCount = tieEnd - position;
    const avgRank = currentRank + (tieCount - 1) / 2;

    assignTieGroupRanks(indexed, ranks, position, tieEnd, avgRank);

    currentRank += tieCount;
    position = tieEnd;
  }

  return ranks;
}

/**
 * Calculate Spearman rank correlation coefficient
 * @param arrayX - First array of values
 * @param arrayY - Second array of values
 * @returns Spearman correlation coefficient (-1 to 1), or NaN if insufficient data
 */
export function calculateSpearmanCorrelation(arrayX: number[], arrayY: number[]): number {
  if (arrayX.length !== arrayY.length) {
    throw new Error(
      `Array length mismatch: x (${String(arrayX.length)}) vs y (${String(arrayY.length)})`
    );
  }

  if (arrayX.length < 2) {
    return Number.NaN;
  }

  const ranksX = computeRanks(arrayX);
  const ranksY = computeRanks(arrayY);

  // Calculate sum of squared rank differences
  let sumD2 = 0;
  for (const [rankIndex, rx] of ranksX.entries()) {
    // eslint-disable-next-line security/detect-object-injection -- rankIndex from entries() is bounded
    const ry = ranksY[rankIndex];
    if (ry !== undefined) {
      sumD2 += (rx - ry) ** 2;
    }
  }

  // Spearman formula: 1 - (6 * sum(d^2)) / (n * (n^2 - 1))
  const arrayLength = arrayX.length;
  const denominator = arrayLength * (arrayLength ** 2 - 1);

  // Handle edge case where denominator would be 0 (n=1)
  if (denominator === 0) {
    return Number.NaN;
  }

  return 1 - (6 * sumD2) / denominator;
}

/**
 * Extract metric values from profiles
 * @param profiles - Array of model profiles
 * @param accessor - Function to extract metric value
 * @returns Array of metric values
 */
function extractMetricValues(
  profiles: ModelProfile[],
  accessor: (profile: ModelProfile) => number
): number[] {
  return profiles.map((profile) => accessor(profile));
}

/**
 * Analyze separability for a single metric
 * @param metricName - Name of the metric
 * @param metricValues - Array of metric values across models
 * @param referenceRanks - Ranks based on meanLogLoss for correlation
 * @returns MetricSeparability analysis result
 */
function analyzeOneMetric(
  metricName: string,
  metricValues: number[],
  referenceRanks: number[]
): MetricSeparability {
  const range = calculateRange(metricValues);
  const standardDeviation = calculateStandardDeviation(metricValues);
  const metricRanks = computeRanks(metricValues);
  const rankCorrelation = calculateSpearmanCorrelation(referenceRanks, metricRanks);

  // Separates if range > 0.1 AND stdDev > 0.05
  const separates = range > 0.1 && standardDeviation > 0.05;

  return {
    metricName,
    range,
    stdDev: standardDeviation,
    rankCorrelation,
    separates,
  };
}

/**
 * Analyze metric separability across all models
 *
 * For each metric:
 * - Computes range (max - min)
 * - Computes standard deviation
 * - Computes Spearman correlation with overall ranking (by meanLogLoss)
 * - Determines if metric separates models (range > 0.1 AND stdDev > 0.05)
 *
 * @param profiles - Array of model profiles with metrics
 * @returns Array of separability analysis for each metric
 */
export function analyzeMetricSeparability(profiles: ModelProfile[]): MetricSeparability[] {
  if (profiles.length === 0) {
    return [];
  }

  // Extract meanLogLoss values and compute reference ranks
  const logLossValues = extractMetricValues(profiles, (p) => p.meanLogLoss);
  const referenceRanks = computeRanks(logLossValues);

  // Analyze each metric
  return METRICS.map((metric) => {
    const values = extractMetricValues(profiles, metric.accessor);
    return analyzeOneMetric(metric.name, values, referenceRanks);
  });
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
 * Format boolean as colored indicator
 * @param value - Boolean value
 * @returns Colored string
 */
function formatSeparates(value: boolean): string {
  return value ? chalk.green('Yes') : chalk.red('No');
}

/**
 * Format separability analysis as a CLI table string
 *
 * @param analysis - Array of metric separability results
 * @returns Formatted table string ready for console output
 */
export function formatSeparabilityTable(analysis: MetricSeparability[]): string {
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
      colSpan: 5,
      content: chalk.bold.cyan('Metric Separability Analysis'),
      hAlign: 'center' as const,
    },
  ]);

  // Header row
  table.push([
    { content: chalk.dim('Metric'), hAlign: 'left' as const },
    { content: chalk.dim('Range'), hAlign: 'center' as const },
    { content: chalk.dim('StdDev'), hAlign: 'center' as const },
    { content: chalk.dim('Rank Corr'), hAlign: 'center' as const },
    { content: chalk.dim('Separates'), hAlign: 'center' as const },
  ]);

  // Data rows
  for (const metric of analysis) {
    table.push([
      { content: chalk.cyan(metric.metricName), hAlign: 'left' as const },
      { content: formatNumber(metric.range, 4), hAlign: 'right' as const },
      { content: formatNumber(metric.stdDev, 4), hAlign: 'right' as const },
      { content: formatNumber(metric.rankCorrelation, 4), hAlign: 'right' as const },
      { content: formatSeparates(metric.separates), hAlign: 'center' as const },
    ]);
  }

  return table.toString();
}
