import { runRound } from '@nullagent/agent-core';
import { createBenchmarkLogger } from '@nullagent/cli-utils';
import chalk from 'chalk';

import {
  createBottomCaller,
  setBottomCallerContext,
  clearBottomCallerContext,
} from './bottom-caller.js';
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
import { getForecastingCharts } from './replay-lab/charts.js';
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
import type { ModelScoreData } from './reports/leaderboards.js';
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

// Quick mode constants
const QUICK_ROUNDS_PER_PHASE = 3;
const QUICK_MODEL_COUNT = 3;

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
 * @returns Bottom caller output with predictions
 */
async function runModelRound(modelId: string): Promise<BottomCallerOutput> {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- MODEL_ID is set dynamically per model in benchmark
  process.env['MODEL_ID'] = modelId;

  const bottomCaller = createBottomCaller(modelId);
  const result = await runRound(bottomCaller);
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
 * @param models - Map of model states
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Phase elimination logic with baseline comparison is inherently complex
function runPhase0(models: Map<string, ModelState>): void {
  logger.newline();
  logger.log('=== Phase 0: Sanity Filter (Per-Horizon Disqualification) ===');

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

  const remaining = [...models.values()].filter((model) => !model.eliminated).length;
  logger.log(`Phase 0 complete: ${String(eliminated)} fully eliminated, ${String(remaining)} remaining`);
}

/**
 * Run Phase 1 elimination - relative performance with per-horizon qualification
 * @param models - Map of model states
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Phase elimination logic is inherently complex
function runPhase1(models: Map<string, ModelState>): void {
  logger.newline();
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
 * @param models - Map of model states
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Phase elimination logic is inherently complex
function runPhase2(models: Map<string, ModelState>): void {
  logger.newline();
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
}


/**
 * Extract predictions and labels for a specific horizon from track B rounds
 * @param trackBRounds - Array of round scores with predictions/labels
 * @param horizon - The timeframe to extract data for
 * @returns Object containing predictions and labels arrays
 */
function extractHorizonPredictionsAndLabels(
  trackBRounds: RoundScore[],
  horizon: TimeframeId
): { predictions: number[]; labels: boolean[] } {
  const predictions: number[] = [];
  const labels: boolean[] = [];
  for (const round of trackBRounds) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const prediction = round.predictions?.[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const label = round.labels?.[horizon];
    if (prediction !== undefined && label !== undefined) {
      predictions.push(prediction);
      labels.push(label);
    }
  }
  return { predictions, labels };
}

/**
 * Calculate Brier scores from paired predictions and labels
 * @param predictionValues - Array of predicted probabilities
 * @param labelValues - Array of actual outcomes
 * @returns Array of Brier scores
 */
function calculateBrierScores(predictionValues: number[], labelValues: boolean[]): number[] {
  const briers: number[] = [];
  for (const [index, prediction] of predictionValues.entries()) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, security/detect-object-injection -- index bounded by entries()
    const label = labelValues[index]!;
    briers.push(brierScore(prediction, label));
  }
  return briers;
}

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

/**
 * Extended model score data with qualification status
 */
interface ModelScoreDataWithQualification extends ModelScoreData {
  isQualified: boolean;
}

/**
 * Check if any models are qualified for a horizon
 * @param horizonScores - Map of model scores for a horizon
 * @returns Number of qualified models
 */
function countQualifiedModels(horizonScores: Map<string, ModelScoreDataWithQualification>): number {
  let count = 0;
  for (const data of horizonScores.values()) {
    if (data.isQualified) {
      count++;
    }
  }
  return count;
}

/**
 * Convert extended score data to base format
 * @param horizonScores - Extended model score data
 * @returns Base model score data without isQualified field
 */
function toBaseScoreData(horizonScores: Map<string, ModelScoreDataWithQualification>): Map<string, ModelScoreData> {
  const baseData = new Map<string, ModelScoreData>();
  for (const [modelId, data] of horizonScores) {
    baseData.set(modelId, {
      logLosses: data.logLosses,
      briers: data.briers,
      predictions: data.predictions,
      labels: data.labels,
    });
  }
  return baseData;
}

/**
 * Build ModelScoreData maps for each horizon from model states
 * Includes ALL non-eliminated models with data, regardless of qualification status
 * @param modelStates - Map of model states
 * @returns Record of horizon to map of modelId to ModelScoreDataWithQualification
 */
