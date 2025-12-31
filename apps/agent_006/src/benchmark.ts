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
import { resolveDualGroundTruth } from './ground-truth/bottom-checker.js';
import { getModelIds } from './matrix.js';
import { persistResults } from './persist-results.js';
import { getForecastingCharts } from './replay-lab/charts.js';
import {
  scorePhase0Round,
  aggregatePhase0Scores,
  getPhase0DisqualifiedHorizons,
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
import type { Phase0RoundScore } from './scorers/phase-0-scorer.js';
import type { Phase1ModelScore } from './scorers/phase-1-scorer.js';
import type { Phase2ModelScore } from './scorers/phase-2-scorer.js';
import type { ModelWithHorizonMetrics, PerHorizonRankings } from './scorers/phase-3-scorer.js';
import type { RoundScore } from './state/model-state.js';
import type { TimeframeId } from './timeframe-config.js';

const logger = createBenchmarkLogger(process.argv.includes('--verbose'));
const isQuickMode = process.argv.includes('--quick');

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

function formatRoundScore(roundScore: Phase0RoundScore): string {
  const ll = roundScore.logLossByHorizon;
  const mean = (ll['15m'] + ll['1h'] + ll['4h'] + ll['24h']) / 4;
  return `LL[15m:${formatLogLoss(ll['15m'])} 1h:${formatLogLoss(ll['1h'])} 4h:${formatLogLoss(ll['4h'])} 24h:${formatLogLoss(ll['24h'])}] mean:${formatLogLoss(mean)}`;
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

const HORIZONS: TimeframeId[] = ['15m', '1h', '4h', '24h'];

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
 * @param roundNumber - Current round number for Track B tracking
 */
function recordModelScore(
  state: ModelState,
  roundScore: Phase0RoundScore,
  labels: Record<TimeframeId, boolean>,
  timeToPivotRatios: Record<TimeframeId, number | undefined>,
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
  }
}

/**
 * Resolve ground truth for all horizons using dual pivot methods
 * @param symbolId - Trading symbol identifier
 * @param predictionTime - Time of prediction
 * @returns Labels and time-to-pivot ratios for all horizons (using primary method)
 */
async function resolveAllHorizonsGroundTruth(
  symbolId: string,
  predictionTime: Date
): Promise<{
  labels: Record<TimeframeId, boolean>;
  timeToPivotRatios: Record<TimeframeId, number | undefined>;
  // Secondary labels for analysis (not used for scoring)
  secondaryLabels: Record<TimeframeId, boolean>;
}> {
  const labels: Record<string, boolean> = {};
  const ratios: Record<string, number | undefined> = {};
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
    // Secondary for analysis
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    secondaryLabels[horizon] = dualResult.secondary.hasStructuralBottom;
  }

  return {
    labels: labels as Record<TimeframeId, boolean>,
    timeToPivotRatios: ratios as Record<TimeframeId, number | undefined>,
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
 * Run Phase 0 elimination - sanity filter with per-horizon disqualification
 * @param models - Map of model states
 */
function runPhase0(models: Map<string, ModelState>): void {
  logger.newline();
  logger.log('=== Phase 0: Sanity Filter (Per-Horizon Disqualification) ===');

  let eliminated = 0;
  for (const state of models.values()) {
    if (state.eliminated) {
      continue;
    }

    const aggregate = aggregatePhase0Scores(state.roundScores);
    const disqualifiedHorizons = getPhase0DisqualifiedHorizons(aggregate);

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
      logger.log(`  ${chalk.cyan(state.modelId)}: disqualified from [${[...disqualifiedHorizons].join(', ')}] → ${chalk.red('ELIMINATED')} (all horizons)`);
    } else if (disqualifiedHorizons.size > 0) {
      const qualifiedList = [...state.qualifiedHorizons].join(', ');
      logger.log(`  ${chalk.cyan(state.modelId)}: disqualified from [${[...disqualifiedHorizons].join(', ')}] → qualified for [${chalk.green(qualifiedList)}]`);
    } else {
      logger.log(`  ${chalk.cyan(state.modelId)}: passed sanity check → qualified for [${chalk.green([...state.qualifiedHorizons].join(', '))}]`);
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

  return perHorizonRankings;
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
 */
async function runBenchmarkRound(
  models: Map<string, ModelState>,
  roundNumber: number,
  totalRounds: number,
  symbolId: string,
  currentTime: Date,
  currentPhase: number,
  startTime: string
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
  const { labels, timeToPivotRatios, secondaryLabels: _secondaryLabels } = await resolveAllHorizonsGroundTruth(symbolId, currentTime);

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
      recordModelScore(state, roundScore, labels, timeToPivotRatios, roundNumber);
      const scoreSummary = formatRoundScore(roundScore);
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
  });
}

async function main(): Promise<void> {
  logger.header('agent_006 Bitcoin Bottom Arena Benchmark');

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
    await runBenchmarkRound(models, roundNumber, totalRounds, SYMBOL_ID, clockState.currentTime, 0, startTime);
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
    await runBenchmarkRound(models, roundNumber, totalRounds, SYMBOL_ID, clockState.currentTime, 1, startTime);
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
    await runBenchmarkRound(models, roundNumber, totalRounds, SYMBOL_ID, clockState.currentTime, 2, startTime);
    clockState = advanceClock();
  }

  // Run Phase 2 elimination
  runPhase2(models);

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

  // Final persistence
  persistResults(models, {
    startTime,
    symbolId: SYMBOL_ID,
    totalRounds,
    currentRound: roundNumber,
    currentPhase: 3,
  });

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
