/* eslint-disable max-lines -- Report generation requires many section generators; refactor to modules when extending further */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { isConstantPredictor } from './diagnostics/prediction-diagnostics.js';
import {
  TIMEFRAME_IDS,
  getTimeframeConfig,
  getLookbackBars,
  getHorizonBars,
} from './timeframe-config.js';

import type { DatasetDiagnostics } from './diagnostics/dataset-diagnostics.js';
import type { ScoredDatapointRecord } from './diagnostics/index.js';
import type { ModelParseDiagnostics } from './diagnostics/parse-diagnostics.js';
import type {
  HorizonPredictionDiversity,
  ModelPredictionDiversity,
} from './diagnostics/prediction-diagnostics.js';
import type { Phase0RoundScore } from './scorers/phase-0-scorer.js';
import type { HorizonRanking, PerHorizonRankings } from './scorers/phase-3-scorer.js';
import type { TimeframeId } from './timeframe-config.js';
import type { BenchmarkLogger } from '@nullagent/cli-utils';

/**
 * Disqualification info for a horizon
 */
export interface HorizonDisqualification {
  phase: number;
  reason: string;
}

/**
 * Horizon rankability status
 */
export interface HorizonRankability {
  horizon: TimeframeId;
  isRankable: boolean;
  reason?: string;
}

/**
 * Check if a horizon has sufficient label diversity to be rankable
 * @param trueCount - Number of true labels
 * @param falseCount - Number of false labels
 * @param minClassCount - Minimum required count for minority class (default 5)
 * @param minClassRatio - Minimum required ratio for minority class (default 0.10)
 * @returns True if horizon is rankable
 */
export function isHorizonRankable(
  trueCount: number,
  falseCount: number,
  minClassCount = 5,
  minClassRatio = 0.1
): boolean {
  const minorityCount = Math.min(trueCount, falseCount);
  const total = trueCount + falseCount;
  const minorityRatio = total > 0 ? minorityCount / total : 0;
  return minorityCount >= minClassCount && minorityRatio >= minClassRatio;
}

/**
 * Model state for persistence
 */
export interface ModelState {
  modelId: string;
  eliminated: boolean;
  eliminatedInPhase?: number;
  eliminationReason?: string;
  roundScores: Phase0RoundScore[];
  logLossByHorizon: Record<TimeframeId, number[]>;
  timeToPivotRatios: Record<TimeframeId, number[]>;
  failedRounds?: number[];
  disqualifiedHorizons?: Map<TimeframeId, HorizonDisqualification>;
  intendedRounds?: number;
  effectiveRoundsByHorizon?: Record<TimeframeId, number>;
}

/**
 * Benchmark run metadata
 */
interface RunMetadata {
  startTime: string;
  symbolId: string;
  totalRounds: number;
  currentRound: number;
  currentPhase: number;
}

/**
 * Comprehensive model metrics for the full results table
 */
interface ModelMetrics {
  modelId: string;
  status: string;
  rounds: number;
  failedRounds: number;
  // Per-horizon log loss
  logLoss15m: number;
  logLoss1h: number;
  logLoss4h: number;
  logLoss24h: number;
  meanLogLoss: number;
  // Composite score components
  avgPercentileRank: number;
  avgBestWindow: number;
  avgStability: number;
  avgTimeToPivotRatio: number;
  // Final composite score
  compositeScore: number;
  // Coverage info
  intendedRounds: number;
  effectiveRoundsByHorizon: Record<TimeframeId, number>;
  coverageRatio: number;
  hasLowCoverage: boolean;
}

export const HORIZONS: TimeframeId[] = ['15m', '1h', '4h', '24h'];
const RESULTS_FILE = 'BENCHMARK_RESULTS.md';

/**
 * Build non-rankable reason message for a horizon
 * @param countTrue - Number of true labels
 * @param countFalse - Number of false labels
 * @param n - Total number of labels
 * @returns Human-readable reason message
 */
function buildNonRankableReason(
  countTrue: number,
  countFalse: number,
  n: number
): string {
  const minorityCount = Math.min(countTrue, countFalse);
  const minorityLabel = countTrue < countFalse ? 'positive' : 'negative';
  const minorityPct = n > 0 ? ((minorityCount / n) * 100).toFixed(1) : '0';
  return `only ${String(minorityCount)} ${minorityLabel} examples (${minorityPct}%)`;
}

/**
 * Compute rankability for all horizons from dataset diagnostics
 * @param dataset - Dataset diagnostics
 * @returns Map of horizon to rankability status
 */
export function computeHorizonRankability(
  dataset: DatasetDiagnostics | undefined
): Map<TimeframeId, HorizonRankability> {
  const rankabilityMap = new Map<TimeframeId, HorizonRankability>();

  for (const horizon of HORIZONS) {
    if (dataset?.byHorizon === undefined) {
      rankabilityMap.set(horizon, { horizon, isRankable: true });
      continue;
    }

    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    const d = dataset.byHorizon[horizon];
    const { countTrue, countFalse, n } = d.labels;
    const rankable = isHorizonRankable(countTrue, countFalse);

    if (rankable) {
      rankabilityMap.set(horizon, { horizon, isRankable: true });
    } else {
      rankabilityMap.set(horizon, {
        horizon,
        isRankable: false,
        reason: buildNonRankableReason(countTrue, countFalse, n),
      });
    }
  }

  return rankabilityMap;
}

// Quality thresholds for log loss (lower is better)
const LOG_LOSS_GOOD = 0.5;
const LOG_LOSS_OK = 0.8;

// Mass tie detection threshold - warn if more than this many models share identical LL tuples
const MASS_TIE_THRESHOLD = 3;

// Coverage thresholds - models must have sufficient data to qualify for ranking
const MIN_COVERAGE_RATIO = 0.8;
const MIN_EFFECTIVE_ROUNDS = 10;

/**
 * Check if a model has insufficient coverage to qualify for ranking
 * @param effectiveRounds - Number of scored rounds
 * @param intendedRounds - Total rounds the model should have participated in
 * @returns True if coverage is insufficient
 */
export function hasInsufficientCoverage(
  effectiveRounds: number,
  intendedRounds: number
): boolean {
  const coverage = intendedRounds > 0 ? effectiveRounds / intendedRounds : 0;
  return effectiveRounds < MIN_EFFECTIVE_ROUNDS || coverage < MIN_COVERAGE_RATIO;
}

/**
 * Check if all horizons have single-class labels (all true or all false)
 * @param diagnostics - Dataset diagnostics
 * @returns True if all horizons have pTrue = 1.0 or pTrue = 0.0
 */
export function isSingleClass(diagnostics: DatasetDiagnostics | undefined): boolean {
  if (diagnostics?.byHorizon === undefined) {
    return false;
  }
  return Object.values(diagnostics.byHorizon).every(
    h => h.labels.pTrue === 1 || h.labels.pTrue === 0
  );
}

// Common section headers (exported for quick-mode-report)
export const SECTION_DATASET_DIAGNOSTICS = '## Dataset Diagnostics';
export const SECTION_PREDICTION_DIVERSITY = '## Prediction Diversity Analysis';
export const NO_DATA_COLLECTED = '*No data collected.*';

// Dataset diagnostics table headers (exported for quick-mode-report)
export const DATASET_DIAGNOSTICS_TABLE_HEADER = '| Horizon | N | True | False | pTrue | Random LL | Prevalence LL | Extreme True LL | Extreme False LL |';
export const DATASET_DIAGNOSTICS_TABLE_SEPARATOR = '|---------|---|------|-------|-------|-----------|---------------|-----------------|------------------|';

/**
 * Format a number to fixed decimal places
 * @param value - Number to format
 * @param decimals - Decimal places (default 4)
 * @returns Formatted string
 */
export function formatNumber(value: number, decimals = 4): string {
  return value.toFixed(decimals);
}

/**
 * Calculate mean of an array of numbers
 * @param values - Array of numbers
 * @returns Mean value or 0 if empty
 */