function buildLeaderboardScoreData(
  modelStates: Map<string, ModelState>
): Record<TimeframeId, Map<string, ModelScoreDataWithQualification>> {
  const result: Record<TimeframeId, Map<string, ModelScoreDataWithQualification>> = {
    '15m': new Map(),
    '1h': new Map(),
    '4h': new Map(),
    '24h': new Map(),
  };
  for (const state of modelStates.values()) {
    if (state.eliminated) {
      continue;
    }
    for (const horizon of HORIZONS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      const logLosses = state.logLossByHorizon[horizon];
      if (logLosses.length === 0) {
        continue;
      }
      const { predictions, labels } = extractHorizonPredictionsAndLabels(state.trackBRounds, horizon);
      const briers = calculateBrierScores(predictions, labels);
      const isQualified = state.qualifiedHorizons.has(horizon);
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      result[horizon].set(state.modelId, { logLosses, briers, predictions, labels, isQualified });
    }
  }
  return result;
}

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
 * @param startTime - Benchmark start time for persistence
 * @param labelCounts - Label counts for trivial baseline calculation
 */
async function runBenchmarkRound(
  models: Map<string, ModelState>,
  roundNumber: number,
  totalRounds: number,
  symbolId: string,
  currentTime: Date,
  currentPhase: number,
  startTime: string,
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

  // Run each active model
  for (const state of models.values()) {
    if (state.eliminated) {
      continue;
    }

    logger.startSpinner(`Round ${String(roundNumber)}/${String(totalRounds)}: ${state.modelId} - Calling LLM...`);

    try {
      const output = await runModelRound(state.modelId);
      const legacyPredictions = convertPredictionsForScorer(output.predictions);
      const roundScore = scorePhase0Round(
        legacyPredictions,
        labels
      );
      recordModelScore(state, roundScore, labels, timeToPivotRatios, firstPivotAts, roundNumber);

      // Write audit records for each horizon (writes even in quick mode)
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
      logger.succeedSpinner(`${chalk.cyan(state.modelId)}: ${scoreSummary}`);
    } catch (error) {
      // Record failure but continue with other models
      state.failedRounds.push(roundNumber);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.failSpinner(`${state.modelId}: Failed - ${errorMessage.slice(0, 100)}`);
    }
  }

  clearBottomCallerContext();

  // Persist results after each round
  persistResults(models, {
    startTime,
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

async function main(): Promise<void> {
  logger.header('agent_006 Bitcoin Bottom Arena Benchmark');

  // Initialize audit file (writes even in quick mode)
  initAuditFile();

  // Load all vision models
  let modelIds = getModelIds();
  logger.log(`Loaded ${String(modelIds.length)} vision models`);

  // Quick mode: use only 3 random models
  if (isQuickMode) {
    logger.log('🚀 Quick mode: 1 round/phase, 3 random models');
    modelIds = shuffleArray(modelIds).slice(0, QUICK_MODEL_COUNT);
    logger.log(`Selected: ${modelIds.join(', ')}`);
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

  // ========== PHASE 0 ==========
  logger.newline();
  logger.log(`--- Starting Phase 0 rounds (1-${String(phase0Rounds)}) ---`);
  for (let phase0Round = 1; phase0Round <= phase0Rounds; phase0Round++) {
    roundNumber++;
    await runBenchmarkRound(models, roundNumber, totalRounds, SYMBOL_ID, clockState.currentTime, 0, startTime, labelCounts);
    clockState = advanceClock();
  }

  // Run Phase 0 elimination
  runPhase0(models);

  // ========== PHASE 1 ==========
  logger.newline();
  const phase1Start = phase0Rounds + 1;
  const phase1End = phase0Rounds + phase1Rounds;
  logger.log(`--- Starting Phase 1 rounds (${String(phase1Start)}-${String(phase1End)}) ---`);
  for (let phase1Round = 1; phase1Round <= phase1Rounds; phase1Round++) {
    roundNumber++;
    await runBenchmarkRound(models, roundNumber, totalRounds, SYMBOL_ID, clockState.currentTime, 1, startTime, labelCounts);
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
    await runBenchmarkRound(models, roundNumber, totalRounds, SYMBOL_ID, clockState.currentTime, 2, startTime, labelCounts);
    clockState = advanceClock();
  }

  // Run Phase 2 elimination
  runPhase2(models);

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
  }, perHorizonRankings, { skipWrite: isQuickMode, logger });

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
