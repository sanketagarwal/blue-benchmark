import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Horizon } from './horizon-config.js';
import type { Phase0RoundScore } from './scorers/phase-0-scorer.js';

/**
 * Model state for persistence
 */
interface ModelState {
  modelId: string;
  eliminated: boolean;
  eliminatedInPhase?: number;
  eliminationReason?: string;
  roundScores: Phase0RoundScore[];
  logLossByHorizon: Record<Horizon, number[]>;
  timeToPivotRatios: Record<Horizon, number[]>;
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
 * Model score summary for leaderboard
 */
interface ModelScoreSummary {
  modelId: string;
  meanLogLoss: number;
  rounds: number;
  eliminated: boolean;
  eliminatedInPhase: number | undefined;
  failedRounds: number;
}

const HORIZONS: Horizon[] = ['15m', '1h', '24h', '7d'];
const RESULTS_FILE = 'BENCHMARK_RESULTS.md';

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
 * Get log losses for a model across all horizons
 * @param model - Model state
 * @returns Flat array of all log losses
 */
function getAllLogLosses(model: ModelState): number[] {
  const losses: number[] = [];
  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array constant
    losses.push(...model.logLossByHorizon[horizon]);
  }
  return losses;
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
 * Format status string for leaderboard
 * @param score - Model score summary
 * @returns Status string
 */
function formatStatus(score: ModelScoreSummary): string {
  if (score.eliminated) {
    const phase = score.eliminatedInPhase === undefined ? '?' : String(score.eliminatedInPhase);
    return `Eliminated (Phase ${phase})`;
  }
  if (score.failedRounds > 0) {
    return `${String(score.failedRounds)} failures`;
  }
  return 'Active';
}

/**
 * Generate leaderboard section
 * @param modelScores - Sorted model scores
 * @returns Array of markdown lines
 */
function generateLeaderboard(modelScores: ModelScoreSummary[]): string[] {
  const lines: string[] = [
    '## Leaderboard (by Mean Log Loss)',
    '',
    '| Rank | Model | Mean Log Loss | Rounds | Status |',
    '|------|-------|--------------|--------|--------|',
  ];

  for (const [index, score] of modelScores.entries()) {
    const status = formatStatus(score);
    lines.push(`| ${String(index + 1)} | ${score.modelId} | ${formatNumber(score.meanLogLoss)} | ${String(score.rounds)} | ${status} |`);
  }
  lines.push('');
  return lines;
}

/**
 * Generate per-horizon section for active models
 * @param activeModels - Active model states
 * @returns Array of markdown lines
 */
function generateHorizonBreakdown(activeModels: ModelState[]): string[] {
  const lines: string[] = ['## Per-Horizon Performance (Active Models)', ''];

  for (const horizon of HORIZONS) {
    lines.push(`### ${horizon}`, '');

    const horizonScores = activeModels
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array constant
      .filter(m => m.logLossByHorizon[horizon].length > 0)
      .map(m => ({
        modelId: m.modelId,
        // eslint-disable-next-line security/detect-object-injection -- horizon from typed array constant
        meanLogLoss: calculateMean(m.logLossByHorizon[horizon]),
        // eslint-disable-next-line security/detect-object-injection -- horizon from typed array constant
        samples: m.logLossByHorizon[horizon].length,
      }))
      .sort((a, b) => a.meanLogLoss - b.meanLogLoss);

    if (horizonScores.length === 0) {
      lines.push('No data yet.', '');
      continue;
    }

    lines.push('| Model | Mean Log Loss | Samples |', '|-------|--------------|---------|');
    for (const score of horizonScores) {
      lines.push(`| ${score.modelId} | ${formatNumber(score.meanLogLoss)} | ${String(score.samples)} |`);
    }
    lines.push('');
  }
  return lines;
}

/**
 * Generate eliminated models section
 * @param eliminatedModels - Eliminated model states
 * @returns Array of markdown lines
 */
function generateEliminatedSection(eliminatedModels: ModelState[]): string[] {
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
 * @param failedModels - Models with failures
 * @returns Array of markdown lines
 */
function generateFailedSection(failedModels: ModelState[]): string[] {
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
 * @returns Markdown string
 */
function generateMarkdown(
  models: Map<string, ModelState>,
  meta: RunMetadata
): string {
  const allModels = [...models.values()];
  const activeModels = allModels.filter(m => !m.eliminated);
  const eliminatedModels = allModels.filter(m => m.eliminated);
  const failedModels = allModels.filter(m => {
    const failed = m.failedRounds;
    return failed !== undefined && failed.length > 0;
  });

  const modelScores: ModelScoreSummary[] = allModels
    .filter(m => m.roundScores.length > 0)
    .map(m => ({
      modelId: m.modelId,
      meanLogLoss: calculateMean(getAllLogLosses(m)),
      rounds: m.roundScores.length,
      eliminated: m.eliminated,
      eliminatedInPhase: m.eliminatedInPhase,
      failedRounds: m.failedRounds?.length ?? 0,
    }))
    .sort((a, b) => a.meanLogLoss - b.meanLogLoss);

  const lines: string[] = [
    ...generateHeader(meta),
    ...generateSummary(activeModels.length, eliminatedModels.length, failedModels.length),
    ...generateLeaderboard(modelScores),
    ...generateHorizonBreakdown(activeModels),
    ...generateEliminatedSection(eliminatedModels),
    ...generateFailedSection(failedModels),
    '---',
    '*Auto-generated by agent_006 benchmark*',
  ];

  return lines.join('\n');
}

/**
 * Persist current benchmark results to markdown file
 * @param models - Map of model states
 * @param meta - Run metadata
 */
export function persistResults(
  models: Map<string, ModelState>,
  meta: RunMetadata
): void {
  const markdown = generateMarkdown(models, meta);
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