export function calculateMean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Calculate standard deviation of an array
 * @param values - Array of numbers
 * @returns Standard deviation
 */
function calculateStandardDeviation(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const mean = calculateMean(values);
  const squaredDiffs = values.map(v => (v - mean) ** 2);
  return Math.sqrt(calculateMean(squaredDiffs));
}

/**
 * Calculate percentile rank within cohort
 * @param value - The value to rank
 * @param allValues - All values in cohort
 * @returns Percentile rank (0-100)
 */
function calculatePercentileRank(value: number, allValues: number[]): number {
  if (allValues.length === 0) {
    return 50;
  }
  const sorted = [...allValues].sort((a, b) => a - b);
  const rank = sorted.filter(v => v < value).length;
  // Invert: lower log loss = higher percentile rank
  return 100 - (rank / sorted.length) * 100;
}

/**
 * Calculate best window log loss (rolling window minimum)
 * @param values - Array of log loss values
 * @param windowSize - Rolling window size
 * @returns Best window average
 */
function calculateBestWindow(values: number[], windowSize = 3): number {
  if (values.length < windowSize) {
    return calculateMean(values);
  }
  let bestAvg = Infinity;
  for (let windowStart = 0; windowStart <= values.length - windowSize; windowStart++) {
    const windowSlice = values.slice(windowStart, windowStart + windowSize);
    const avg = calculateMean(windowSlice);
    if (avg < bestAvg) {
      bestAvg = avg;
    }
  }
  return bestAvg;
}

/**
 * Get quality emoji based on log loss value
 * @param value - Log loss value
 * @returns Emoji indicator
 */
function getLogLossEmoji(value: number): string {
  if (value <= LOG_LOSS_GOOD) {
    return '🟢';
  }
  if (value <= LOG_LOSS_OK) {
    return '🟡';
  }
  return '🔴';
}

/**
 * Get status emoji
 * @param eliminated - Whether model is eliminated
 * @param phase - Elimination phase
 * @returns Status string with emoji
 */
function getStatusString(eliminated: boolean, phase: number | undefined): string {
  if (!eliminated) {
    return '✅ Active';
  }
  return `❌ P${phase === undefined ? '?' : String(phase)}`;
}

/**
 * Calculate all metrics for a model
 * @param model - Model state
 * @param allMeanLogLosses - All models' mean log losses for percentile ranking
 * @param rankabilityMap - Map of horizon to rankability status (optional)
 * @returns Model metrics
 */
function calculateModelMetrics(
  model: ModelState,
  allMeanLogLosses: number[],
  rankabilityMap?: Map<TimeframeId, HorizonRankability>
): ModelMetrics {
  // Per-horizon log loss averages
  const logLoss15m = calculateMean(model.logLossByHorizon['15m']);
  const logLoss1h = calculateMean(model.logLossByHorizon['1h']);
  const logLoss4h = calculateMean(model.logLossByHorizon['4h']);
  const logLoss24h = calculateMean(model.logLossByHorizon['24h']);

  // Filter to only rankable horizons for composite score calculation
  const rankableHorizons = HORIZONS.filter(h => {
    const rankability = rankabilityMap?.get(h);
    return rankability === undefined || rankability.isRankable;
  });

  // Overall mean log loss (uses all horizons for display)
  const allLosses: number[] = [];
  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array constant
    allLosses.push(...model.logLossByHorizon[horizon]);
  }
  const meanLogLoss = calculateMean(allLosses);

  // For composite score, only use rankable horizons
  const rankableLosses: number[] = [];
  for (const horizon of rankableHorizons) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array constant
    rankableLosses.push(...model.logLossByHorizon[horizon]);
  }
  const rankableMeanLogLoss = rankableLosses.length > 0 ? calculateMean(rankableLosses) : meanLogLoss;

  // Percentile rank (higher is better, lower log loss = higher rank)
  const avgPercentileRank = calculatePercentileRank(rankableMeanLogLoss, allMeanLogLosses);

  // Best window (lower is better) - only on rankable horizons
  const avgBestWindow = rankableLosses.length > 0 ? calculateBestWindow(rankableLosses) : calculateBestWindow(allLosses);

  // Stability (lower std dev is better) - only on rankable horizons
  const avgStability = rankableLosses.length > 0 ? calculateStandardDeviation(rankableLosses) : calculateStandardDeviation(allLosses);

  // Time to pivot ratio (lower is better = earlier pivot detection)
  const allRatios: number[] = [];
  for (const horizon of rankableHorizons) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array constant
    allRatios.push(...model.timeToPivotRatios[horizon]);
  }
  const avgTimeToPivotRatio = allRatios.length > 0 ? calculateMean(allRatios) : 0.5;

  // Composite score: weighted combination (higher is better)
  // 40% percentile rank (already 0-100, normalize to 0-1)
  // 30% best window (lower is better, invert)
  // 20% stability (lower is better, invert)
  // 10% time to pivot (lower is better, invert)
  const normalizedRank = avgPercentileRank / 100;
  const bestWindowScore = Math.max(0, 1 - avgBestWindow / 2); // Normalize assuming max ~2
  const stabilityScore = Math.max(0, 1 - avgStability / 1); // Normalize assuming max ~1
  const pivotScore = 1 - avgTimeToPivotRatio;

  const compositeScore =
    0.4 * normalizedRank +
    0.3 * bestWindowScore +
    0.2 * stabilityScore +
    0.1 * pivotScore;

  const intendedRounds = model.intendedRounds ?? model.roundScores.length;
  const effectiveRoundsByHorizon: Record<TimeframeId, number> = model.effectiveRoundsByHorizon ?? {
    '15m': model.logLossByHorizon['15m'].length,
    '1h': model.logLossByHorizon['1h'].length,
    '4h': model.logLossByHorizon['4h'].length,
    '24h': model.logLossByHorizon['24h'].length,
  };

  const totalEffective = Object.values(effectiveRoundsByHorizon).reduce((a, b) => a + b, 0);
  const totalIntended = intendedRounds * HORIZONS.length;
  const coverageRatio = totalIntended > 0 ? totalEffective / totalIntended : 0;

  const hasLowCoverage = HORIZONS.some(h => {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array constant
    const effective = effectiveRoundsByHorizon[h];
    return hasInsufficientCoverage(effective, intendedRounds);
  });

  return {
    modelId: model.modelId,
    status: getStatusString(model.eliminated, model.eliminatedInPhase),
    rounds: model.roundScores.length,
    failedRounds: model.failedRounds?.length ?? 0,
    logLoss15m,
    logLoss1h,
    logLoss4h,
    logLoss24h,
    meanLogLoss,
    avgPercentileRank,
    avgBestWindow,
    avgStability,
    avgTimeToPivotRatio,
    compositeScore,
    intendedRounds,
    effectiveRoundsByHorizon,
    coverageRatio,
    hasLowCoverage,
  };
}

/**
 * Generate benchmark overview section
 * Explains the prediction task for data scientists
 * @returns Array of markdown lines
 */
export function generateBenchmarkOverview(): string[] {
  return [
    '## Benchmark Overview',
    '',
    'This benchmark evaluates LLMs on a **binary classification task** across 4 horizons (15m, 1h, 4h, 24h):',
    '',
    '> For each horizon, predict whether the current reference low will hold (*no new low*) or be undercut within the forward window.',
    '',
    '**Label definition (`noNewLow`):**',
    '- `1` (true): Forward window low ≥ reference low (bottom held)',
    '- `0` (false): Forward window low < reference low (new low made)',
    '',
    '**Horizons** share the same symbol and time but differ in bar size, lookback window, and forward prediction window.',
    '',
  ];
}

/**
 * Generate methodology section
 * Documents ground truth, scoring, and phase definitions
 * @returns Array of markdown lines
 */
