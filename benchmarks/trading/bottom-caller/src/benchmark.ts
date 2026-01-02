/* eslint-disable max-lines -- TODO: Split benchmark.ts into smaller modules (2141 lines) */
import { runRound } from '@nullagent/agent-core';
import { createBenchmarkLogger } from '@nullagent/cli-utils';
import chalk from 'chalk';

import {
  createBottomCaller,
  setBottomCallerContext,
  clearBottomCallerContext,
} from './bottom-caller.js';
import { parseModelArgument } from './cli-arguments.js';
import {
  initializeClock,
  advanceClock,
  resetClockState,
} from './clock-state.js';
import {
  initAuditFile,
  writeAuditRecord,
  buildAuditRecord,
} from './diagnostics/audit-writer.js';
import { resolveDualGroundTruth } from './ground-truth/bottom-checker.js';
import { getModelIds } from './matrix.js';
import { persistResults } from './persist-results.js';
import { prefetchAllRoundData } from './prefetch-warmup.js';
import { getForecastingCharts } from './replay-lab/charts.js';
import {
  buildLeaderboardScoreData,
  countQualifiedModels,
  toBaseScoreData,
} from './reports/leaderboard-data.js';
import {
  generateLeaderboard,
  formatLeaderboardTable,
} from './reports/leaderboards.js';
import {
  buildModelProfile,
  formatProfileTable,
} from './reports/model-profiles.js';
import {
  analyzeMetricSeparability,
  formatSeparabilityTable,
  MIN_MODELS_FOR_SEPARABILITY,
} from './reports/separability.js';
import { brierScore } from './scorers/brier-scorer.js';
import {
  scorePhase0Round,
  aggregatePhase0Scores,
  getPhase0DisqualifiedHorizonsWithBaselines,
  computeBaselineLogLoss,
} from './scorers/phase-0-scorer.js';
import {
  computePercentileRanks,
  getQualifiedHorizons,
  hasNoQualifiedHorizons,
} from './scorers/phase-1-scorer.js';
import {
  computeStabilityMetrics,
  computeRegret,
  getHorizonsToDisqualify,
  median,
} from './scorers/phase-2-scorer.js';
import { rankModelsPerHorizon } from './scorers/phase-3-scorer.js';
import { computeTrackBMetrics } from './scorers/timing-metrics.js';
import {
  printPerHorizonArenaTable,
  printFinalSummaryTable,
  printTimingDiagnosticsTable,
  printCrossHorizonBehaviorMap,
} from './table.js';

import type { BottomCallerOutput, BottomContractId, BottomPredictions } from './bottom-caller.js';
import type { MetricSeparability, ModelProfile } from './reports/separability.js';
import type { BaselineLogLoss, Phase0RoundScore } from './scorers/phase-0-scorer.js';
import type { Phase1ModelScore } from './scorers/phase-1-scorer.js';
import type { Phase2ModelScore } from './scorers/phase-2-scorer.js';
import type { ModelWithHorizonMetrics, PerHorizonRankings } from './scorers/phase-3-scorer.js';
import type { RoundScore } from './state/model-state.js';
import type { TimeframeId } from './timeframe-config.js';

const logger = createBenchmarkLogger(process.argv.includes('--verbose'));
const isQuickMode = process.argv.includes('--quick');

const HORIZONS: TimeframeId[] = ['15m', '1h', '4h', '24h'];
const LOG_LOSS_GOOD = 0.5;
const LOG_LOSS_OK = 0.8;

/**
 * Convert prediction to probability of bottom occurring.
 * If hasBottomed=true: p = confidence (model believes bottom occurred)
 * If hasBottomed=false: p = 1 - confidence (model believes no bottom, so low p)
 * @param pred - Single horizon prediction object
 * @param pred.hasBottomed - Whether model predicts bottom occurred
 * @param pred.confidence - Model's confidence in its prediction (0-1)
 * @returns Probability of bottom occurring (0-1)
 */
function predictionToProbability(pred: { hasBottomed: boolean; confidence: number }): number {
  return pred.hasBottomed ? pred.confidence : (1 - pred.confidence);
}

/**
 * Convert new prediction format to legacy scorer format
 * New format: { '15m': { hasBottomed, confidence, candlesBack }, ... }
 * Legacy format: { 'bottom-15m': number, ... }
 * @param predictions - Predictions in new per-horizon format
 * @returns Predictions in legacy scorer format (probability of bottom)
 */
function convertPredictionsForScorer(
  predictions: BottomPredictions
): Record<BottomContractId, number> {
  return {
    'bottom-15m': predictionToProbability(predictions['15m']),
    'bottom-1h': predictionToProbability(predictions['1h']),
    'bottom-4h': predictionToProbability(predictions['4h']),
    'bottom-24h': predictionToProbability(predictions['24h']),
  };
}

function formatLogLoss(value: number): string {
  const formatted = value.toFixed(3);
  if (value <= LOG_LOSS_GOOD) {
    return chalk.green(formatted);
  }
  if (value <= LOG_LOSS_OK) {
    return chalk.yellow(formatted);
  }
  return chalk.red(formatted);
}

/**
 * Format round score with baseline comparison
 * Shows LL per horizon with vs baseline (trivialBest)
 * @param roundScore - Phase 0 round score
 * @param baselines - Baseline log loss values per horizon
 * @returns Formatted string with baseline comparisons
 */
function formatRoundScoreWithBaseline(
  roundScore: Phase0RoundScore,
  baselines: Record<TimeframeId, BaselineLogLoss>
): string {
  const ll = roundScore.logLossByHorizon;
  const parts: string[] = [];

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const modelLL = ll[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const baseline = baselines[horizon];
    const baseLL = baseline.trivialBest;

    const formatted = formatLogLoss(modelLL);
    const baseFormatted = baseLL.toFixed(2);
    parts.push(`${horizon}:${formatted} vs ${baseFormatted}`);
  }

  return `LL[${parts.join(' ')}]`;
}

// Quick mode constants - minimal for fast pipeline verification
const QUICK_ROUNDS_PER_PHASE = 1;
const QUICK_MODEL_COUNT = 5;

// Concurrency limit for parallel LLM calls (avoid rate limiting)
const MAX_CONCURRENT_LLM_CALLS = 10;
const QUICK_MODE_DATA_VERIFIED_MSG = 'Data collection verified - rounds completed successfully';

/**
 * Smoke test pipeline status tracking
 */
interface SmokeTestStatus {
  /** Models that successfully parsed predictions */
  successfulPredictions: number;
  /** Total model prediction attempts */
  totalPredictionAttempts: number;
  /** Ground truth resolved for all horizons */
  groundTruthResolved: boolean;
  /** Scoring (log loss and brier) computed successfully */
  scoringComputed: boolean;
  /** Number of pivot hits detected */
  pivotHits: number;
  /** Issues that would cause disqualification in full run */
  wouldDisqualify: Map<string, string[]>;
}

/**
 * Create initial smoke test status for tracking pipeline correctness
 * @returns Initial smoke test status object
 */
function createSmokeTestStatus(): SmokeTestStatus {
  return {
    successfulPredictions: 0,
    totalPredictionAttempts: 0,
    groundTruthResolved: false,
    scoringComputed: false,
    pivotHits: 0,
    wouldDisqualify: new Map(),
  };
}

/**
 * Tracks qualification metrics for debugging why models are eliminated
 */
interface QualificationAudit {
  /** Models that parsed predictions successfully */
  modelsParsedOk: number;
  /** Models that were scored successfully */
  modelsScoredOk: number;
  /** Models that had at least one pivot hit (label=true for any horizon) */
  modelsWithPivotHit: number;
  /** Model IDs that failed due to worse-than-baseline performance */
  failedWorseBaseline: string[];
  /** Model IDs that failed due to degenerate prediction patterns */
  failedDegenerate: string[];
  /** Model IDs that failed due to schema/parsing errors */
  failedSchemaErrors: string[];
  /** Model IDs that qualified after this phase */
  qualified: string[];
}

/**
 * Create an empty qualification audit
 * @returns Fresh QualificationAudit with all counters at zero
 */
function createQualificationAudit(): QualificationAudit {
  return {
    modelsParsedOk: 0,
    modelsScoredOk: 0,
    modelsWithPivotHit: 0,
    failedWorseBaseline: [],
    failedDegenerate: [],
    failedSchemaErrors: [],
    qualified: [],
  };
}

/**
 * Horizon diagnostics assessment constants
 */
const ASSESSMENT_GOOD = 'good arena candidate' as const;
const ASSESSMENT_MODERATE = 'moderate arena candidate' as const;
const ASSESSMENT_DEFER = 'elite-only arena or defer' as const;

type HorizonAssessment = typeof ASSESSMENT_GOOD | typeof ASSESSMENT_MODERATE | typeof ASSESSMENT_DEFER;

/**
 * Determine assessment based on percentage of models better than random
 * @param betterThanRandomCount - Number of models better than random
 * @param totalCount - Total number of models evaluated
 * @returns Assessment string
 */
function getHorizonAssessment(betterThanRandomCount: number, totalCount: number): HorizonAssessment {
  if (totalCount === 0) {
    return ASSESSMENT_DEFER;
  }
  const ratio = betterThanRandomCount / totalCount;
  if (ratio > 0.6) {
    return ASSESSMENT_GOOD;
  }
  if (ratio >= 0.4) {
    return ASSESSMENT_MODERATE;
  }
  return ASSESSMENT_DEFER;
}

/**
 * Collect model results for a horizon from Phase 0 scores
 * @param models - Map of model states
 * @param horizon - Horizon to collect results for
 * @returns Array of model results with mean log loss
 */
