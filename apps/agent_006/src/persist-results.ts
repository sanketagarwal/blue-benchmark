import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Phase0RoundScore } from './scorers/phase-0-scorer.js';
import type { HorizonRanking, PerHorizonRankings } from './scorers/phase-3-scorer.js';
import type { TimeframeId } from './timeframe-config.js';

/**
 * Model state for persistence
 */
interface ModelState {
  modelId: string;
  eliminated: boolean;
  eliminatedInPhase?: number;
  eliminationReason?: string;
  roundScores: Phase0RoundScore[];
  logLossByHorizon: Record<TimeframeId, number[]>;
  timeToPivotRatios: Record<TimeframeId, number[]>;
  failedRounds?: number[];
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
}

const HORIZONS: TimeframeId[] = ['15m', '1h', '4h', '24h'];
const RESULTS_FILE = 'BENCHMARK_RESULTS.md';

// Quality thresholds for log loss (lower is better)
const LOG_LOSS_GOOD = 0.5;
const LOG_LOSS_OK = 0.8;

/**
 * Format a number to fixed decimal places
 * @param value - Number to format
 * @param decimals - Decimal places (default 4)
 * @returns Formatted string
 */
function formatNumber(value: number, decimals = 4): string {
  return value.toFixed(decimals);
}

/**
 * Calculate mean of an array of numbers
 * @param values - Array of numbers
 * @returns Mean value or 0 if empty
 */