export function generateMethodology(): string[] {
  return [
    '## Methodology',
    '',
    '### Ground Truth',
    '- **Reference low**: Minimum low price across lookback candles',
    '- **Forward low**: Minimum low price in the forward window (prediction horizon)',
    '- **Label**: `y = 1` if forward low ≥ reference low, else `y = 0`',
    '',
    '### Probability Mapping',
    'Models output `{ noNewLow: boolean; confidence ∈ [0.5, 1.0] }` per horizon.',
    '- Probability of no new low: `p = noNewLow ? confidence : (1 - confidence)`',
    '',
    '### Scoring',
    '- **Log loss** (primary): `LL = -(y·log(p) + (1−y)·log(1−p))`, with p clipped to [ε, 1−ε]',
    '- **Random baseline**: p=0.5 gives LL ≈ 0.693',
    '- **Brier score**: Used in Phase 0 sanity checks only (not shown in tables)',
    '',
    '### Phases & Elimination',
    '- **Phase 0 – Sanity filter**: Disqualifies horizons where model performs worse than random baseline, shows degenerate predictions (all mapped p ≥ 0.9 or p ≤ 0.1), or has high extreme error rate (>20% confidently wrong)',
    '- **Phase 1 – Percentile filter**: Retains models above performance threshold per horizon',
    '- **Phase 2 – Stability filter**: Evaluates consistency using rolling windows; eliminates models with no qualified horizons remaining',
    '- **Phase 3 – Final ranking**: Composite scoring of surviving models',
    '',
    '> **Quick mode note:** This verification run only calculates raw log loss per horizon. Full Phase 0–3 elimination is applied in the complete benchmark only.',
    '',
    '**Status codes:**',
    '- `✅ Active`: Survived all phases with ≥1 qualified horizon',
    '- `❌ P0`: Eliminated in Phase 0 (all horizons failed sanity checks)',
    '- `❌ P2`: Eliminated in Phase 2 (no qualified horizons remaining)',
    '',
  ];
}

/**
 * Generate markdown header section
 * @param meta - Run metadata
 * @returns Array of markdown lines
 */
function generateHeader(meta: RunMetadata): string[] {
  return [
    '# agent_006 Benchmark Results',
    '',
    `**Symbol:** ${meta.symbolId}`,
    `**Start Time:** ${meta.startTime}`,
    `**Progress:** Round ${String(meta.currentRound)}/${String(meta.totalRounds)} (Phase ${String(meta.currentPhase)})`,
    `**Last Updated:** ${new Date().toISOString()}`,
    '',
  ];
}

/**
 * Generate run configuration section
 * @param meta - Run metadata
 * @param modelCount - Number of models being tested
 * @returns Array of markdown lines
 */
function generateRunConfigSection(meta: RunMetadata, modelCount: number): string[] {
  const lines: string[] = [
    '## Run Configuration',
    '',
    '| Setting | Value |',
    '|---------|-------|',
    '| Tolerance | 0% strict undercut |',
    `| Unique snapTimes | ${String(meta.totalRounds)} |`,
    `| Models tested | ${String(modelCount)} |`,
    '',
    '**Per-Horizon Configuration:**',
    '',
    '| Horizon | Bar Size | Lookback Bars | Horizon Bars |',
    '|---------|----------|---------------|--------------|',
  ];

  for (const id of TIMEFRAME_IDS) {
    const config = getTimeframeConfig(id);
    const barSize = config.chart.barTimeframe;
    const lookback = getLookbackBars(id);
    const horizon = getHorizonBars(id);
    lines.push(`| ${id} | ${barSize} | ${String(lookback)} | ${String(horizon)} |`);
  }

  lines.push('');
  return lines;
}

/**
 * Generate summary section
 * @param activeCount - Number of active models
 * @param eliminatedCount - Number of eliminated models
 * @param failedCount - Number of models with failures
 * @returns Array of markdown lines
 */
function generateSummary(activeCount: number, eliminatedCount: number, failedCount: number): string[] {
  return [
    '## Summary',
    '',
    `- **Active Models:** ${String(activeCount)}`,
    `- **Eliminated:** ${String(eliminatedCount)}`,
    `- **Models with Failures:** ${String(failedCount)}`,
    '',
  ];
}

const LEADERBOARD_HEADER =
  '| Rank | Model | Status | Rnds | Cov | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |';
const LEADERBOARD_SEPARATOR =
  '|------|-------|--------|------|-----|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|';
const SURVIVORS_TITLE = '## Final Standings (Survivors)';

function formatCoverageCell(m: ModelMetrics): string {
  const covPct = Math.round(m.coverageRatio * 100);
  const warning = m.hasLowCoverage ? '⚠️' : '';
  return `${String(covPct)}%${warning}`;
}

function formatLeaderboardRow(m: ModelMetrics, medal: string): string {
  const ll15m = `${getLogLossEmoji(m.logLoss15m)}${formatNumber(m.logLoss15m, 3)}`;
  const ll1h = `${getLogLossEmoji(m.logLoss1h)}${formatNumber(m.logLoss1h, 3)}`;
  const ll4h = `${getLogLossEmoji(m.logLoss4h)}${formatNumber(m.logLoss4h, 3)}`;
  const ll24h = `${getLogLossEmoji(m.logLoss24h)}${formatNumber(m.logLoss24h, 3)}`;
  const llMean = `${getLogLossEmoji(m.meanLogLoss)}${formatNumber(m.meanLogLoss, 3)}`;
  const pctRank = formatNumber(m.avgPercentileRank, 1);
  const bestWin = formatNumber(m.avgBestWindow, 3);
  const stability = formatNumber(m.avgStability, 3);
  const ttp = formatNumber(m.avgTimeToPivotRatio, 2);
  const score = formatNumber(m.compositeScore, 4);
  const cov = formatCoverageCell(m);
  return `| ${medal} | ${m.modelId} | ${m.status} | ${String(m.rounds)} | ${cov} | ${ll15m} | ${ll1h} | ${ll4h} | ${ll24h} | ${llMean} | ${pctRank} | ${bestWin} | ${stability} | ${ttp} | **${score}** |`;
}

function getMedal(rank: number): string {
  const medalOptions = ['🥇', '🥈', '🥉'];
  return rank <= 3 ? (medalOptions[rank - 1] ?? String(rank)) : String(rank);
}

/**
 * Check if all horizons have insufficient coverage
 * @param m - Model metrics
 * @returns True if all horizons have low coverage
 */
function hasAllHorizonsLowCoverage(m: ModelMetrics): boolean {
  return HORIZONS.every(h => {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array constant
    const effective = m.effectiveRoundsByHorizon[h];
    return hasInsufficientCoverage(effective, m.intendedRounds);
  });
}

/**
 * Generate the survivors leaderboard (active models only)
 * Excludes models with insufficient coverage on all horizons
 * @param metrics - Array of model metrics sorted by composite score
 * @returns Array of markdown lines
 */
function generateSurvivorsLeaderboard(metrics: ModelMetrics[]): string[] {
  const survivors = metrics
    .filter(m => m.status.startsWith('✅'))
    .filter(m => !hasAllHorizonsLowCoverage(m));

  if (survivors.length === 0) {
    return [SURVIVORS_TITLE, '', '*No models survived all elimination phases with adequate coverage.*', ''];
  }

  const lines: string[] = [
    SURVIVORS_TITLE,
    '',
    '*Models with <80% coverage or <10 effective rounds on all horizons are excluded.*',
    '',
    LEADERBOARD_HEADER,
    LEADERBOARD_SEPARATOR,
  ];

  for (const [index, m] of survivors.entries()) {
    lines.push(formatLeaderboardRow(m, getMedal(index + 1)));
  }

  lines.push('');
  return lines;
}