function collectHorizonResults(
  models: Map<string, ModelState>,
  horizon: TimeframeId
): { modelId: string; meanLogLoss: number }[] {
  const results: { modelId: string; meanLogLoss: number }[] = [];

  for (const state of models.values()) {
    if (state.roundScores.length === 0) {
      continue;
    }
    const aggregate = aggregatePhase0Scores(state.roundScores);
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    results.push({ modelId: state.modelId, meanLogLoss: aggregate.meanLogLoss[horizon] });
  }

  return results;
}

/**
 * Format assessment string with appropriate color
 * @param assessment - The horizon assessment
 * @returns Formatted and colored assessment string
 */
function formatAssessment(assessment: HorizonAssessment): string {
  if (assessment === ASSESSMENT_GOOD) {
    return chalk.green(`High differentiation -> ${assessment}`);
  }
  if (assessment === ASSESSMENT_MODERATE) {
    return chalk.yellow(`Mixed behavior -> ${assessment}`);
  }
  return chalk.red(`Most models worse than baseline -> ${assessment}`);
}

/**
 * Variance thresholds for log loss spread classification
 */
const VARIANCE_LOW_THRESHOLD = 0.1;
const VARIANCE_HIGH_THRESHOLD = 0.5;

/**
 * Variance classification labels
 */
const VARIANCE_LOW_SPREAD = 'low spread' as const;
const VARIANCE_MODERATE_SPREAD = 'moderate spread' as const;
const VARIANCE_HIGH_SPREAD = 'high spread' as const;

type VarianceClassification = typeof VARIANCE_LOW_SPREAD | typeof VARIANCE_MODERATE_SPREAD | typeof VARIANCE_HIGH_SPREAD;

/**
 * Compute population variance of an array of numbers
 * @param values - Array of numeric values
 * @returns Population variance (0 if empty or single value)
 */
function computeVariance(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  // Compute mean
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  const mean = sum / values.length;

  // Compute sum of squared differences
  let squaredDiffSum = 0;
  for (const value of values) {
    const diff = value - mean;
    squaredDiffSum += diff * diff;
  }

  // Population variance
  return squaredDiffSum / values.length;
}

/**
 * Classify variance into low/moderate/high spread
 * @param variance - The computed variance value
 * @returns Classification string
 */
function classifyVariance(variance: number): VarianceClassification {
  if (variance < VARIANCE_LOW_THRESHOLD) {
    return VARIANCE_LOW_SPREAD;
  }
  if (variance > VARIANCE_HIGH_THRESHOLD) {
    return VARIANCE_HIGH_SPREAD;
  }
  return VARIANCE_MODERATE_SPREAD;
}

/**
 * Format variance display with color based on classification
 * @param variance - The computed variance value
 * @returns Formatted string with variance and classification
 */
function formatVarianceDisplay(variance: number): string {
  const classification = classifyVariance(variance);
  const formattedValue = variance.toFixed(3);

  if (classification === VARIANCE_LOW_SPREAD) {
    return chalk.yellow(`${formattedValue} (${classification})`);
  }
  if (classification === VARIANCE_HIGH_SPREAD) {
    return chalk.green(`${formattedValue} (${classification})`);
  }
  return chalk.cyan(`${formattedValue} (${classification})`);
}

/**
 * Print diagnostics for a single horizon
 * @param horizon - The horizon to print diagnostics for
 * @param modelResults - Model results for this horizon
 * @param randomBaseline - Random baseline log loss for comparison
 */
function printSingleHorizonDiagnostics(
  horizon: TimeframeId,
  modelResults: { modelId: string; meanLogLoss: number }[],
  randomBaseline: number
): void {
  const betterThanRandom = modelResults.filter(m => m.meanLogLoss < randomBaseline);
  const worseThanRandom = modelResults.filter(m => m.meanLogLoss >= randomBaseline);
  const assessment = getHorizonAssessment(betterThanRandom.length, modelResults.length);

  // Calculate percentage of models better than random
  const percentage = modelResults.length > 0
    ? ((betterThanRandom.length / modelResults.length) * 100).toFixed(0)
    : '0';

  // Calculate log loss variance across all models
  const logLossValues = modelResults.map(m => m.meanLogLoss);
  const variance = computeVariance(logLossValues);

  logger.log(`${chalk.cyan(horizon)}:`);
  logger.log(`  - ${chalk.green(String(betterThanRandom.length))}/${String(modelResults.length)} models (${percentage}%) better than random`);
  if (worseThanRandom.length > 0) {
    logger.log(`  - ${chalk.red(String(worseThanRandom.length))} models consistently worse`);
  }
  logger.log(`  - Log loss variance: ${formatVarianceDisplay(variance)}`);
  logger.log(`  - ${formatAssessment(assessment)}`);
  logger.newline();
}

/**
 * Print Horizon Diagnostics summary section
 * Summarizes what the per-horizon Phase 0 results mean for arena design decisions
 *
 * @param models - Map of model states with Phase 0 scores
 * @param baselines - Baselines per horizon for comparison
 */
function printHorizonDiagnostics(
  models: Map<string, ModelState>,
  baselines: Record<TimeframeId, BaselineLogLoss>
): void {
  logger.newline();
  logger.log(chalk.bold('=== Horizon Diagnostics ==='));
  logger.newline();

  for (const horizon of HORIZONS) {
    const modelResults = collectHorizonResults(models, horizon);

    if (modelResults.length === 0) {
      logger.log(`${chalk.cyan(horizon)}:`);
      logger.log(chalk.dim('  - No models with data'));
      logger.newline();
      continue;
    }

    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const baseline = baselines[horizon];
    printSingleHorizonDiagnostics(horizon, modelResults, baseline.random);
  }
}

/**
 * Print qualification audit block for a phase
 * @param phase - Phase number (0, 1, 2)
 * @param audit - Qualification audit data
 * @param totalModels - Total models in the benchmark
 * @param roundsCompleted - Number of rounds completed in this phase
 */
function printQualificationAudit(
  phase: number,
  audit: QualificationAudit,
  totalModels: number,
  roundsCompleted: number
): void {
  logger.newline();
  logger.log(`=== Phase ${String(phase)} Qualification Audit ===`);
  logger.log(`  Parsed OK: ${String(audit.modelsParsedOk)}/${String(totalModels)}`);
  logger.log(`  Scored OK: ${String(audit.modelsScoredOk)}/${String(totalModels)}`);
  logger.log(`  Pivot hits (any horizon): ${String(audit.modelsWithPivotHit)}/${String(totalModels)}`);
  logger.log(`  Rounds completed: ${String(roundsCompleted)}`);

  // Show worse-than-baseline failures
  const worseBaselineCount = audit.failedWorseBaseline.length;
  logger.log(`  Failed - worse than baseline: ${String(worseBaselineCount)}`);
  if (worseBaselineCount > 0) {
    logger.log(`    [${audit.failedWorseBaseline.join(', ')}]`);
  }

  // Show degenerate pattern failures
  const degenerateCount = audit.failedDegenerate.length;
  logger.log(`  Failed - degenerate pattern: ${String(degenerateCount)}`);
  if (degenerateCount > 0) {
    logger.log(`    [${audit.failedDegenerate.join(', ')}]`);
  }

  // Show schema/parsing errors
  const schemaErrorCount = audit.failedSchemaErrors.length;
  logger.log(`  Failed - schema errors: ${String(schemaErrorCount)}`);
  if (schemaErrorCount > 0) {
    logger.log(`    [${audit.failedSchemaErrors.join(', ')}]`);
  }

  // Show qualified models
  const qualifiedCount = audit.qualified.length;
  logger.log(`  Qualified: ${String(qualifiedCount)}/${String(totalModels)}`);
}

/**
 * Check if model has at least one pivot hit (label=true for any horizon)
 * @param state - Model state to check
 * @returns True if model has at least one pivot hit
 */
function modelHasPivotHit(state: ModelState): boolean {
  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    if (state.labelsByHorizon[horizon].some(Boolean)) {
      return true;
    }
  }
  return false;
}

/**
 * Build qualification audit for a phase
 * @param models - Map of model states
 * @param phaseNumber - The phase number (0, 1, or 2)
 * @returns Populated qualification audit
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Audit function collects multiple metrics, complexity is acceptable
function buildQualificationAuditForPhase(
  models: Map<string, ModelState>,
  phaseNumber: number
): QualificationAudit {
  const audit = createQualificationAudit();
  for (const state of models.values()) {
    // Track parsed/scored OK (models with round scores)
    if (state.roundScores.length > 0) {
      audit.modelsParsedOk++;
      audit.modelsScoredOk++;
    }
    // Track schema errors (models with failed rounds)
    if (state.failedRounds.length > 0) {
      audit.failedSchemaErrors.push(state.modelId);
    }
    // Track pivot hits
    if (modelHasPivotHit(state)) {
      audit.modelsWithPivotHit++;
    }
    // Categorize elimination reasons
    if (state.eliminated && state.eliminatedInPhase === phaseNumber) {
      audit.failedWorseBaseline.push(state.modelId);
    } else if (!state.eliminated) {
      audit.qualified.push(state.modelId);
    }
  }
  return audit;
}

/**
 * Shuffle array using Fisher-Yates algorithm
 * @param array - Array to shuffle
 * @returns Shuffled copy of the array
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    // eslint-disable-next-line security/detect-object-injection -- bounded integers
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex] as T, shuffled[index] as T];
  }
  return shuffled;
}

// Bitcoin-only benchmark
const SYMBOL_ID = 'COINBASE_SPOT_BTC_USD';

// Phase round counts
const PHASE_0_ROUNDS = 4;
const PHASE_1_ROUNDS = 4;
const PHASE_2_ROUNDS = 4;

/**
 * Get round counts for each phase based on quick mode
 * @returns Object with round counts for each phase
 */