function calculateMean(values: number[]): number {
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
 * @returns Model metrics
 */
function calculateModelMetrics(
  model: ModelState,
  allMeanLogLosses: number[]
): ModelMetrics {
  // Per-horizon log loss averages
  const logLoss15m = calculateMean(model.logLossByHorizon['15m']);
  const logLoss1h = calculateMean(model.logLossByHorizon['1h']);
  const logLoss4h = calculateMean(model.logLossByHorizon['4h']);
  const logLoss24h = calculateMean(model.logLossByHorizon['24h']);

  // Overall mean log loss
  const allLosses: number[] = [];
  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array constant
    allLosses.push(...model.logLossByHorizon[horizon]);
  }
  const meanLogLoss = calculateMean(allLosses);

  // Percentile rank (higher is better, lower log loss = higher rank)
  const avgPercentileRank = calculatePercentileRank(meanLogLoss, allMeanLogLosses);

  // Best window (lower is better)
  const avgBestWindow = calculateBestWindow(allLosses);

  // Stability (lower std dev is better)
  const avgStability = calculateStandardDeviation(allLosses);

  // Time to pivot ratio (lower is better = earlier pivot detection)
  const allRatios: number[] = [];
  for (const horizon of HORIZONS) {
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
  };
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

/**
 * Generate the comprehensive results table
 * @param metrics - Array of model metrics sorted by composite score
 * @returns Array of markdown lines
 */
function generateComprehensiveTable(metrics: ModelMetrics[]): string[] {
  const lines: string[] = [
    '## Full Results (All Models)',
    '',
    '| Rank | Model | Status | Rnds | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |',
    '|------|-------|--------|------|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|',
  ];

  for (const [index, m] of metrics.entries()) {
    const rank = index + 1;
    const medalOptions = ['🥇', '🥈', '🥉'];
    const medal = rank <= 3 ? (medalOptions[rank - 1] ?? String(rank)) : String(rank);

    // Format with quality indicators
    const ll15m = `${getLogLossEmoji(m.logLoss15m)}${formatNumber(m.logLoss15m, 3)}`;
    const ll1h = `${getLogLossEmoji(m.logLoss1h)}${formatNumber(m.logLoss1h, 3)}`;
    const ll4h = `${getLogLossEmoji(m.logLoss4h)}${formatNumber(m.logLoss4h, 3)}`;
    const ll24h = `${getLogLossEmoji(m.logLoss24h)}${formatNumber(m.logLoss24h, 3)}`;
    const llMean = `${getLogLossEmoji(m.meanLogLoss)}${formatNumber(m.meanLogLoss, 3)}`;

    // Format composite components
    const pctRank = formatNumber(m.avgPercentileRank, 1);
    const bestWin = formatNumber(m.avgBestWindow, 3);
    const stability = formatNumber(m.avgStability, 3);
    const ttp = formatNumber(m.avgTimeToPivotRatio, 2);
    const score = formatNumber(m.compositeScore, 4);

    lines.push(
      `| ${medal} | ${m.modelId} | ${m.status} | ${String(m.rounds)} | ${ll15m} | ${ll1h} | ${ll4h} | ${ll24h} | ${llMean} | ${pctRank} | ${bestWin} | ${stability} | ${ttp} | **${score}** |`
    );
  }

  lines.push('');
  lines.push('**Legend:**');
  lines.push('- 🟢 Good (≤0.5) | 🟡 OK (≤0.8) | 🔴 Poor (>0.8)');
  lines.push('- %Rank: Percentile rank (higher=better) | BestWin: Best rolling window avg (lower=better)');
  lines.push('- Stabil: Std dev of log loss (lower=better) | TtP: Time-to-pivot ratio (lower=better)');
  lines.push('- Score: Composite (40% rank + 30% bestWin⁻¹ + 20% stabil⁻¹ + 10% TtP⁻¹)');
  lines.push('');

  return lines;
}

/**
 * Generate arena results by horizon section
 * Shows the top 8 arena competitors for each horizon with full metrics
 * @param rankings - Per-horizon rankings from phase-3-scorer
 * @returns Array of markdown lines
 */
function generateArenaResultsByHorizon(rankings: PerHorizonRankings | undefined): string[] {
  if (rankings === undefined) {
    return [];
  }

  const lines: string[] = ['## Arena Results by Horizon', ''];

  const horizonLabels: Record<TimeframeId, string> = {
    '15m': '15m Arena Winners',
    '1h': '1h Arena Winners',
    '4h': '4h Arena Winners',
    '24h': '24h Arena Winners',
  };

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    const horizonRankings: HorizonRanking[] = rankings[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    const label = horizonLabels[horizon];

    lines.push(`### ${label}`);
    lines.push('');

    if (horizonRankings.length === 0) {
      lines.push('*No models qualified for this arena*');
      lines.push('');
      continue;
    }

    lines.push('| Rank | Model | Score | Log Loss | Best Window | Stability |');
    lines.push('|------|-------|-------|----------|-------------|-----------|');

    for (const [index, ranking] of horizonRankings.entries()) {
      const rank = index + 1;
      const medalOptions = ['🥇', '🥈', '🥉'];
      const medal = rank <= 3 ? (medalOptions[rank - 1] ?? String(rank)) : String(rank);

      const score = formatNumber(ranking.score, 2);
      const logLoss = `${getLogLossEmoji(ranking.logLoss)}${formatNumber(ranking.logLoss, 2)}`;
      const bestWindow = formatNumber(ranking.bestWindow, 2);
      const stability = formatNumber(ranking.stability, 3);

      lines.push(
        `| ${medal} | ${ranking.modelId} | ${score} | ${logLoss} | ${bestWindow} | ${stability} |`
      );
    }
    lines.push('');
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
 * Generate eliminated models section
 * @param models - All model states
 * @returns Array of markdown lines
 */
function generateEliminatedSection(models: ModelState[]): string[] {
  const eliminatedModels = models.filter(m => m.eliminated);

  if (eliminatedModels.length === 0) {
    return [];
  }

  const lines: string[] = [
    '## Eliminated Models',
    '',
    '| Model | Phase | Reason |',
    '|-------|-------|--------|',
  ];

  for (const m of eliminatedModels) {
    const phase = m.eliminatedInPhase === undefined ? '?' : String(m.eliminatedInPhase);
    lines.push(`| ${m.modelId} | ${phase} | ${m.eliminationReason ?? 'Unknown'} |`);
  }
  lines.push('');
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
 * Generate markdown content for current benchmark state
 * @param models - Map of model states
 * @param meta - Run metadata
 * @param perHorizonRankings - Optional per-horizon rankings from phase-3-scorer
 * @returns Markdown string
 */
function generateMarkdown(
  models: Map<string, ModelState>,
  meta: RunMetadata,
  perHorizonRankings?: PerHorizonRankings
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

  // Calculate metrics for all models with data
  const modelMetrics = allModels
    .filter(m => m.roundScores.length > 0)
    .map(m => calculateModelMetrics(m, allMeanLogLosses))
    .sort((a, b) => b.compositeScore - a.compositeScore);

  const lines: string[] = [
    ...generateHeader(meta),
    ...generateSummary(activeModels.length, eliminatedModels.length, failedModels.length),
    ...generateArenaResultsByHorizon(perHorizonRankings),
    ...generateCrossHorizonStrength(perHorizonRankings),
    ...generateComprehensiveTable(modelMetrics),
    ...generateHorizonBreakdown(modelMetrics),
    ...generateEliminatedSection(allModels),
    ...generateFailedSection(allModels),
    '---',
    '*Auto-generated by agent_006 benchmark*',
  ];

  return lines.join('\n');
}

/**
 * Persist current benchmark results to markdown file
 * @param models - Map of model states
 * @param meta - Run metadata
 * @param perHorizonRankings - Optional per-horizon rankings from phase-3-scorer
 */
export function persistResults(
  models: Map<string, ModelState>,
  meta: RunMetadata,
  perHorizonRankings?: PerHorizonRankings
): void {
  const markdown = generateMarkdown(models, meta, perHorizonRankings);
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