function generateAllModelsLeaderboard(metrics: ModelMetrics[]): string[] {
  const lines: string[] = [
    '## All Models (Research Reference)',
    '',
    '*Includes eliminated models for comparative analysis. Rankings are by raw composite score, not tournament outcome.*',
    '',
    LEADERBOARD_HEADER,
    LEADERBOARD_SEPARATOR,
  ];

  for (const [index, m] of metrics.entries()) {
    lines.push(formatLeaderboardRow(m, getMedal(index + 1)));
  }

  lines.push('');
  lines.push('**Legend:**');
  lines.push('');
  lines.push('*Log loss color coding:*');
  lines.push('- 🟢 Good (≤ 0.5) | 🟡 OK (≤ 0.8) | 🔴 Poor (> 0.8)');
  lines.push('');
  lines.push('*Column definitions:*');
  lines.push('- `Rnds`: Number of successful rounds (failed rounds are excluded from metrics)');
  lines.push('- `Cov`: Coverage percentage (effective rounds / intended rounds). ⚠️ indicates <80% coverage or <10 effective rounds on any horizon');
  lines.push('- `15m, 1h, 4h, 24h`: Mean log loss for that horizon across all valid rounds');
  lines.push('- `Mean`: Arithmetic mean of the four horizon log losses');
  lines.push('- `%Rank`: Percentile rank among all models by composite Score (higher = better)');
  lines.push('- `BestWin`: Best rolling-window average log loss (lower = better)');
  lines.push('- `Stabil`: Standard deviation of per-round log loss (lower = better)');
  lines.push('- `TtP`: Time-to-pivot ratio (lower = better). *Note: With the current no-new-low ground truth system, timing data is not available; all models show TtP = 0.50.*');
  lines.push('- `Score`: Composite metric combining rank, best window, stability, and timing (40% rank + 30% bestWin⁻¹ + 20% stabil⁻¹ + 10% TtP⁻¹). *Non-rankable horizons (insufficient label diversity) are excluded from composite score calculation.*');
  lines.push('');

  return lines;
}

/**
 * Format a single arena ranking row
 * @param ranking - The horizon ranking to format
 * @param rank - The numeric rank (1-based)
 * @returns Formatted markdown table row
 */
function formatArenaRankingRow(ranking: HorizonRanking, rank: number): string {
  const medalOptions = ['🥇', '🥈', '🥉'];
  const medal = rank <= 3 ? (medalOptions[rank - 1] ?? String(rank)) : String(rank);
  const score = formatNumber(ranking.score, 2);
  const logLoss = `${getLogLossEmoji(ranking.logLoss)}${formatNumber(ranking.logLoss, 2)}`;
  const bestWindow = formatNumber(ranking.bestWindow, 2);
  const stability = formatNumber(ranking.stability, 3);
  return `| ${medal} | ${ranking.modelId} | ${score} | ${logLoss} | ${bestWindow} | ${stability} |`;
}

/**
 * Generate arena table for a single rankable horizon
 * @param horizonRankings - Rankings for this horizon
 * @param horizon - The horizon timeframe ID
 * @param metricsMap - Map of model ID to metrics for filtering
 * @returns Array of markdown lines
 */
function generateHorizonArenaTable(
  horizonRankings: HorizonRanking[],
  horizon: TimeframeId,
  metricsMap: Map<string, ModelMetrics>
): string[] {
  const filteredRankings = horizonRankings.filter(r => {
    const metrics = metricsMap.get(r.modelId);
    if (metrics === undefined) {
      return true;
    }
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    const effectiveRounds = metrics.effectiveRoundsByHorizon[horizon];
    return effectiveRounds >= MIN_EFFECTIVE_ROUNDS;
  });

  if (filteredRankings.length === 0) {
    return ['*No models qualified for this arena*', ''];
  }

  const lines = [
    '| Rank | Model | Score | Log Loss | Best Window | Stability |',
    '|------|-------|-------|----------|-------------|-----------|',
  ];

  for (const [index, ranking] of filteredRankings.entries()) {
    lines.push(formatArenaRankingRow(ranking, index + 1));
  }
  lines.push('');

  return lines;
}

/**
 * Generate arena results by horizon section
 * Shows the top 8 arena competitors for each horizon with full metrics
 * Excludes models with insufficient coverage on that horizon
 * Skips non-rankable horizons with an explanation
 * @param rankings - Per-horizon rankings from phase-3-scorer
 * @param metricsMap - Map of modelId to ModelMetrics for coverage filtering
 * @param rankabilityMap - Map of horizon to rankability status
 * @returns Array of markdown lines
 */
function generateArenaResultsByHorizon(
  rankings: PerHorizonRankings | undefined,
  metricsMap: Map<string, ModelMetrics>,
  rankabilityMap: Map<TimeframeId, HorizonRankability>
): string[] {
  if (rankings === undefined) {
    return [];
  }

  const lines: string[] = [
    '## Arena Results by Horizon',
    '',
    '*Models with <10 scored rounds on a given horizon are excluded from that arena.*',
    '',
  ];

  const horizonLabels: Record<TimeframeId, string> = {
    '15m': '15m Arena Winners',
    '1h': '1h Arena Winners',
    '4h': '4h Arena Winners',
    '24h': '24h Arena Winners',
  };

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    const label = horizonLabels[horizon];
    lines.push(`### ${label}`);
    lines.push('');

    const rankability = rankabilityMap.get(horizon);
    if (rankability !== undefined && !rankability.isRankable) {
      const reason = rankability.reason ?? 'insufficient label diversity';
      lines.push(`*This horizon is not rankable: ${reason}. Rankings would not be statistically meaningful.*`);
      lines.push('');
      continue;
    }

    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    const horizonRankings: HorizonRanking[] = rankings[horizon];
    lines.push(...generateHorizonArenaTable(horizonRankings, horizon, metricsMap));
  }

  return lines;
}

/**
 * Generate cross-horizon strength analysis
 * Shows models that appear in multiple horizon arenas
 * @param rankings - Per-horizon rankings from phase-3-scorer
 * @returns Array of markdown lines
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Complex multi-horizon aggregation logic
function generateCrossHorizonStrength(rankings: PerHorizonRankings | undefined): string[] {
  if (rankings === undefined) {
    return [];
  }

  // Count appearances per model across all horizons
  const modelAppearances = new Map<string, { horizons: TimeframeId[]; avgRank: number }>();

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    const horizonRankings: HorizonRanking[] = rankings[horizon];

    for (const [index, ranking] of horizonRankings.entries()) {
      const existing = modelAppearances.get(ranking.modelId);
      const rank = index + 1;

      if (existing === undefined) {
        modelAppearances.set(ranking.modelId, { horizons: [horizon], avgRank: rank });
      } else {
        existing.horizons.push(horizon);
        // Update average rank
        const totalRank = existing.avgRank * (existing.horizons.length - 1) + rank;
        existing.avgRank = totalRank / existing.horizons.length;
      }
    }
  }

  // Filter to models appearing in 2+ arenas
  const multiHorizonModels = [...modelAppearances.entries()]
    .filter(([, data]) => data.horizons.length >= 2)
    .sort((a, b) => {
      // Sort by number of horizons descending, then by avg rank ascending
      if (b[1].horizons.length !== a[1].horizons.length) {
        return b[1].horizons.length - a[1].horizons.length;
      }
      return a[1].avgRank - b[1].avgRank;
    });

  if (multiHorizonModels.length === 0) {
    return [];
  }

  const lines: string[] = [
    '## Cross-Horizon Strength',
    '',
    '*Models appearing in multiple horizon arenas demonstrate consistent performance.*',
    '',
    '| Model | Arenas | Horizons | Avg Rank |',
    '|-------|--------|----------|----------|',
  ];

  for (const [modelId, data] of multiHorizonModels) {
    const arenaCount = String(data.horizons.length);
    const horizonsList = data.horizons.join(', ');
    const avgRank = formatNumber(data.avgRank, 1);

    // Add indicator for models in all 4 arenas
    const strengthIndicator = data.horizons.length === 4 ? '⭐ ' : '';

    lines.push(`| ${strengthIndicator}${modelId} | ${arenaCount}/4 | ${horizonsList} | ${avgRank} |`);
  }

  lines.push('');
  lines.push('**Legend:** ⭐ = Top performer across all horizons');
  lines.push('');

  return lines;
}

/**
 * Generate per-horizon breakdown table (legacy format for backward compatibility)
 * @param metrics - Array of model metrics
 * @returns Array of markdown lines
 */