function getPhaseRoundCounts(): { phase0: number; phase1: number; phase2: number } {
  if (isQuickMode) {
    return { phase0: QUICK_ROUNDS_PER_PHASE, phase1: QUICK_ROUNDS_PER_PHASE, phase2: QUICK_ROUNDS_PER_PHASE };
  }
  return { phase0: PHASE_0_ROUNDS, phase1: PHASE_1_ROUNDS, phase2: PHASE_2_ROUNDS };
}

type Phase = 0 | 1 | 2 | 3;

/**
 * Model state for tracking across phases
 */
interface ModelState {
  modelId: string;
  eliminated: boolean;
  eliminatedInPhase?: number;
  eliminationReason?: string;
  roundScores: Phase0RoundScore[];
  /** Full round data for Track B timing metrics (includes labels and timeToPivotRatio) */
  trackBRounds: RoundScore[];
  logLossByHorizon: Record<TimeframeId, number[]>;
  timeToPivotRatios: Record<TimeframeId, number[]>;
  /** Accumulated labels per horizon for baseline computation */
  labelsByHorizon: Record<TimeframeId, boolean[]>;
  failedRounds: number[];
  // Per-horizon qualification tracking
  qualifiedHorizons: Set<TimeframeId>;
  disqualifiedHorizons: Map<TimeframeId, { phase: Phase; reason: string }>;
}

/**
 * Create initial model state for tracking
 * @param modelId - The model identifier
 * @returns Initial model state object
 */
function createModelState(modelId: string): ModelState {
  return {
    modelId,
    eliminated: false,
    roundScores: [],
    trackBRounds: [],
    logLossByHorizon: { '15m': [], '1h': [], '4h': [], '24h': [] },
    timeToPivotRatios: { '15m': [], '1h': [], '4h': [], '24h': [] },
    labelsByHorizon: { '15m': [], '1h': [], '4h': [], '24h': [] },
    failedRounds: [],
    qualifiedHorizons: new Set<TimeframeId>(['15m', '1h', '4h', '24h']),
    disqualifiedHorizons: new Map(),
  };
}

/**
 * Run a single model round and return the output
 * @param modelId - The model identifier to run
 * @param since - Only load message history from this time onwards (isolates benchmark runs)
 * @returns Bottom caller output with predictions
 */
async function runModelRound(modelId: string, since?: Date): Promise<BottomCallerOutput> {
  const bottomCaller = createBottomCaller(modelId);
  const options: { modelId: string; since?: Date } = { modelId };
  if (since !== undefined) {
    options.since = since;
  }
  const result = await runRound(bottomCaller, options);
  return result.output;
}

/**
 * Record scores for a model after a successful round
 * @param state - Model state to update
 * @param roundScore - Score from this round
 * @param labels - Ground truth labels for this round
 * @param timeToPivotRatios - Time-to-pivot ratios for each horizon
 * @param firstPivotAts - First pivot timestamps for each horizon
 * @param roundNumber - Current round number for Track B tracking
 */
function recordModelScore(
  state: ModelState,
  roundScore: Phase0RoundScore,
  labels: Record<TimeframeId, boolean>,
  timeToPivotRatios: Record<TimeframeId, number | undefined>,
  firstPivotAts: Record<TimeframeId, Date | undefined>,
  roundNumber: number
): void {
  state.roundScores.push(roundScore);

  // Also store full round data for Track B timing metrics
  const logLoss = (roundScore.logLossByHorizon['15m'] +
    roundScore.logLossByHorizon['1h'] +
    roundScore.logLossByHorizon['4h'] +
    roundScore.logLossByHorizon['24h']) / 4;

  state.trackBRounds.push({
    roundNumber,
    logLoss,
    logLossByHorizon: roundScore.logLossByHorizon,
    predictions: roundScore.predictions,
    labels,
    timeToPivotRatio: timeToPivotRatios,
    firstPivotAt: firstPivotAts,
  });

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    state.logLossByHorizon[horizon].push(roundScore.logLossByHorizon[horizon]);

    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const ratio = timeToPivotRatios[horizon];
    if (ratio !== undefined) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      state.timeToPivotRatios[horizon].push(ratio);
    }

    // Track labels for baseline computation
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    state.labelsByHorizon[horizon].push(labels[horizon]);
  }
}

/**
 * Resolve ground truth for all horizons using dual pivot methods
 * @param symbolId - Trading symbol identifier
 * @param predictionTime - Time of prediction
 * @returns Labels, time-to-pivot ratios, and first pivot timestamps for all horizons (using primary method)
 */
async function resolveAllHorizonsGroundTruth(
  symbolId: string,
  predictionTime: Date
): Promise<{
  labels: Record<TimeframeId, boolean>;
  timeToPivotRatios: Record<TimeframeId, number | undefined>;
  firstPivotAts: Record<TimeframeId, Date | undefined>;
  // Secondary labels for analysis (not used for scoring)
  secondaryLabels: Record<TimeframeId, boolean>;
}> {
  const labels: Record<string, boolean> = {};
  const ratios: Record<string, number | undefined> = {};
  const firstPivots: Record<string, Date | undefined> = {};
  const secondaryLabels: Record<string, boolean> = {};

  // Resolve each horizon using dual ground truth in parallel
  const results = await Promise.all(
    HORIZONS.map(async (horizon) => {
      const dualResult = await resolveDualGroundTruth(symbolId, horizon, predictionTime);
      return { horizon, dualResult };
    })
  );

  for (const { horizon, dualResult } of results) {
    // Primary method for scoring/elimination
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    labels[horizon] = dualResult.primary.hasStructuralBottom;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    ratios[horizon] = dualResult.primary.timeToPivotRatio;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    firstPivots[horizon] = dualResult.primary.firstPivotAt;
    // Secondary for analysis
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    secondaryLabels[horizon] = dualResult.secondary.hasStructuralBottom;
  }

  return {
    labels: labels as Record<TimeframeId, boolean>,
    timeToPivotRatios: ratios as Record<TimeframeId, number | undefined>,
    firstPivotAts: firstPivots as Record<TimeframeId, Date | undefined>,
    secondaryLabels: secondaryLabels as Record<TimeframeId, boolean>,
  };
}

/**
 * Compute mean log loss for a model across all horizons
 * @param state - Model state with log loss data
 * @returns Mean log loss by horizon
 */
function computeMeanLogLoss(state: ModelState): Record<TimeframeId, number> {
  const meanLogLoss: Record<string, number> = {};
  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const losses = state.logLossByHorizon[horizon];
    let sum = 0;
    for (const loss of losses) {
      sum += loss;
    }
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    meanLogLoss[horizon] = sum / losses.length;
  }
  return meanLogLoss as Record<TimeframeId, number>;
}

/**
 * Disqualify a model from a horizon
 * @param state - Model state to update
 * @param horizon - Horizon to disqualify from
 * @param phase - Phase in which disqualification occurred
 * @param reason - Reason for disqualification
 */
function disqualifyFromHorizon(
  state: ModelState,
  horizon: TimeframeId,
  phase: Phase,
  reason: string
): void {
  state.qualifiedHorizons.delete(horizon);
  state.disqualifiedHorizons.set(horizon, { phase, reason });
}

/**
 * Compute baselines for all horizons from model states
 * All models see the same labels, so we just take labels from any non-eliminated model
 * @param models - Map of model states
 * @returns Baselines per horizon
 */
function computeBaselinesFromModels(models: Map<string, ModelState>): Record<TimeframeId, BaselineLogLoss> {
  // Find labels from any non-eliminated model (they all see the same labels)
  let sampleLabels: Record<TimeframeId, boolean[]> = { '15m': [], '1h': [], '4h': [], '24h': [] };
  for (const state of models.values()) {
    if (!state.eliminated && state.labelsByHorizon['15m'].length > 0) {
      sampleLabels = state.labelsByHorizon;
      break;
    }
  }

  return {
    '15m': computeBaselineLogLoss(sampleLabels['15m']),
    '1h': computeBaselineLogLoss(sampleLabels['1h']),
    '4h': computeBaselineLogLoss(sampleLabels['4h']),
    '24h': computeBaselineLogLoss(sampleLabels['24h']),
  };
}

/**
 * Print baseline comparison summary for all horizons
 * Shows per-horizon baselines and label distributions
 * @param baselines - Baselines per horizon
 * @param sampleLabels - Sample labels to show distribution
 */
function printBaselineComparisonSummary(
  baselines: Record<TimeframeId, BaselineLogLoss>,
  sampleLabels: Record<TimeframeId, boolean[]>
): void {
  logger.newline();
  logger.log('=== Baseline Comparisons ===');

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const baseline = baselines[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const labels = sampleLabels[horizon];
    const trueCount = labels.filter(Boolean).length;
    const falseCount = labels.length - trueCount;

    logger.log(`  ${horizon}: Random=${baseline.random.toFixed(3)}, ` +
      `Always-false=${baseline.alwaysFalse.toFixed(3)} (${String(falseCount)}/${String(labels.length)} labels false), ` +
      `Always-true=${baseline.alwaysTrue.toFixed(3)} (${String(trueCount)}/${String(labels.length)} labels true), ` +
      `TrivialBest=${baseline.trivialBest.toFixed(3)}`
    );
  }
}

/**
 * Run Phase 0 elimination - sanity filter with per-horizon disqualification using baselines
 * In quick mode (smoke test), flags issues without eliminating
 * @param models - Map of model states
 * @param smokeTestStatus - Optional smoke test status to update (only in quick mode)
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Phase elimination logic with baseline comparison is inherently complex
function runPhase0(models: Map<string, ModelState>, smokeTestStatus?: SmokeTestStatus): void {
  logger.newline();

  if (isQuickMode) {
    logger.log('=== Phase 0: Schema Validation (Smoke Test Mode) ===');
    logger.log(chalk.yellow('  Note: Flagging issues without disqualification'));
  } else {
    logger.log('=== Phase 0: Sanity Filter (Per-Horizon Disqualification) ===');
  }

  // Compute baselines from observed labels
  const baselines = computeBaselinesFromModels(models);

  // Print baseline comparison summary
  let sampleLabels: Record<TimeframeId, boolean[]> = { '15m': [], '1h': [], '4h': [], '24h': [] };
  for (const state of models.values()) {
    if (!state.eliminated && state.labelsByHorizon['15m'].length > 0) {
      sampleLabels = state.labelsByHorizon;
      break;
    }
  }
  printBaselineComparisonSummary(baselines, sampleLabels);
  logger.newline();

  let eliminated = 0;
  for (const state of models.values()) {
    if (state.eliminated) {
      continue;
    }

    const aggregate = aggregatePhase0Scores(state.roundScores);
    const disqualifiedHorizons = getPhase0DisqualifiedHorizonsWithBaselines(aggregate, baselines);

    if (isQuickMode) {
      // Smoke test mode: flag issues without eliminating
      if (disqualifiedHorizons.size > 0) {
        const issues = [...disqualifiedHorizons].map(h => `worse-than-baseline on ${h}`);
        smokeTestStatus?.wouldDisqualify.set(state.modelId, issues);
        logger.log(`  ${chalk.cyan(state.modelId)}: ${chalk.yellow('would be disqualified')} from [${[...disqualifiedHorizons].join(', ')}] in full run`);
      } else {
        logger.log(`  ${chalk.cyan(state.modelId)}: ${chalk.green('passed')} schema validation`);
      }
    } else {
      // Full run: apply elimination logic
      // Disqualify from specific horizons
      for (const horizon of disqualifiedHorizons) {
        disqualifyFromHorizon(
          state,
          horizon,
          0 as Phase,
          `Phase 0: Failed sanity check on ${horizon}`
        );
      }

      // Only fully eliminate if disqualified from ALL horizons (all 4)
      if (disqualifiedHorizons.size === 4) {
        state.eliminated = true;
        state.eliminatedInPhase = 0;
        state.eliminationReason = 'Failed sanity check on all horizons';
        eliminated++;
        logger.log(`  ${chalk.cyan(state.modelId)}: disqualified from [${[...disqualifiedHorizons].join(', ')}] -> ${chalk.red('ELIMINATED')} (all horizons)`);
      } else if (disqualifiedHorizons.size > 0) {
        const qualifiedList = [...state.qualifiedHorizons].join(', ');
        logger.log(`  ${chalk.cyan(state.modelId)}: disqualified from [${[...disqualifiedHorizons].join(', ')}] -> qualified for [${chalk.green(qualifiedList)}]`);
      } else {
        logger.log(`  ${chalk.cyan(state.modelId)}: passed sanity check -> qualified for [${chalk.green([...state.qualifiedHorizons].join(', '))}]`);
      }
    }
  }

  if (isQuickMode) {
    logger.log('Phase 0 complete (smoke test: no eliminations applied)');
  } else {
    const remaining = [...models.values()].filter((model) => !model.eliminated).length;
    logger.log(`Phase 0 complete: ${String(eliminated)} fully eliminated, ${String(remaining)} remaining`);
  }

  // Build and print qualification audit for Phase 0
  const phase0Audit = buildQualificationAuditForPhase(models, 0);
  const phase0Rounds = sampleLabels['15m'].length;
  printQualificationAudit(0, phase0Audit, models.size, phase0Rounds);

  // Print Horizon Diagnostics summary (interpretation layer for arena design decisions)
  printHorizonDiagnostics(models, baselines);
}

/**
 * Run Phase 1 elimination - relative performance with per-horizon qualification
 * In quick mode (smoke test), skips elimination entirely (insufficient data)
 * @param models - Map of model states
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Phase elimination logic is inherently complex
function runPhase1(models: Map<string, ModelState>): void {
  logger.newline();

  if (isQuickMode) {
    logger.log('=== Phase 1: Skipped (Smoke Test Mode) ===');
    logger.log(chalk.yellow('  Skipping Phase 1 percentile elimination in quick mode (insufficient data for selection)'));
    logger.log(chalk.yellow(`  ${QUICK_MODE_DATA_VERIFIED_MSG}`));
    return;
  }

  logger.log('=== Phase 1: Relative Performance (Per-Horizon Qualification) ===');

  // Build scores for active models
  const activeModels: Phase1ModelScore[] = [];
  for (const state of models.values()) {
    if (state.eliminated) {
      continue;
    }
    activeModels.push({
      modelId: state.modelId,
      meanLogLoss: computeMeanLogLoss(state),
    });
  }

  // Compute percentile ranks
  const percentileRanks = computePercentileRanks(activeModels);

  let eliminated = 0;
  for (const state of models.values()) {
    if (state.eliminated) {
      continue;
    }

    const percentiles = percentileRanks.get(state.modelId);
    if (percentiles === undefined) {
      continue;
    }

    // Get qualified horizons for this model
    const qualifiedHorizons = getQualifiedHorizons(percentiles);

    // Disqualify from horizons the model didn't qualify for
    for (const horizon of HORIZONS) {
      if (!qualifiedHorizons.has(horizon)) {
        disqualifyFromHorizon(state, horizon, 1, 'bottom 30% percentile');
      }
    }

    // Log percentiles and qualification status
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const percentileString = HORIZONS.map(h => `${h}:${percentiles[h].toFixed(0)}%`).join(' ');
    const qualified = [...qualifiedHorizons];

    // Fully eliminate if no horizons qualify
    if (hasNoQualifiedHorizons(qualifiedHorizons)) {
      state.eliminated = true;
      state.eliminatedInPhase = 1;
      state.eliminationReason = 'qualifies for 0 horizons';
      eliminated++;
      logger.log(`  ${chalk.cyan(state.modelId)}: [${percentileString}] → ${chalk.red('ELIMINATED')} (qualifies for 0 horizons)`);
    } else {
      logger.log(`  ${chalk.cyan(state.modelId)}: [${percentileString}] → qualified for [${chalk.green(qualified.join(', '))}]`);
    }
  }

  const remaining = [...models.values()].filter((model) => !model.eliminated).length;
  logger.log(`Phase 1 complete: ${String(eliminated)} fully eliminated, ${String(remaining)} remaining`);

  // Build and print qualification audit for Phase 1
  const phase1Audit = buildQualificationAuditForPhase(models, 1);
  const phase1SampleState = [...models.values()].find(s => s.roundScores.length > 0);
  const phase1Rounds = phase1SampleState?.roundScores.length ?? 0;
  printQualificationAudit(1, phase1Audit, models.size, phase1Rounds);
}

/**
 * Compute stability metrics for a single model
 * @param state - Model state with log loss data
 * @returns Stability metrics by horizon
 */
function computeModelStabilityMetrics(state: ModelState): {
  stabilityByHorizon: Record<TimeframeId, number>;
  worstWindowByHorizon: Record<TimeframeId, number>;
  bestWindowByHorizon: Record<TimeframeId, number>;
} {
  const stabilityByHorizon: Record<string, number> = {};
  const worstWindowByHorizon: Record<string, number> = {};
  const bestWindowByHorizon: Record<string, number> = {};

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const losses = state.logLossByHorizon[horizon];
    const metrics = computeStabilityMetrics(losses);
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    stabilityByHorizon[horizon] = metrics.variance;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    worstWindowByHorizon[horizon] = metrics.worstWindow;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    bestWindowByHorizon[horizon] = metrics.bestWindow;
  }

  return {
    stabilityByHorizon: stabilityByHorizon as Record<TimeframeId, number>,
    worstWindowByHorizon: worstWindowByHorizon as Record<TimeframeId, number>,
    bestWindowByHorizon: bestWindowByHorizon as Record<TimeframeId, number>,
  };
}

/**
 * Collect stability metrics from active models
 * @param models - Map of model states
 * @returns Tuple of model scores and collected metrics
 */
function collectPhase2Metrics(
  models: Map<string, ModelState>
): {
  modelScores: Phase2ModelScore[];
  allWorstWindows: Record<TimeframeId, number[]>;
  allStabilities: Record<TimeframeId, number[]>;
} {
  const modelScores: Phase2ModelScore[] = [];
  const allWorstWindows: Record<TimeframeId, number[]> = { '15m': [], '1h': [], '4h': [], '24h': [] };
  const allStabilities: Record<TimeframeId, number[]> = { '15m': [], '1h': [], '4h': [], '24h': [] };

  for (const state of models.values()) {
    if (state.eliminated) {
      continue;
    }

    const metrics = computeModelStabilityMetrics(state);

    for (const horizon of HORIZONS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      allWorstWindows[horizon].push(metrics.worstWindowByHorizon[horizon]);
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      allStabilities[horizon].push(metrics.stabilityByHorizon[horizon]);
    }

    modelScores.push({
      modelId: state.modelId,
      regretByHorizon: {} as Record<TimeframeId, number>,
      stabilityByHorizon: metrics.stabilityByHorizon,
      bestWindowByHorizon: metrics.bestWindowByHorizon,
      worstWindowByHorizon: metrics.worstWindowByHorizon,
    });
  }

  return { modelScores, allWorstWindows, allStabilities };
}

/**
 * Compute regret values for all model scores
 * @param modelScores - Array of model scores to update
 * @param medianWorstWindows - Median worst windows by horizon
 */
function computeAllRegrets(
  modelScores: Phase2ModelScore[],
  medianWorstWindows: Record<TimeframeId, number>
): void {
  for (const score of modelScores) {
    for (const horizon of HORIZONS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      const worstWindow = score.worstWindowByHorizon?.[horizon] ?? 0;
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      score.regretByHorizon[horizon] = computeRegret(worstWindow, medianWorstWindows[horizon]);
    }
  }
}