function generateHorizonBreakdown(metrics: ModelMetrics[]): string[] {
  const lines: string[] = ['## Per-Horizon Rankings (All Models)', ''];

  // Sort by each horizon and show top 10
  const keyMap: Record<TimeframeId, keyof ModelMetrics> = {
    '15m': 'logLoss15m',
    '1h': 'logLoss1h',
    '4h': 'logLoss4h',
    '24h': 'logLoss24h',
  };

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    const key = keyMap[horizon];

    // eslint-disable-next-line security/detect-object-injection -- key from typed constant mapping
    const sorted = [...metrics].sort((a, b) => (a[key] as number) - (b[key] as number));
    const top10 = sorted.slice(0, 10);

    lines.push(`### ${horizon} Horizon (Top 10)`);
    lines.push('');
    lines.push('| Rank | Model | Log Loss | Status |');
    lines.push('|------|-------|----------|--------|');

    for (const [rankIndex, m] of top10.entries()) {
      // eslint-disable-next-line security/detect-object-injection -- key from typed constant mapping
      const value = m[key] as number;
      lines.push(`| ${String(rankIndex + 1)} | ${m.modelId} | ${getLogLossEmoji(value)}${formatNumber(value, 4)} | ${m.status} |`);
    }
    lines.push('');
  }

  return lines;
}

/**
 * Format log loss value for display
 * @param ll - Log loss value
 * @returns Formatted string
 */
function formatLogLoss(ll: number): string {
  return ll > 1e3 ? ll.toExponential(2) : ll.toFixed(3);
}

/**
 * Generate detailed per-horizon elimination audit for each eliminated model
 * @param models - Array of all model states
 * @returns Array of markdown lines
 */
function generateEliminationAuditSection(models: ModelState[]): string[] {
  const eliminatedModels = models.filter(m => m.eliminated);

  if (eliminatedModels.length === 0) {
    return [];
  }

  const lines: string[] = [
    '## Elimination Audit',
    '',
    '*Detailed per-horizon elimination reasons for each eliminated model.*',
    '',
  ];

  for (const m of eliminatedModels) {
    const phase = m.eliminatedInPhase === undefined ? '?' : String(m.eliminatedInPhase);
    lines.push(`### ${m.modelId} (Eliminated Phase ${phase})`);
    lines.push('');
    lines.push(`**Model-level reason:** ${m.eliminationReason ?? 'Unknown'}`);
    lines.push('');
    lines.push('| Horizon | Phase | Reason | Mean LL |');
    lines.push('|---------|-------|--------|---------|');

    for (const horizon of HORIZONS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
      const horizonLosses = m.logLossByHorizon[horizon];
      const meanLL = calculateMean(horizonLosses);
      const formattedLL = formatLogLoss(meanLL);

      const disqInfo = m.disqualifiedHorizons?.get(horizon);

      if (disqInfo === undefined) {
        lines.push(`| ${horizon} | - | Qualified | ${formattedLL} |`);
      } else {
        lines.push(`| ${horizon} | ${String(disqInfo.phase)} | ${disqInfo.reason} | ${formattedLL} |`);
      }
    }

    lines.push('');
  }

  return lines;
}

/**
 * Compute median of a sorted array of numbers
 * @param sorted - Sorted array
 * @returns Median value
 */
function computeMedian(sorted: number[]): number {
  if (sorted.length === 0) {
    return 0;
  }
  const midIndex = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const leftMid = sorted[midIndex - 1] ?? 0;
    // eslint-disable-next-line security/detect-object-injection -- midIndex computed from Math.floor
    const rightMid = sorted[midIndex] ?? 0;
    return (leftMid + rightMid) / 2;
  }
  // eslint-disable-next-line security/detect-object-injection -- midIndex computed from Math.floor
  return sorted[midIndex] ?? 0;
}

const MINUS_LOG_EPSILON = -Math.log(1e-15);

/**
 * Generate mass tie warning section when too many models share identical LL tuples.
 * This catches suspicious patterns like shared cached outputs, fallback predictions,
 * routing mis-attribution, or single-class datasets with constant predictors.
 * @param metrics - Array of model metrics
 * @returns Array of markdown lines for the warning section (empty if no ties detected)
 */
function generateMassTieWarning(metrics: ModelMetrics[]): string[] {
  const tupleGroups = new Map<string, string[]>();

  for (const m of metrics) {
    const tuple = `(${m.logLoss15m.toFixed(3)}, ${m.logLoss1h.toFixed(3)}, ${m.logLoss4h.toFixed(3)}, ${m.logLoss24h.toFixed(3)})`;
    const existing = tupleGroups.get(tuple);
    if (existing === undefined) {
      tupleGroups.set(tuple, [m.modelId]);
    } else {
      existing.push(m.modelId);
    }
  }

  const tiedGroups = [...tupleGroups.entries()]
    .filter(([, models]) => models.length > MASS_TIE_THRESHOLD)
    .sort((a, b) => b[1].length - a[1].length);

  if (tiedGroups.length === 0) {
    return [];
  }

  const lines: string[] = [
    '',
    '## ⚠️ Mass Tie Warning',
    '',
    '*High tie rate detected. Check prediction diversity, parse fallback, or caching issues.*',
    '',
  ];

  for (const [tuple, models] of tiedGroups) {
    lines.push(`**${String(models.length)} models share identical LL tuple ${tuple}:**`);
    for (const modelId of models) {
      lines.push(`- ${modelId}`);
    }
    lines.push('');
  }

  return lines;
}

/**
 * Check if horizon has unbalanced labels and return warning if so
 * @param horizon - Horizon name
 * @param countTrue - Count of true labels
 * @param countFalse - Count of false labels
 * @param n - Total count
 * @returns Warning string or undefined
 */
function checkUnbalancedHorizon(
  horizon: TimeframeId,
  countTrue: number,
  countFalse: number,
  n: number
): string | undefined {
  const minorityCount = Math.min(countTrue, countFalse);
  const minorityPct = n > 0 ? (minorityCount / n) * 100 : 0;
  if (minorityCount < 5 || minorityPct < 5) {
    const minorityLabel = countTrue < countFalse ? 'positive' : 'negative';
    return `⚠️ **${horizon} horizon**: Only ${String(minorityCount)} ${minorityLabel} examples (${minorityPct.toFixed(1)}%). Results are **not rankable** for this horizon.`;
  }
  return undefined;
}

/**
 * Generate dataset diagnostics table rows with baseline columns
 * @param dataset - Dataset diagnostics
 * @returns Object with lines and unbalanced horizon warnings
 */
function generateDiagnosticsTableRows(dataset: DatasetDiagnostics): {
  rows: string[];
  warnings: string[];
} {
  const rows: string[] = [];
  const warnings: string[] = [];

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    const d = dataset.byHorizon[horizon];
    const { n, countTrue, countFalse, pTrue } = d.labels;

    const extremeTrueLL = n > 0 ? (countFalse * MINUS_LOG_EPSILON) / n : 0;
    const extremeFalseLL = n > 0 ? (countTrue * MINUS_LOG_EPSILON) / n : 0;

    const prevalenceLL = d.baselines.prevalenceLogLoss;
    const prevalenceLLFormatted = (prevalenceLL < 1e-6 && prevalenceLL > 0)
      ? prevalenceLL.toExponential(2)
      : prevalenceLL.toFixed(3);

    rows.push(
      `| ${horizon} | ${String(n)} | ${String(countTrue)} | ${String(countFalse)} | ${pTrue.toFixed(3)} | ` +
      `${d.baselines.randomLogLoss.toFixed(3)} | ${prevalenceLLFormatted} | ` +
      `${formatLogLoss(extremeTrueLL)} | ${formatLogLoss(extremeFalseLL)} |`
    );

    const warning = checkUnbalancedHorizon(horizon, countTrue, countFalse, n);
    if (warning !== undefined) {
      warnings.push(warning);
    }
  }

  return { rows, warnings };
}

/**
 * Generate per-round label distribution table
 * @param labelsByTimestamp - Label records by timestamp
 * @returns Array of markdown lines
 */
function generatePerRoundLabelTable(labelsByTimestamp: LabelByTimestamp[]): string[] {
  const lines: string[] = [
    '**Per-round label distribution:**',
    '',
    '| Horizon | Min | Median | Max |',
    '|---------|-----|--------|-----|',
  ];

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    const labelsPerRound = labelsByTimestamp.map(lbt => lbt.labels[horizon]);
    const sorted = [...labelsPerRound].sort((a, b) => a - b);
    const min = sorted[0] ?? 0;
    const max = sorted.at(-1) ?? 0;
    const median = computeMedian(sorted);
    lines.push(`| ${horizon} | ${String(min)} | ${String(median)} | ${String(max)} |`);
  }
  lines.push('');

  return lines;
}

/**
 * Generate dataset diagnostics section
 * @param diagnostics - Benchmark diagnostics (includes dataset and labelsByTimestamp)
 * @returns Array of markdown lines
 */
function generateDatasetDiagnosticsSection(diagnostics: BenchmarkDiagnostics | undefined): string[] {
  if (diagnostics?.dataset === undefined) {
    return [];
  }

  const { rows, warnings } = generateDiagnosticsTableRows(diagnostics.dataset);

  const lines: string[] = [
    SECTION_DATASET_DIAGNOSTICS,
    '',
    '*Label distribution and baseline performance for interpreting model skill.*',
    '',
    DATASET_DIAGNOSTICS_TABLE_HEADER,
    DATASET_DIAGNOSTICS_TABLE_SEPARATOR,
    ...rows,
    '',
    '*Clipping: ε = 1e-15 (probabilities clipped to [ε, 1-ε] to avoid log(0))*',
    '',
    '**Interpretation:**',
    '- *Prevalence LL*: Best possible constant predictor. Models must beat this to show skill.',
    '- *Extreme True/False LL*: Diagnostic baselines for p≈1 or p≈0 predictions. High values indicate label imbalance makes extreme predictions catastrophic.',
    '',
  ];

  if (diagnostics.labelsByTimestamp !== undefined && diagnostics.labelsByTimestamp.length > 0) {
    lines.push(...generatePerRoundLabelTable(diagnostics.labelsByTimestamp));
  }

  if (warnings.length > 0) {
    lines.push(...warnings, '');
  }

  return lines;
}

/**
 * Format a single horizon diversity row
 * @param horizon - Timeframe ID
 * @param d - Horizon prediction diversity metrics
 * @param constant - Whether this is a constant predictor
 * @returns Formatted table row string
 */
function formatHorizonDiversityRow(
  horizon: TimeframeId,
  d: HorizonPredictionDiversity,
  constant: boolean
): string {
  const warningMark = constant ? ' ⚠️' : '';
  return (
    `| ${horizon}${warningMark} | ${String(d.n)} | ${String(d.uniquePCount)} | ` +
    `${d.pMean.toFixed(3)} | ${d.pMin.toFixed(3)} | ${d.pMax.toFixed(3)} | ` +
    `${d.pStdDev.toFixed(3)} | ${d.noNewLowTrueRate.toFixed(2)} |`
  );
}

/**
 * Generate diversity table for a single model
 * @param model - Model prediction diversity metrics
 * @param warnings - Array to collect constant predictor warnings
 * @param parseDiagnostic - Optional parse diagnostics for failure summary
 * @returns Array of markdown lines
 */
function generateModelDiversityTable(
  model: ModelPredictionDiversity,
  warnings: string[],
  parseDiagnostic: ModelParseDiagnostics | undefined
): string[] {
  const lines: string[] = [
    `### ${model.modelId}`,
    '',
    '| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |',
    '|---------|---|----------|-------|------|------|---------|---------------|',
  ];

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    const d: HorizonPredictionDiversity = model.byHorizon[horizon];
    const constant = isConstantPredictor(d);

    if (constant) {
      warnings.push(`${model.modelId} (${horizon}): Constant predictor detected`);
    }

    lines.push(formatHorizonDiversityRow(horizon, d, constant));
  }

  if (parseDiagnostic !== undefined) {
    const totalN = parseDiagnostic.parseSuccessCount +
      parseDiagnostic.parseFailCount +
      parseDiagnostic.schemaFailCount;
    const effectiveN = parseDiagnostic.parseSuccessCount;
    const hasFailures = parseDiagnostic.parseFailCount > 0 ||
      parseDiagnostic.schemaFailCount > 0;

    if (hasFailures) {
      lines.push(
        `**Failures:** ${String(parseDiagnostic.parseFailCount)} parse, ` +
        `${String(parseDiagnostic.schemaFailCount)} schema ` +
        `(effectiveN: ${String(effectiveN)}/${String(totalN)})`
      );
      lines.push('');
    }
  }

  lines.push('');
  return lines;
}

/**
 * Generate prediction diversity section for all models
 * @param diversities - Array of model prediction diversity metrics
 * @param parseDiagnostics - Array of model parse diagnostics for failure info
 * @returns Array of markdown lines
 */
function generatePredictionDiversitySection(
  diversities: ModelPredictionDiversity[] | undefined,
  parseDiagnostics: ModelParseDiagnostics[] | undefined
): string[] {
  if (diversities === undefined || diversities.length === 0) {
    return [];
  }

  const parseMap = new Map<string, ModelParseDiagnostics>();
  if (parseDiagnostics !== undefined) {
    for (const pd of parseDiagnostics) {
      parseMap.set(pd.modelId, pd);
    }
  }

  const lines: string[] = [
    '## Prediction Diversity',
    '',
    '*Variety of predictions per model. Low diversity suggests caching or degenerate behavior.*',
    '',
  ];

  const warnings: string[] = [];

  for (const model of diversities) {
    const parseDiag = parseMap.get(model.modelId);
    lines.push(...generateModelDiversityTable(model, warnings, parseDiag));
  }

  if (warnings.length > 0) {
    lines.push('**Warnings:**');
    for (const w of warnings) {
      lines.push(`- ⚠️ ${w}`);
    }
    lines.push('');
  }

  return lines;
}

interface FailuresByType {
  transport: number;
  timeout: number;
  parse: number;
  schema: number;
  other: number;
}

function extractFailuresByType(parseDiag: ModelParseDiagnostics): FailuresByType | undefined {
  return parseDiag.failuresByType;
}

const HORIZONS_PER_ROUND = 4;

interface FailureAuditAggregates {
  failedModelCalls: number;
  failedHorizonPredictions: number;
}

function computeFailureAggregates(parseDiagnostics: ModelParseDiagnostics[]): FailureAuditAggregates {
  let failedModelCalls = 0;
  let failedHorizonPredictions = 0;

  for (const d of parseDiagnostics) {
    const modelFailedCalls = d.parseFailCount + d.schemaFailCount;
    failedModelCalls += modelFailedCalls;
    failedHorizonPredictions += modelFailedCalls * HORIZONS_PER_ROUND + d.missingHorizonCount;
  }

  return { failedModelCalls, failedHorizonPredictions };
}

interface ModelFailureRow {
  modelId: string;
  modelFailedCalls: number;
  modelFailedHorizons: number;
  transport: number;
  timeout: number;
  parse: number;
  schema: number;
  other: number;
  integrityWarning: string | undefined;
}