/**
 * Run Phase 2 elimination - stability and regret with per-horizon disqualification
 * In quick mode (smoke test), skips elimination entirely (insufficient data)
 * @param models - Map of model states
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Phase elimination logic is inherently complex
function runPhase2(models: Map<string, ModelState>): void {
  logger.newline();

  if (isQuickMode) {
    logger.log('=== Phase 2: Skipped (Smoke Test Mode) ===');
    logger.log(chalk.yellow('  Skipping Phase 2 stability elimination in quick mode (insufficient data for selection)'));
    logger.log(chalk.yellow(`  ${QUICK_MODE_DATA_VERIFIED_MSG}`));
    return;
  }

  logger.log('=== Phase 2: Stability & Regret (Per-Horizon Disqualification) ===');

  const { modelScores, allWorstWindows, allStabilities } = collectPhase2Metrics(models);

  // Compute median values
  const medianWorstWindows: Record<TimeframeId, number> = {
    '15m': median(allWorstWindows['15m']),
    '1h': median(allWorstWindows['1h']),
    '4h': median(allWorstWindows['4h']),
    '24h': median(allWorstWindows['24h']),
  };
  const medianStabilities: Record<TimeframeId, number> = {
    '15m': median(allStabilities['15m']),
    '1h': median(allStabilities['1h']),
    '4h': median(allStabilities['4h']),
    '24h': median(allStabilities['24h']),
  };

  computeAllRegrets(modelScores, medianWorstWindows);

  // Disqualify models per horizon
  let eliminated = 0;
  for (const score of modelScores) {
    const state = models.get(score.modelId);
    if (state === undefined || state.eliminated) {
      continue;
    }

    // Get horizons to disqualify for this model
    const horizonsToDisqualify = getHorizonsToDisqualify(score, medianStabilities);

    // Disqualify from each failing horizon
    for (const horizon of horizonsToDisqualify) {
      // Only disqualify if still qualified
      if (state.qualifiedHorizons.has(horizon)) {
        disqualifyFromHorizon(state, horizon, 2, 'high regret or instability');
      }
    }

    // Log regret/stability values and qualification status
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const regretString = HORIZONS.map(h => `${h}:${score.regretByHorizon[h].toFixed(2)}`).join(' ');
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const stabilityString = HORIZONS.map(h => `${h}:${score.stabilityByHorizon[h].toFixed(3)}`).join(' ');

    // Fully eliminate if no horizons remain
    if (state.qualifiedHorizons.size === 0) {
      state.eliminated = true;
      state.eliminatedInPhase = 2;
      state.eliminationReason = 'no qualified horizons remaining';
      eliminated++;
      logger.log(`  ${chalk.cyan(state.modelId)}: regret[${regretString}] stability[${stabilityString}] → ${chalk.red('ELIMINATED')}`);
    } else {
      const qualifiedList = [...state.qualifiedHorizons].join(', ');
      logger.log(`  ${chalk.cyan(state.modelId)}: regret[${regretString}] stability[${stabilityString}] → qualified for [${chalk.green(qualifiedList)}]`);
    }
  }

  const remaining = [...models.values()].filter((model) => !model.eliminated).length;
  logger.log(`Phase 2 complete: ${String(eliminated)} fully eliminated, ${String(remaining)} remaining`);

  // Build and print qualification audit for Phase 2
  const phase2Audit = buildQualificationAuditForPhase(models, 2);
  const phase2SampleState = [...models.values()].find(s => s.roundScores.length > 0);
  const phase2Rounds = phase2SampleState?.roundScores.length ?? 0;
  printQualificationAudit(2, phase2Audit, models.size, phase2Rounds);
}


// Note: extractHorizonPredictionsAndLabels and calculateBrierScores
// are now imported from './reports/leaderboard-data.js'

/**
 * Print a summary of which horizons each model is qualified for
 * @param models - Map of model states
 */
function printHorizonQualificationSummary(models: Map<string, ModelState>): void {
  logger.newline();
  logger.log('=== Per-Model Horizon Qualification ===');

  for (const state of models.values()) {
    if (state.eliminated) {
      continue;
    }

    const horizonStatus = HORIZONS.map(h => {
      const qualified = state.qualifiedHorizons.has(h);
      return qualified ? chalk.green(`\u2713${h}`) : chalk.red(`\u2717${h}`);
    }).join(' ');

    logger.log(`  ${chalk.cyan(state.modelId)}: ${horizonStatus}`);
  }
}

// Note: ModelScoreDataWithQualification, countQualifiedModels, toBaseScoreData,
// and buildLeaderboardScoreData are now imported from './reports/leaderboard-data.js'

/**
 * Print leaderboards for each horizon
 * Shows all models with data regardless of qualification status
 * @param modelStates - Map of model states
 */
function printHorizonLeaderboards(modelStates: Map<string, ModelState>): void {
  logger.newline();
  logger.log('=== Per-Horizon Leaderboards (Fractal Track) ===');
  const scoreData = buildLeaderboardScoreData(modelStates);
  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const horizonScores = scoreData[horizon];
    if (horizonScores.size === 0) {
      logger.newline();
      logger.log(chalk.yellow(`  ${horizon}: No models have data for this horizon`));
      continue;
    }
    const qualifiedCount = countQualifiedModels(horizonScores);
    const baseScoreData = toBaseScoreData(horizonScores);
    const leaderboard = generateLeaderboard(horizon, 'fractal', baseScoreData);
    logger.newline();
    if (qualifiedCount === 0) {
      logger.log(chalk.yellow(`Note: No models qualified for ${horizon} per Phase 0-2 criteria. Showing raw data.`));
    }
    logger.log(formatLeaderboardTable(leaderboard));
  }
}

/**
 * Build round data with scores from model track B rounds for profile generation
 * Includes ALL horizons regardless of qualification status
 * @param trackBRounds - Array of track B round scores
 * @returns Array of round data formatted for buildModelProfile
 */
function buildRoundDataForProfile(
  trackBRounds: RoundScore[]
): {
  predictions: Record<TimeframeId, number>;
  labels: Record<TimeframeId, boolean>;
  logLosses: Record<TimeframeId, number>;
  briers: Record<TimeframeId, number>;
}[] {
  return trackBRounds
    .filter((round) =>
      round.predictions !== undefined &&
      round.labels !== undefined &&
      round.logLossByHorizon !== undefined
    )
    .map((round) => {
      const predictions: Record<string, number> = {};
      const labels: Record<string, boolean> = {};
      const logLosses: Record<string, number> = {};
      const briers: Record<string, number> = {};

      // Only include data for qualified horizons
      // Include data for ALL horizons
      for (const horizon of HORIZONS) {
        // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
        const pred = round.predictions?.[horizon] ?? 0.5;
        // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
        const label = round.labels?.[horizon] ?? false;
        // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
        const ll = round.logLossByHorizon?.[horizon] ?? 0;

        // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
        predictions[horizon] = pred;
        // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
        labels[horizon] = label;
        // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
        logLosses[horizon] = ll;
        // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
        briers[horizon] = brierScore(pred, label);
      }

      return {
        predictions: predictions as Record<TimeframeId, number>,
        labels: labels as Record<TimeframeId, boolean>,
        logLosses: logLosses as Record<TimeframeId, number>,
        briers: briers as Record<TimeframeId, number>,
      };
    });
}

/**
 * Print model quality profiles and separability analysis
 * Includes ALL non-eliminated models with data regardless of qualification status
 * @param modelStates - Map of model states
 */
function printModelProfilesAndSeparability(modelStates: Map<string, ModelState>): void {
  // Build profiles for non-eliminated models with round data
  // Only include data for horizons the model is qualified for
  const profiles = [...modelStates.values()]
    .filter((state) => !state.eliminated && state.trackBRounds.length > 0)
    .map((state) => {
      const roundData = buildRoundDataForProfile(state.trackBRounds);
      return buildModelProfile(state.modelId, roundData);
    });

  if (profiles.length === 0) {
    logger.log('  No models with data to generate profiles');
    return;
  }

  // Print Model Quality Profiles
  logger.newline();
  logger.log('=== Model Quality Profiles ===');
  // Count how many models have qualified horizons
  const qualifiedCount = [...modelStates.values()]
    .filter((state) => !state.eliminated && state.qualifiedHorizons.size > 0).length;
  if (qualifiedCount === 0) {
    logger.log(chalk.yellow('Note: No models passed Phase 0-2 qualification. Showing raw data for debugging.'));
  }
  logger.newline();
  logger.log(formatProfileTable(profiles));

  // Run separability analysis and print
  const separabilityData = profiles.map((p) => ({
    modelId: p.modelId,
    meanLogLoss: p.meanLogLoss,
    meanBrier: p.meanBrier,
    expectedCalibrationError: p.expectedCalibrationError,
    tpRate: p.tpRate,
    fpRate: p.fpRate,
  }));

  const separabilityAnalysis = analyzeMetricSeparability(separabilityData);

  logger.newline();
  logger.log('=== Metric Separability Analysis ===');
  logger.newline();
  // Pass cohort size for display in insufficient data messages
  logger.log(formatSeparabilityTable(separabilityAnalysis, separabilityData.length));
}

/**
 * Build horizon metrics for a model
 * @param state - Model state
 * @returns Horizon metrics for each horizon
 */
function buildHorizonMetrics(
  state: ModelState
): Record<TimeframeId, { logLoss: number; bestWindow: number; stability: number }> {
  const horizonMetrics: Record<string, { logLoss: number; bestWindow: number; stability: number }> = {};

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const losses = state.logLossByHorizon[horizon];
    const metrics = computeStabilityMetrics(losses);

    // Compute mean log loss for this horizon
    let sum = 0;
    for (const loss of losses) {
      sum += loss;
    }
    const meanLogLoss = losses.length > 0 ? sum / losses.length : 0;

    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    horizonMetrics[horizon] = {
      logLoss: meanLogLoss,
      bestWindow: metrics.bestWindow,
      stability: metrics.variance,
    };
  }

  return horizonMetrics as Record<TimeframeId, { logLoss: number; bestWindow: number; stability: number }>;
}

/**
 * Run Phase 3 ranking - final selection with per-horizon rankings
 * @param models - Map of model states
 * @returns Per-horizon rankings
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Phase elimination logic is inherently complex
function runPhase3(models: Map<string, ModelState>): PerHorizonRankings {
  logger.newline();
  logger.log('=== Phase 3: Final Ranking (Per-Horizon) ===');

  // Build model metrics for ranking
  const modelsWithHorizonMetrics: ModelWithHorizonMetrics[] = [];

  // Need percentile ranks from surviving models
  const activeModels: Phase1ModelScore[] = [];
  for (const state of models.values()) {
    if (state.eliminated) {
      continue;
    }
    activeModels.push({
      modelId: state.modelId,
      meanLogLoss: computeMeanLogLoss(state),
    });
  }

  const percentileRanks = computePercentileRanks(activeModels);

  for (const state of models.values()) {
    if (state.eliminated) {
      continue;
    }

    const percentiles = percentileRanks.get(state.modelId);
    if (percentiles === undefined) {
      continue;
    }

    // Build horizon metrics for this model
    const horizonMetrics = buildHorizonMetrics(state);

    // Compute avg percentile rank for Phase3ModelMetrics
    let percentileSum = 0;
    for (const horizon of HORIZONS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      percentileSum += percentiles[horizon];
    }
    const avgPercentileRank = percentileSum / HORIZONS.length;

    // Compute avg metrics
    let totalBestWindow = 0;
    let totalStability = 0;
    let totalTimeToPivotRatio = 0;
    let timeToPivotCount = 0;

    for (const horizon of HORIZONS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      totalBestWindow += horizonMetrics[horizon].bestWindow;
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      totalStability += horizonMetrics[horizon].stability;

      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      const ratios = state.timeToPivotRatios[horizon];
      for (const ratio of ratios) {
        totalTimeToPivotRatio += ratio;
        timeToPivotCount++;
      }
    }

    modelsWithHorizonMetrics.push({
      modelId: state.modelId,
      metrics: {
        avgPercentileRank,
        avgBestWindow: totalBestWindow / HORIZONS.length,
        avgStability: totalStability / HORIZONS.length,
        avgTimeToPivotRatio: timeToPivotCount > 0 ? totalTimeToPivotRatio / timeToPivotCount : 0.5,
      },
      horizonMetrics,
      qualifiedHorizons: state.qualifiedHorizons,
    });
  }

  // Rank per horizon
  const perHorizonRankings = rankModelsPerHorizon(modelsWithHorizonMetrics);

  // Print per-horizon arena tables
  printPerHorizonArenaTable(perHorizonRankings);

  // Print final summary table with all models
  logger.newline();
  const allModels = [...models.values()];
  printFinalSummaryTable(allModels, computeMeanLogLoss);

  // Print per-horizon leaderboards
  printHorizonLeaderboards(models);

  // Print model quality profiles and separability analysis
  printModelProfilesAndSeparability(models);

  return perHorizonRankings;
}

/**
 * Update label counts for base rate calculation
 * @param labelCounts - Label counts to update
 * @param labels - Ground truth labels for this round
 */
function updateLabelCounts(
  labelCounts: Record<TimeframeId, { total: number; positive: number }>,
  labels: Record<TimeframeId, boolean>
): void {
  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    labelCounts[horizon].total++;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    if (labels[horizon]) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      labelCounts[horizon].positive++;
    }
  }
}

/**
 * Write audit records for all horizons for a single model prediction
 * @param params - Parameters for writing audit records
 * @param params.currentTime - Current prediction time
 * @param params.roundNumber - Current round number
 * @param params.modelId - Model identifier
 * @param params.predictions - Model predictions by horizon
 * @param params.labels - Ground truth labels by horizon
 * @param params.firstPivotAts - First pivot times by horizon
 * @param params.timeToPivotRatios - Time to pivot ratios by horizon
 * @param params.labelCounts - Label counts for base rate calculation
 */
function writeModelAuditRecords(params: {
  currentTime: Date;
  roundNumber: number;
  modelId: string;
  predictions: BottomPredictions;
  labels: Record<TimeframeId, boolean>;
  firstPivotAts: Record<TimeframeId, Date | undefined>;
  timeToPivotRatios: Record<TimeframeId, number | undefined>;
  labelCounts: Record<TimeframeId, { total: number; positive: number }>;
}): void {
  const { currentTime, roundNumber, modelId, predictions, labels, firstPivotAts, timeToPivotRatios, labelCounts } = params;
  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const counts = labelCounts[horizon];
    const labelBaseRate = counts.total > 0 ? counts.positive / counts.total : 0.5;

    const auditRecord = buildAuditRecord({
      timestamp: currentTime,
      roundNumber,
      modelId,
      horizon,
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      prediction: predictions[horizon],
      groundTruth: {
        // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
        label: labels[horizon],
        // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
        firstPivotAt: firstPivotAts[horizon],
        // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
        timeToPivotRatio: timeToPivotRatios[horizon],
      },
      labelBaseRate,
    });
    writeAuditRecord(auditRecord);
  }
}

/**
 * Run a single benchmark round for all active models
 * @param models - Map of model states
 * @param roundNumber - Current round number
 * @param totalRounds - Total rounds in benchmark
 * @param symbolId - Trading symbol
 * @param currentTime - Current prediction time
 * @param currentPhase - Current phase number for persistence
 * @param benchmarkStartTime - Real wall-clock time when benchmark started (for session isolation)
 * @param labelCounts - Label counts for trivial baseline calculation
 */
async function runBenchmarkRound(
  models: Map<string, ModelState>,
  roundNumber: number,
  totalRounds: number,
  symbolId: string,
  currentTime: Date,
  currentPhase: number,
  benchmarkStartTime: Date,
  labelCounts: Record<TimeframeId, { total: number; positive: number }>
): Promise<void> {
  logger.logRoundHeader(roundNumber, totalRounds, currentTime);
  logger.startSpinner(`Round ${String(roundNumber)}/${String(totalRounds)}: Fetching market data...`);

  // Fetch chart data for this round (no orderbook needed for bottom prediction)
  const charts = await getForecastingCharts(symbolId, currentTime);

  // Set context
  setBottomCallerContext({
    chartByHorizon: charts.chartByHorizon,
    currentTime: currentTime.toISOString(),
    symbolId,
  });

  logger.succeedSpinner(`Round ${String(roundNumber)}/${String(totalRounds)}: Market data loaded`);

  // Get ground truth (secondaryLabels captured for future analysis)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- secondaryLabels captured for future analysis use
  const { labels, timeToPivotRatios, firstPivotAts, secondaryLabels: _secondaryLabels } = await resolveAllHorizonsGroundTruth(symbolId, currentTime);

  // Update label counts for base rate calculation in audit records
  updateLabelCounts(labelCounts, labels);

  // Run all active models in parallel with concurrency limit
  const activeModels = [...models.values()].filter(state => !state.eliminated);
  const batchCount = Math.ceil(activeModels.length / MAX_CONCURRENT_LLM_CALLS);
  logger.startSpinner(`Round ${String(roundNumber)}/${String(totalRounds)}: Calling ${String(activeModels.length)} models (${String(batchCount)} batch${batchCount > 1 ? 'es' : ''})...`);

  interface ModelResult { state: typeof activeModels[0]; output: Awaited<ReturnType<typeof runModelRound>> | undefined; error: Error | undefined }
  const modelResults: ModelResult[] = [];

  // Process in batches to avoid rate limiting
  for (let index = 0; index < activeModels.length; index += MAX_CONCURRENT_LLM_CALLS) {
    const batch = activeModels.slice(index, index + MAX_CONCURRENT_LLM_CALLS);
    const batchResults = await Promise.all(
      batch.map(async (state) => {
        try {
          const output = await runModelRound(state.modelId, benchmarkStartTime);
          return { state, output, error: undefined as Error | undefined };
        } catch (error) {
          return { state, output: undefined, error: error as Error };
        }
      })
    );
    modelResults.push(...batchResults);
  }
  logger.succeedSpinner(`Round ${String(roundNumber)}/${String(totalRounds)}: All ${String(activeModels.length)} models complete`);

  // Process results sequentially for logging and state updates
  for (const { state, output, error } of modelResults) {
    if (error !== undefined) {
      state.failedRounds.push(roundNumber);
      const errorMessage = error.message;
      logger.log(`${chalk.red('✖')} ${state.modelId}: Failed - ${errorMessage.slice(0, 100)}`);
      continue;
    }

    if (output === undefined) {continue;}

    const legacyPredictions = convertPredictionsForScorer(output.predictions);
    const roundScore = scorePhase0Round(legacyPredictions, labels);
    recordModelScore(state, roundScore, labels, timeToPivotRatios, firstPivotAts, roundNumber);

    // Write audit records for each horizon
    writeModelAuditRecords({
      currentTime,
      roundNumber,
      modelId: state.modelId,
      predictions: output.predictions,
      labels,
      firstPivotAts,
      timeToPivotRatios,
      labelCounts,
    });

    // Compute baselines from accumulated labels for this model
    const baselinesByHorizon: Record<TimeframeId, BaselineLogLoss> = {
      '15m': computeBaselineLogLoss(state.labelsByHorizon['15m']),
      '1h': computeBaselineLogLoss(state.labelsByHorizon['1h']),
      '4h': computeBaselineLogLoss(state.labelsByHorizon['4h']),
      '24h': computeBaselineLogLoss(state.labelsByHorizon['24h']),
    };
    const scoreSummary = formatRoundScoreWithBaseline(roundScore, baselinesByHorizon);
    logger.log(`${chalk.green('✔')} ${chalk.cyan(state.modelId)}: ${scoreSummary}`);
  }

  clearBottomCallerContext();

  // Persist results after each round
  persistResults(models, {
    startTime: benchmarkStartTime.toISOString(),
    symbolId,
    totalRounds,
    currentRound: roundNumber,
    currentPhase,
  }, undefined, { skipWrite: isQuickMode, logger });
}