function buildModelFailureRow(d: ModelParseDiagnostics): ModelFailureRow {
  const modelFailedCalls = d.parseFailCount + d.schemaFailCount;
  const modelFailedHorizons = modelFailedCalls * HORIZONS_PER_ROUND + d.missingHorizonCount;
  const byType = extractFailuresByType(d);
  const transport = byType?.transport ?? 0;
  const timeout = byType?.timeout ?? 0;
  const parse = byType?.parse ?? 0;
  const schema = byType?.schema ?? 0;
  const other = byType?.other ?? 0;

  const totalTyped = transport + timeout + parse + schema + other;
  const integrityWarning = totalTyped !== modelFailedCalls && modelFailedCalls > 0
    ? `**${d.modelId}**: Failure type sum (${String(totalTyped)}) != calls failed (${String(modelFailedCalls)})`
    : undefined;

  return { modelId: d.modelId, modelFailedCalls, modelFailedHorizons, transport, timeout, parse, schema, other, integrityWarning };
}

function formatFailureRow(row: ModelFailureRow, totalRounds: number): string {
  return `| ${row.modelId} | ${String(row.modelFailedCalls)}/${String(totalRounds)} | ${String(row.modelFailedHorizons)} | ` +
    `${String(row.transport)} | ${String(row.timeout)} | ${String(row.parse)} | ${String(row.schema)} | ${String(row.other)} |`;
}

/**
 * Generate failure audit section for all models
 * @param parseDiagnostics - Array of model parse diagnostics
 * @param totalRounds - Total rounds in the benchmark
 * @param modelCount - Total number of models
 * @returns Array of markdown lines
 */
function generateFailureAuditSection(
  parseDiagnostics: ModelParseDiagnostics[] | undefined,
  totalRounds: number,
  modelCount: number
): string[] {
  if (parseDiagnostics === undefined || parseDiagnostics.length === 0) {
    return [];
  }

  const totalModelCalls = modelCount * totalRounds;
  const totalHorizonPredictions = totalModelCalls * HORIZONS_PER_ROUND;
  const aggregates = computeFailureAggregates(parseDiagnostics);

  const modelCallFailRate = totalModelCalls > 0
    ? ((aggregates.failedModelCalls / totalModelCalls) * 100).toFixed(1)
    : '0.0';
  const horizonFailRate = totalHorizonPredictions > 0
    ? ((aggregates.failedHorizonPredictions / totalHorizonPredictions) * 100).toFixed(1)
    : '0.0';

  const lines: string[] = [
    '## Failure Audit',
    '',
    '*Failed rounds are excluded from scoring.*',
    '',
    '**Aggregate:**',
    `- Total model calls: ${String(totalModelCalls)} (${String(modelCount)} models × ${String(totalRounds)} rounds)`,
    `- Failed model calls: ${String(aggregates.failedModelCalls)} (${modelCallFailRate}%)`,
    `- Total horizon predictions: ${String(totalHorizonPredictions)} (${String(modelCount)} models × ${String(totalRounds)} rounds × ${String(HORIZONS_PER_ROUND)} horizons)`,
    `- Failed horizon predictions: ${String(aggregates.failedHorizonPredictions)} (${horizonFailRate}%)`,
    '',
    '**Per-Model Breakdown:**',
    '',
    '| Model | Calls Failed/Total | Horizons Failed | Transport | Timeout | Parse | Schema | Other |',
    '|-------|--------------------|--------------------|-----------|---------|-------|--------|-------|',
  ];

  const rows = parseDiagnostics.map(d => buildModelFailureRow(d));
  const integrityWarnings = rows.map(r => r.integrityWarning).filter((w): w is string => w !== undefined);

  for (const row of rows) {
    lines.push(formatFailureRow(row, totalRounds));
  }

  lines.push('');

  if (integrityWarnings.length > 0) {
    lines.push('> ⚠️ **Audit Integrity Warning**:');
    for (const warning of integrityWarnings) {
      lines.push(`> - ${warning}`);
    }
    lines.push('');
  }

  return lines;
}

/**
 * Generate failed rounds section
 * @param models - All model states
 * @returns Array of markdown lines
 */
function generateFailedSection(models: ModelState[]): string[] {
  const failedModels = models.filter(m => {
    const failed = m.failedRounds;
    return failed !== undefined && failed.length > 0;
  });

  if (failedModels.length === 0) {
    return [];
  }

  const lines: string[] = [
    '## Model Failures',
    '',
    '*Note: Failed rounds (API errors, malformed responses) are excluded from scoring. The `Rnds` column shows successful rounds used in metric calculation.*',
    '',
    '| Model | Failed Rounds |',
    '|-------|---------------|',
  ];

  for (const m of failedModels) {
    const failed = m.failedRounds ?? [];
    lines.push(`| ${m.modelId} | ${failed.join(', ')} |`);
  }
  lines.push('');
  return lines;
}

/**
 * Label record for a single timestamp with labels per horizon
 */
export interface LabelByTimestamp {
  snapTime: Date;
  labels: Record<TimeframeId, 0 | 1>;
}

/**
 * Diagnostics bundle for benchmark run
 */
export interface BenchmarkDiagnostics {
  dataset?: DatasetDiagnostics;
  predictionDiversity?: ModelPredictionDiversity[];
  parseDiagnostics?: ModelParseDiagnostics[];
  labelsByTimestamp?: LabelByTimestamp[];
}

/**
 * Generate markdown content for current benchmark state
 * @param models - Map of model states
 * @param meta - Run metadata
 * @param perHorizonRankings - Optional per-horizon rankings from phase-3-scorer
 * @param diagnostics - Optional diagnostics bundle
 * @returns Markdown string
 */
function generateMarkdown(
  models: Map<string, ModelState>,
  meta: RunMetadata,
  perHorizonRankings?: PerHorizonRankings,
  diagnostics?: BenchmarkDiagnostics
): string {
  const allModels = [...models.values()];
  const activeModels = allModels.filter(m => !m.eliminated);
  const eliminatedModels = allModels.filter(m => m.eliminated);
  const failedModels = allModels.filter(m => {
    const failed = m.failedRounds;
    return failed !== undefined && failed.length > 0;
  });

  // Calculate mean log loss for each model for percentile ranking
  const allMeanLogLosses = allModels
    .filter(m => m.roundScores.length > 0)
    .map(m => {
      const losses: number[] = [];
      for (const horizon of HORIZONS) {
        // eslint-disable-next-line security/detect-object-injection -- horizon from typed array constant
        losses.push(...m.logLossByHorizon[horizon]);
      }
      return calculateMean(losses);
    });

  // Compute horizon rankability from dataset diagnostics
  const rankabilityMap = computeHorizonRankability(diagnostics?.dataset);

  // Calculate metrics for all models with data (pass rankability to exclude non-rankable from composite)
  const modelMetrics = allModels
    .filter(m => m.roundScores.length > 0)
    .map(m => calculateModelMetrics(m, allMeanLogLosses, rankabilityMap))
    .sort((a, b) => b.compositeScore - a.compositeScore);

  // Build metrics map for coverage filtering in arena results
  const metricsMap = new Map<string, ModelMetrics>();
  for (const m of modelMetrics) {
    metricsMap.set(m.modelId, m);
  }

  const lines: string[] = [
    ...generateHeader(meta),
    ...generateRunConfigSection(meta, models.size),
    ...generateBenchmarkOverview(),
    ...generateMethodology(),
    ...generateDatasetDiagnosticsSection(diagnostics),
    ...generatePredictionDiversitySection(diagnostics?.predictionDiversity, diagnostics?.parseDiagnostics),
    ...generateFailureAuditSection(diagnostics?.parseDiagnostics, meta.totalRounds, allModels.length),
    ...generateSummary(activeModels.length, eliminatedModels.length, failedModels.length),
    ...generateMassTieWarning(modelMetrics),
    ...generateArenaResultsByHorizon(perHorizonRankings, metricsMap, rankabilityMap),
    ...generateCrossHorizonStrength(perHorizonRankings),
    ...generateSurvivorsLeaderboard(modelMetrics),
    ...generateAllModelsLeaderboard(modelMetrics),
    ...generateHorizonBreakdown(modelMetrics),
    ...generateEliminationAuditSection(allModels),
    ...generateFailedSection(allModels),
    '---',
    '*Auto-generated by agent_006 benchmark*',
  ];

  return lines.join('\n');
}