/**
 * Find the best model for a specific horizon based on log loss
 * @param modelStates - Map of model states
 * @param horizon - The horizon to find best model for
 * @returns Best model info or undefined if no qualified models
 */
function findBestModelForHorizon(
  modelStates: Map<string, ModelState>,
  horizon: TimeframeId
): { modelId: string; logLoss: number; roundCount: number } | undefined {
  let bestModel: { modelId: string; logLoss: number; roundCount: number } | undefined;

  for (const state of modelStates.values()) {
    // Only consider non-eliminated models that are qualified for this horizon
    if (state.eliminated || !state.qualifiedHorizons.has(horizon)) {
      continue;
    }

    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const losses = state.logLossByHorizon[horizon];
    if (losses.length === 0) {
      continue;
    }

    // Calculate mean log loss for this horizon
    let sum = 0;
    for (const loss of losses) {
      sum += loss;
    }
    const meanLogLoss = sum / losses.length;

    if (bestModel === undefined || meanLogLoss < bestModel.logLoss) {
      bestModel = {
        modelId: state.modelId,
        logLoss: meanLogLoss,
        roundCount: losses.length,
      };
    }
  }

  return bestModel;
}

/**
 * Format a single separability metric line for the recommendations block
 * @param metric - The metric separability result
 * @param cohortSize - Number of models in the cohort
 * @param minSamplesForCalibration - Minimum samples required for calibration metrics
 * @returns Formatted line string
 */
function formatSeparabilityMetricLine(
  metric: MetricSeparability,
  cohortSize: number,
  minSamplesForCalibration: number
): string {
  // Handle calibration-specific insufficient samples check
  if (metric.metricName === 'expectedCalibrationError' && cohortSize < minSamplesForCalibration) {
    return chalk.yellow(`  - ${metric.metricName}: insufficient samples (n=${String(cohortSize)}, need ${String(minSamplesForCalibration)})`);
  }

  // Handle insufficient cohort for separability analysis
  if (metric.separates === undefined) {
    return chalk.yellow(`  - ${metric.metricName}: insufficient cohort (n=${String(cohortSize)}, need ${String(MIN_MODELS_FOR_SEPARABILITY)})`);
  }

  // Format based on whether metric separates
  if (metric.separates) {
    return chalk.green(`  [check] ${metric.metricName}: separates (range=${metric.range.toFixed(2)}, s=${metric.stdDev.toFixed(2)})`);
  }
  return chalk.red(`  [x] ${metric.metricName}: does not separate (range=${metric.range.toFixed(2)})`);
}

/**
 * Print the recommendations block summarizing key findings
 * Answers: 1) Which agents are best per timeframe? 2) Which metrics separate models?
 * @param modelStates - Map of model states
 * @param baselines - Baseline log loss values per horizon
 * @param separabilityAnalysis - Results from metric separability analysis
 * @param cohortSize - Number of models in the analysis cohort
 * @param totalRounds - Total number of rounds in the benchmark
 */
function printRecommendationsBlock(
  modelStates: Map<string, ModelState>,
  baselines: Record<TimeframeId, BaselineLogLoss>,
  separabilityAnalysis: MetricSeparability[],
  cohortSize: number,
  totalRounds: number
): void {
  logger.newline();
  logger.log('=== Recommendations ===');
  logger.newline();

  // Section 1: Per-Horizon Best Models
  logger.log('Per-Horizon Best Models (with sample size):');

  for (const horizon of HORIZONS) {
    const best = findBestModelForHorizon(modelStates, horizon);
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const baseline = baselines[horizon];

    if (best === undefined) {
      logger.log(chalk.yellow(`  ${horizon}: insufficient data (0 qualified models)`));
    } else {
      const baselineLL = baseline.trivialBest;
      const modelLL = best.logLoss.toFixed(2);
      const baselineFormatted = baselineLL.toFixed(2);
      logger.log(
        `  ${horizon}: ${chalk.cyan(best.modelId)} (n=${String(best.roundCount)} rounds, LL=${modelLL} vs baseline ${baselineFormatted})`
      );
    }
  }

  logger.newline();

  // Section 2: Separative Metrics
  logger.log(`Separative Metrics (cohort=${String(cohortSize)}):`);

  if (cohortSize < MIN_MODELS_FOR_SEPARABILITY) {
    logger.log(chalk.yellow(`  insufficient cohort for separability analysis (need ${String(MIN_MODELS_FOR_SEPARABILITY)}, have ${String(cohortSize)})`));
  } else {
    const minSamplesForCalibration = 20; // Same constant used in leaderboards.ts and model-profiles.ts
    for (const metric of separabilityAnalysis) {
      logger.log(formatSeparabilityMetricLine(metric, cohortSize, minSamplesForCalibration));
    }
  }

  // Section 3: Quick Mode Notice
  if (isQuickMode) {
    logger.newline();
    logger.log(chalk.yellow('Quick Mode Notice:'));
    logger.log(chalk.yellow(`  Results based on ${String(totalRounds)} rounds. Run full benchmark for reliable rankings.`));
  }
}

/**
 * Build separability data and analysis from model states
 * Includes ALL non-eliminated models with data regardless of qualification status
 * @param modelStates - Map of model states
 * @returns Object with profiles, analysis, and cohort size
 */
function buildSeparabilityData(
  modelStates: Map<string, ModelState>
): { profiles: ModelProfile[]; analysis: MetricSeparability[]; cohortSize: number } {
  // Build profiles for non-eliminated models with round data
  const profiles = [...modelStates.values()]
    .filter((state) => !state.eliminated && state.trackBRounds.length > 0 && state.qualifiedHorizons.size > 0)
    .map((state) => {
      const roundData = buildRoundDataForProfile(state.trackBRounds);
      return buildModelProfile(state.modelId, roundData);
    });

  // Run separability analysis
  const separabilityData: ModelProfile[] = profiles.map((p) => ({
    modelId: p.modelId,
    meanLogLoss: p.meanLogLoss,
    meanBrier: p.meanBrier,
    expectedCalibrationError: p.expectedCalibrationError,
    tpRate: p.tpRate,
    fpRate: p.fpRate,
  }));

  const analysis = analyzeMetricSeparability(separabilityData);

  return { profiles: separabilityData, analysis, cohortSize: profiles.length };
}