/**
 * Options for persisting results
 */
interface PersistOptions {
  /** Skip writing the results file (used in quick mode) */
  skipWrite?: boolean;
  /** Logger instance for output messages */
  logger?: BenchmarkLogger;
  /** Diagnostics bundle for the run */
  diagnostics?: BenchmarkDiagnostics;
}

/**
 * Persist current benchmark results to markdown file
 * @param models - Map of model states
 * @param meta - Run metadata
 * @param perHorizonRankings - Optional per-horizon rankings from phase-3-scorer
 * @param options - Optional persist options
 */
export function persistResults(
  models: Map<string, ModelState>,
  meta: RunMetadata,
  perHorizonRankings?: PerHorizonRankings,
  options?: PersistOptions
): void {
  if (options?.skipWrite === true) {
    options.logger?.log('Skipping results file update in quick mode');
    return;
  }
  const markdown = generateMarkdown(models, meta, perHorizonRankings, options?.diagnostics);
  const filePath = join(process.cwd(), RESULTS_FILE);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is constructed from constants
  writeFileSync(filePath, markdown, 'utf8');
}

/**
 * Get the results file path
 * @returns Absolute path to results file
 */
export function getResultsFilePath(): string {
  return join(process.cwd(), RESULTS_FILE);
}

function pluralize(value: number, singular: string, plural: string): string {
  return value === 1 ? `1 ${singular}` : `${String(value)} ${plural}`;
}

/**
 * Format minutes as human-readable time string
 * @param minutes - Duration in minutes
 * @returns Human-readable time string
 */
function formatMinutesAsTime(minutes: number): string {
  if (minutes >= 1440) {
    const days = minutes / 1440;
    if (Number.isInteger(days)) {
      return pluralize(days, 'day', 'days');
    }
    return pluralize(minutes / 60, 'hour', 'hours');
  }
  if (minutes >= 60) {
    return pluralize(minutes / 60, 'hour', 'hours');
  }
  return `${String(minutes)} minutes`;
}

/**
 * Format bar size as human-readable string
 * @param minutes - Bar size in minutes
 * @returns Human-readable bar size string
 */
function formatBarSize(minutes: number): string {
  if (minutes >= 60) {
    const hours = minutes / 60;
    return hours === 1 ? '1-hour' : `${String(hours)}-hour`;
  }
  return `${String(minutes)}-minute`;
}

/**
 * Generate task specification table for quick report
 * @returns Array of markdown lines
 */
export function generateTaskSpecSection(): string[] {
  const lines: string[] = [
    '## Task Specification',
    '',
    '| Horizon | Bar Size | Lookback Bars | Lookback Time | Forward Window |',
    '|---------|----------|---------------|---------------|----------------|',
  ];

  for (const id of TIMEFRAME_IDS) {
    const config = getTimeframeConfig(id);
    const lookbackBars = getLookbackBars(id);
    const barSize = formatBarSize(config.chart.barSizeMinutes);
    const lookbackTime = formatMinutesAsTime(config.chart.range.fromMinutesAgo);
    const forwardWindow = formatMinutesAsTime(config.task.forwardWindowMinutes);

    lines.push(`| ${id} | ${barSize} | ${String(lookbackBars)} | ${lookbackTime} | ${forwardWindow} |`);
  }

  lines.push('');
  return lines;
}

/**
 * Minority class threshold for label imbalance warning (percentage)
 */
const LABEL_IMBALANCE_THRESHOLD = 0.05;

/**
 * Minority class threshold for label imbalance warning (absolute count)
 */
const LABEL_IMBALANCE_MIN_COUNT = 5;

/**
 * Format prevalence log loss value for display
 * @param prevalenceLogLoss - The prevalence log loss value
 * @returns Formatted string
 */
export function formatPrevalenceLogLoss(prevalenceLogLoss: number): string {
  const isVerySmallPositive = prevalenceLogLoss < 1e-6 && prevalenceLogLoss > 0;
  return isVerySmallPositive
    ? prevalenceLogLoss.toExponential(2)
    : prevalenceLogLoss.toFixed(3);
}

/**
 * Check if horizon has label imbalance and return warning if so
 * @param horizon - Horizon identifier
 * @param labels - Label statistics
 * @param labels.n - Total number of labels
 * @param labels.countTrue - Count of true labels
 * @param labels.countFalse - Count of false labels
 * @param labels.pTrue - Proportion of true labels
 * @returns Warning message or undefined
 */
export function checkLabelImbalance(
  horizon: TimeframeId,
  labels: { n: number; countTrue: number; countFalse: number; pTrue: number }
): string | undefined {
  const minorityCount = Math.min(labels.countTrue, labels.countFalse);
  const minorityPct = Math.min(labels.pTrue, 1 - labels.pTrue);
  const minorityLabel = labels.countTrue < labels.countFalse ? 'positive' : 'negative';
  const hasImbalance = minorityPct < LABEL_IMBALANCE_THRESHOLD || minorityCount < LABEL_IMBALANCE_MIN_COUNT;

  if (labels.n > 0 && hasImbalance) {
    return `⚠️ **Warning**: ${horizon} horizon has only ${String(minorityCount)} ${minorityLabel} examples out of ${String(labels.n)} (${(minorityPct * 100).toFixed(1)}%). Metrics are dominated by base rate.`;
  }
  return undefined;
}

// Re-export quick mode functions from dedicated module
export { persistQuickResults } from './quick-mode-report.js';
export type { QuickRunMetadata } from './quick-mode-report.js';

const SCORED_DATAPOINTS_FILE = 'BENCHMARK_SCORED_DATAPOINTS.json';

/**
 * Serializable version of ScoredDatapointRecord with Date as ISO string
 */
interface SerializableScoredDatapoint {
  snapTime: string;
  horizonId: TimeframeId;
  refLowCandlesBack: number;
  refLowPrice: number;
  forwardLowPrice: number;
  labelNoNewLow: 0 | 1;
  modelId: string;
  modelOutputRaw: string;
  predictionNoNewLow: boolean;
  predictionConfidence: number;
  pUsedForScoring: number;
  logLoss: number;
  brierScore: number;
  promptHash: string;
  imageHash: string;
}

/**
 * Persist scored datapoints to a JSON file for exact re-scoring
 * @param datapoints - Array of scored datapoint records
 * @param filePath - Optional custom file path (defaults to BENCHMARK_SCORED_DATAPOINTS.json)
 */
export function persistScoredDatapoints(
  datapoints: ScoredDatapointRecord[],
  filePath?: string
): void {
  const outputPath = filePath ?? join(process.cwd(), SCORED_DATAPOINTS_FILE);

  const serializable: SerializableScoredDatapoint[] = datapoints.map((dp) => ({
    snapTime: dp.snapTime.toISOString(),
    horizonId: dp.horizonId,
    refLowCandlesBack: dp.refLowCandlesBack,
    refLowPrice: dp.refLowPrice,
    forwardLowPrice: dp.forwardLowPrice,
    labelNoNewLow: dp.labelNoNewLow,
    modelId: dp.modelId,
    modelOutputRaw: dp.modelOutputRaw,
    predictionNoNewLow: dp.predictionNoNewLow,
    predictionConfidence: dp.predictionConfidence,
    pUsedForScoring: dp.pUsedForScoring,
    logLoss: dp.logLoss,
    brierScore: dp.brierScore,
    promptHash: dp.promptHash,
    imageHash: dp.imageHash,
  }));

  // eslint-disable-next-line unicorn/no-null -- null required for JSON.stringify replacer parameter
  const json = JSON.stringify(serializable, null, 2);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is constructed from constants or user-provided
  writeFileSync(outputPath, json, 'utf8');
}
/* eslint-enable max-lines -- Re-enable after file scope disable */