/**
 * Print smoke test summary with pipeline status checklist
 * @param status - Smoke test status tracking object
 * @param models - Map of model states for raw results display
 * @param totalRounds - Total number of rounds completed
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Summary function with multiple status checks is inherently complex
function printSmokeTestSummary(
  status: SmokeTestStatus,
  models: Map<string, ModelState>,
  totalRounds: number
): void {
  logger.newline();
  logger.log(chalk.bold('=== Quick Mode Summary (Smoke Test) ==='));
  logger.newline();

  logger.log('Pipeline Status:');

  // Check 1: Model predictions parsed successfully
  const predictionSuccess = status.successfulPredictions === status.totalPredictionAttempts;
  const predictionIcon = predictionSuccess ? chalk.green('[check]') : chalk.red('[x]');
  logger.log(`  ${predictionIcon} Model predictions: ${String(status.successfulPredictions)}/${String(status.totalPredictionAttempts)} parsed successfully`);

  // Check 2: Ground truth resolved
  const gtIcon = status.groundTruthResolved ? chalk.green('[check]') : chalk.red('[x]');
  logger.log(`  ${gtIcon} Ground truth: resolved for all horizons`);

  // Check 3: Scoring computed
  const scoringIcon = status.scoringComputed ? chalk.green('[check]') : chalk.red('[x]');
  logger.log(`  ${scoringIcon} Scoring: log loss and brier computed`);

  // Check 4: Timing/pivot hits
  if (status.pivotHits > 0) {
    logger.log(`  ${chalk.green('[check]')} Timing: ${String(status.pivotHits)} pivot hit(s) detected`);
  } else {
    logger.log(`  ${chalk.yellow('[?]')} Timing: no pivot hits (possible alignment issue or normal for this data window)`);
  }

  // Show issues that would cause disqualification in full run
  if (status.wouldDisqualify.size > 0) {
    logger.newline();
    logger.log(chalk.yellow('Issues that would cause disqualification in full run:'));
    for (const [modelId, issues] of status.wouldDisqualify) {
      for (const issue of issues) {
        logger.log(`  - ${chalk.cyan(modelId)}: ${issue}`);
      }
    }
  }

  // Raw results table header
  logger.newline();
  logger.log(chalk.bold('Raw Results (not for model selection):'));
  logger.newline();

  // Show simple summary for each model
  for (const state of models.values()) {
    const meanLogLoss = computeMeanLogLoss(state);
    const avgLL = (meanLogLoss['15m'] + meanLogLoss['1h'] + meanLogLoss['4h'] + meanLogLoss['24h']) / 4;
    const roundCount = state.roundScores.length;
    const failedCount = state.failedRounds.length;

    let modelStatusString = `rounds=${String(roundCount)}, avgLL=${avgLL.toFixed(3)}`;
    if (failedCount > 0) {
      modelStatusString += `, failed=${String(failedCount)}`;
    }

    logger.log(`  ${chalk.cyan(state.modelId)}: ${modelStatusString}`);
  }

  logger.newline();
  logger.log(chalk.yellow('To run model selection, use full benchmark without --quick'));
  logger.log(chalk.yellow(`Total rounds in smoke test: ${String(totalRounds)}`));
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- Main entry point orchestrates phases, complexity is acceptable
async function main(): Promise<void> {
  logger.header('agent_006 Bitcoin Bottom Arena Benchmark');

  // Initialize audit file (writes even in quick mode)
  initAuditFile();

  // Load all vision models
  const allModelIds = getModelIds();
  logger.log(`Loaded ${String(allModelIds.length)} vision models`);

  // Parse --model argument for specific model selection
  const specifiedModels = parseModelArgument(process.argv);
  let modelIds = specifiedModels ?? allModelIds;

  // Validate specified models exist
  if (specifiedModels !== undefined) {
    const invalidModels = specifiedModels.filter(m => !allModelIds.includes(m));
    if (invalidModels.length > 0) {
      logger.log(chalk.yellow(`Warning: Unknown models specified: ${invalidModels.join(', ')}`));
      // Filter to only valid models
      modelIds = specifiedModels.filter(m => allModelIds.includes(m));
      if (modelIds.length === 0) {
        throw new Error('No valid models specified');
      }
    }
    logger.log(`Using specified models: ${modelIds.join(', ')}`);
  }

  // Quick mode: smoke test with reduced models
  // Initialize smoke test status tracking (only used in quick mode)
  const smokeTestStatus = isQuickMode ? createSmokeTestStatus() : undefined;

  if (isQuickMode) {
    logger.log(chalk.yellow('SMOKE TEST MODE: Verifying pipeline correctness (not for model selection)'));
    // Only random select if no specific models were requested
    if (specifiedModels === undefined) {
      logger.log(`  ${String(QUICK_ROUNDS_PER_PHASE)} rounds/phase, ${String(QUICK_MODEL_COUNT)} random models`);
      modelIds = shuffleArray(modelIds).slice(0, QUICK_MODEL_COUNT);
      logger.log(`  Selected: ${modelIds.join(', ')}`);
    } else {
      logger.log(`  ${String(QUICK_ROUNDS_PER_PHASE)} rounds/phase, ${String(modelIds.length)} specified models`);
    }
  }

  // Initialize model state for all models
  const models = new Map<string, ModelState>();
  for (const modelId of modelIds) {
    models.set(modelId, createModelState(modelId));
  }

  // Track label counts for trivial baseline calculation in audit records
  const labelCounts: Record<TimeframeId, { total: number; positive: number }> = {
    '15m': { total: 0, positive: 0 },
    '1h': { total: 0, positive: 0 },
    '4h': { total: 0, positive: 0 },
    '24h': { total: 0, positive: 0 },
  };

  // Initialize clock
  resetClockState();
  let clockState = initializeClock();
  const benchmarkStartTime = new Date(); // Real wall-clock time for session isolation
  const startTime = clockState.currentTime.toISOString();

  logger.newline();
  logger.log(`Symbol: ${SYMBOL_ID}`);
  logger.log(`Start time: ${startTime}`);

  const roundCounts = getPhaseRoundCounts();
  const phase0Rounds = roundCounts.phase0;
  const phase1Rounds = roundCounts.phase1;
  const phase2Rounds = roundCounts.phase2;
  const totalRounds = phase0Rounds + phase1Rounds + phase2Rounds;
  let roundNumber = 0;

  // ========== PREFETCH ALL REPLAY LAB DATA ==========
  // Warm up cache before AI calls to fail fast on API errors
  await prefetchAllRoundData(
    SYMBOL_ID,
    clockState.currentTime,
    totalRounds,
    process.argv.includes('--verbose')
  );

  // ========== PHASE 0 ==========
  logger.newline();
  logger.log(`--- Starting Phase 0 rounds (1-${String(phase0Rounds)}) ---`);
  for (let phase0Round = 1; phase0Round <= phase0Rounds; phase0Round++) {
    roundNumber++;
    await runBenchmarkRound(models, roundNumber, totalRounds, SYMBOL_ID, clockState.currentTime, 0, benchmarkStartTime, labelCounts);
    clockState = advanceClock();
  }

  // Run Phase 0 elimination (or validation in smoke test mode)
  runPhase0(models, smokeTestStatus);

  // ========== PHASE 1 ==========
  logger.newline();
  const phase1Start = phase0Rounds + 1;
  const phase1End = phase0Rounds + phase1Rounds;
  logger.log(`--- Starting Phase 1 rounds (${String(phase1Start)}-${String(phase1End)}) ---`);
  for (let phase1Round = 1; phase1Round <= phase1Rounds; phase1Round++) {
    roundNumber++;
    await runBenchmarkRound(models, roundNumber, totalRounds, SYMBOL_ID, clockState.currentTime, 1, benchmarkStartTime, labelCounts);
    clockState = advanceClock();
  }

  // Run Phase 1 elimination
  runPhase1(models);

  // ========== PHASE 2 ==========
  logger.newline();
  const phase2Start = phase0Rounds + phase1Rounds + 1;
  const phase2End = phase0Rounds + phase1Rounds + phase2Rounds;
  logger.log(`--- Starting Phase 2 rounds (${String(phase2Start)}-${String(phase2End)}) ---`);
  for (let phase2Round = 1; phase2Round <= phase2Rounds; phase2Round++) {
    roundNumber++;
    await runBenchmarkRound(models, roundNumber, totalRounds, SYMBOL_ID, clockState.currentTime, 2, benchmarkStartTime, labelCounts);
    clockState = advanceClock();
  }

  // Run Phase 2 elimination
  runPhase2(models);

  // ========== SMOKE TEST MODE: Show summary and exit early ==========
  if (isQuickMode && smokeTestStatus !== undefined) {
    // Update smoke test status from collected data
    for (const state of models.values()) {
      smokeTestStatus.totalPredictionAttempts += state.roundScores.length + state.failedRounds.length;
      smokeTestStatus.successfulPredictions += state.roundScores.length;

      // Count pivot hits from trackB rounds
      for (const round of state.trackBRounds) {
        for (const horizon of HORIZONS) {
          // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
          if (round.timeToPivotRatio?.[horizon] !== undefined) {
            smokeTestStatus.pivotHits++;
          }
        }
      }
    }

    // Ground truth is resolved if any model has labels
    const anyModelHasLabels = [...models.values()].some(
      state => state.labelsByHorizon['15m'].length > 0
    );
    smokeTestStatus.groundTruthResolved = anyModelHasLabels;

    // Scoring is computed if any model has round scores
    const anyModelHasScores = [...models.values()].some(
      state => state.roundScores.length > 0
    );
    smokeTestStatus.scoringComputed = anyModelHasScores;

    // Print smoke test summary
    printSmokeTestSummary(smokeTestStatus, models, totalRounds);

    logger.newline();
    logger.log('=== Smoke Test Complete ===');
    return;
  }

  // ========== FULL RUN: Continue with elimination and ranking ==========

  // Print per-model horizon qualification summary
  printHorizonQualificationSummary(models);

  // ========== PHASE 3: Final ranking (no additional rounds) ==========
  const perHorizonRankings = runPhase3(models);

  // ========== Track B: Timing Diagnostics (informational only) ==========
  logger.newline();
  logger.log('=== Track B: Timing Diagnostics (Informational) ===');

  // Compute Track B metrics for all non-eliminated models
  const trackBData = [...models.values()]
    .filter(state => !state.eliminated && state.trackBRounds.length > 0)
    .map(state => ({
      modelId: state.modelId,
      metrics: computeTrackBMetrics(state.trackBRounds),
    }));

  if (trackBData.length > 0) {
    printTimingDiagnosticsTable(trackBData);

    // Print cross-horizon behavior map
    const behaviorMapData = [...models.values()]
      .filter(state => !state.eliminated)
      .map(state => ({
        modelId: state.modelId,
        qualifiedHorizons: state.qualifiedHorizons,
        trackB: computeTrackBMetrics(state.trackBRounds),
      }));
    printCrossHorizonBehaviorMap(behaviorMapData);
  } else {
    logger.log('  No models with timing data to display');
  }

  // Print Recommendations block (answers the two key questions)
  const baselines = computeBaselinesFromModels(models);
  const { analysis: separabilityAnalysis, cohortSize } = buildSeparabilityData(models);
  printRecommendationsBlock(models, baselines, separabilityAnalysis, cohortSize, totalRounds);

  // Final persistence
  persistResults(models, {
    startTime,
    symbolId: SYMBOL_ID,
    totalRounds,
    currentRound: roundNumber,
    currentPhase: 3,
  }, perHorizonRankings, { logger });

  logger.newline();
  logger.log('=== Benchmark Complete ===');
  logger.log(`Total rounds: ${String(roundNumber)}`);

  // Count total unique models across all horizons
  const uniqueModels = new Set<string>();
  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    for (const ranking of perHorizonRankings[horizon]) {
      uniqueModels.add(ranking.modelId);
    }
  }
  logger.log(`Total unique arena models: ${String(uniqueModels.size)}`);
}

// Use top-level await pattern for CLI
await main()
  .then(() => {
    // eslint-disable-next-line unicorn/no-process-exit -- CLI must exit explicitly to close DB connections
    process.exit(0);
  })
  .catch((error: unknown) => {

    console.error('Benchmark failed:', error);
    // eslint-disable-next-line unicorn/no-process-exit -- CLI exit code
    process.exit(1);
  });
/* eslint-enable max-lines -- end of file */
