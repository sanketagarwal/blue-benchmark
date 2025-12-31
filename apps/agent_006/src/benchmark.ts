import { runRound } from '@nullagent/agent-core';
import { createBenchmarkLogger } from '@nullagent/cli-utils';

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
import { resolveBottomGroundTruth } from './ground-truth/bottom-checker.js';
import { getModelIds } from './matrix.js';
import { getForecastingCharts } from './replay-lab/charts.js';
import { getOrderbookSnapshot, formatOrderbookForPrompt } from './replay-lab/orderbook.js';
import { getTrades } from './replay-lab/trades.js';
import {
  scorePhase0Round,
  aggregatePhase0Scores,
  shouldEliminatePhase0,
} from './scorers/phase-0-scorer.js';
import {
  computePercentileRanks,
  shouldEliminatePhase1,
} from './scorers/phase-1-scorer.js';
import {
  computeStabilityMetrics,
  computeRegret,
  shouldEliminatePhase2,
  median,
} from './scorers/phase-2-scorer.js';
import { rankModels } from './scorers/phase-3-scorer.js';

import type { BottomCallerOutput, BottomContractId } from './bottom-caller.js';
import type { Horizon } from './horizon-config.js';
import type { Phase0RoundScore } from './scorers/phase-0-scorer.js';
import type { Phase1ModelScore } from './scorers/phase-1-scorer.js';
import type { Phase2ModelScore } from './scorers/phase-2-scorer.js';
import type { Phase3ModelMetrics } from './scorers/phase-3-scorer.js';

const logger = createBenchmarkLogger(process.argv.includes('--verbose'));

const HORIZONS: Horizon[] = ['15m', '1h', '24h', '7d'];

// Phase round counts
const PHASE_0_ROUNDS = 6;
const PHASE_1_ROUNDS = 12;
const PHASE_2_ROUNDS = 24;

/**
 * Model state for tracking across phases
 */
interface ModelState {
  modelId: string;
  eliminated: boolean;
  eliminatedInPhase?: number;
  roundScores: Phase0RoundScore[];
  logLossByHorizon: Record<Horizon, number[]>;
  timeToPivotRatios: Record<Horizon, number[]>;
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
    logLossByHorizon: { '15m': [], '1h': [], '24h': [], '7d': [] },
    timeToPivotRatios: { '15m': [], '1h': [], '24h': [], '7d': [] },
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
 * Resolve ground truth for all horizons
 * @param symbolId - Trading symbol identifier
 * @param predictionTime - Time of prediction
 * @returns Labels and time-to-pivot ratios for all horizons
 */
async function resolveAllHorizonsGroundTruth(
  symbolId: string,
  predictionTime: Date
): Promise<{ labels: Record<Horizon, boolean>; timeToPivotRatios: Record<Horizon, number | undefined> }> {
  const labels: Record<string, boolean> = {};
  const ratios: Record<string, number | undefined> = {};

  // Need to fetch trades covering the longest horizon (7d)
  const maxDuration = 7 * 24 * 60 * 60 * 1000;
  const tradeWindowEnd = new Date(predictionTime.getTime() + maxDuration);
  const trades = await getTrades(symbolId, predictionTime, tradeWindowEnd);

  for (const horizon of HORIZONS) {
    const result = await resolveBottomGroundTruth(symbolId, horizon, predictionTime, trades);
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    labels[horizon] = result.isValid;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    ratios[horizon] = result.timeToPivotRatio;
  }

  return {
    labels: labels as Record<Horizon, boolean>,
    timeToPivotRatios: ratios as Record<Horizon, number | undefined>,
  };
}

/**
 * Compute mean log loss for a model across all horizons
 * @param state - Model state with log loss data
 * @returns Mean log loss by horizon
 */
function computeMeanLogLoss(state: ModelState): Record<Horizon, number> {
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
  return meanLogLoss as Record<Horizon, number>;
}

/**
 * Run Phase 0 elimination - sanity filter
 * @param models - Map of model states
 */
function runPhase0(models: Map<string, ModelState>): void {
  logger.newline();
  logger.log('=== Phase 0: Sanity Filter ===');

  let eliminated = 0;
  for (const state of models.values()) {
    if (state.eliminated) {
      continue;
    }

    const aggregate = aggregatePhase0Scores(state.roundScores);
    if (shouldEliminatePhase0(aggregate)) {
      state.eliminated = true;
      state.eliminatedInPhase = 0;
      eliminated++;
      logger.log(`  ELIMINATED: ${state.modelId} (degenerate or worse than random)`);
    }
  }

  const remaining = [...models.values()].filter((model) => !model.eliminated).length;
  logger.log(`Phase 0 complete: ${String(eliminated)} eliminated, ${String(remaining)} remaining`);
}

/**
 * Run Phase 1 elimination - relative performance
 * @param models - Map of model states
 */
function runPhase1(models: Map<string, ModelState>): void {
  logger.newline();
  logger.log('=== Phase 1: Relative Performance ===');

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
    if (percentiles !== undefined && shouldEliminatePhase1(percentiles)) {
      state.eliminated = true;
      state.eliminatedInPhase = 1;
      eliminated++;
      logger.log(`  ELIMINATED: ${state.modelId} (bottom quartile performance)`);
    }
  }

  const remaining = [...models.values()].filter((model) => !model.eliminated).length;
  logger.log(`Phase 1 complete: ${String(eliminated)} eliminated, ${String(remaining)} remaining`);
}

/**
 * Compute stability metrics for a single model
 * @param state - Model state with log loss data
 * @returns Stability metrics by horizon
 */
function computeModelStabilityMetrics(state: ModelState): {
  stabilityByHorizon: Record<Horizon, number>;
  worstWindowByHorizon: Record<Horizon, number>;
  bestWindowByHorizon: Record<Horizon, number>;
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
    stabilityByHorizon: stabilityByHorizon as Record<Horizon, number>,
    worstWindowByHorizon: worstWindowByHorizon as Record<Horizon, number>,
    bestWindowByHorizon: bestWindowByHorizon as Record<Horizon, number>,
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
  allWorstWindows: Record<Horizon, number[]>;
  allStabilities: Record<Horizon, number[]>;
} {
  const modelScores: Phase2ModelScore[] = [];
  const allWorstWindows: Record<Horizon, number[]> = { '15m': [], '1h': [], '24h': [], '7d': [] };
  const allStabilities: Record<Horizon, number[]> = { '15m': [], '1h': [], '24h': [], '7d': [] };

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
      regretByHorizon: {} as Record<Horizon, number>,
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
  medianWorstWindows: Record<Horizon, number>
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
 * Run Phase 2 elimination - stability and regret
 * @param models - Map of model states
 */
function runPhase2(models: Map<string, ModelState>): void {
  logger.newline();
  logger.log('=== Phase 2: Stability & Regret ===');

  const { modelScores, allWorstWindows, allStabilities } = collectPhase2Metrics(models);

  // Compute median values
  const medianWorstWindows: Record<Horizon, number> = {
    '15m': median(allWorstWindows['15m']),
    '1h': median(allWorstWindows['1h']),
    '24h': median(allWorstWindows['24h']),
    '7d': median(allWorstWindows['7d']),
  };
  const medianStabilities: Record<Horizon, number> = {
    '15m': median(allStabilities['15m']),
    '1h': median(allStabilities['1h']),
    '24h': median(allStabilities['24h']),
    '7d': median(allStabilities['7d']),
  };

  computeAllRegrets(modelScores, medianWorstWindows);

  // Eliminate models
  let eliminated = 0;
  for (const score of modelScores) {
    const state = models.get(score.modelId);
    if (state === undefined || state.eliminated) {
      continue;
    }

    if (shouldEliminatePhase2(score, medianStabilities)) {
      state.eliminated = true;
      state.eliminatedInPhase = 2;
      eliminated++;
      logger.log(`  ELIMINATED: ${score.modelId} (high regret or instability)`);
    }
  }

  const remaining = [...models.values()].filter((model) => !model.eliminated).length;
  logger.log(`Phase 2 complete: ${String(eliminated)} eliminated, ${String(remaining)} remaining`);
}

/**
 * Compute Phase 3 metrics for a model
 * @param state - Model state
 * @param percentiles - Percentile ranks by horizon
 * @returns Phase 3 metrics
 */
function computePhase3Metrics(
  state: ModelState,
  percentiles: Record<Horizon, number>
): Phase3ModelMetrics {
  let percentileSum = 0;
  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    percentileSum += percentiles[horizon];
  }
  const avgPercentileRank = percentileSum / HORIZONS.length;

  let totalBestWindow = 0;
  let totalStability = 0;
  let totalTimeToPivotRatio = 0;
  let timeToPivotCount = 0;

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const losses = state.logLossByHorizon[horizon];
    const metrics = computeStabilityMetrics(losses);
    totalBestWindow += metrics.bestWindow;
    totalStability += metrics.variance;

    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const ratios = state.timeToPivotRatios[horizon];
    for (const ratio of ratios) {
      totalTimeToPivotRatio += ratio;
      timeToPivotCount++;
    }
  }

  return {
    avgPercentileRank,
    avgBestWindow: totalBestWindow / HORIZONS.length,
    avgStability: totalStability / HORIZONS.length,
    avgTimeToPivotRatio: timeToPivotCount > 0 ? totalTimeToPivotRatio / timeToPivotCount : 0.5,
  };
}

/**
 * Run Phase 3 ranking - final selection
 * @param models - Map of model states
 * @returns Array of arena competitors with scores
 */
function runPhase3(models: Map<string, ModelState>): { modelId: string; score: number }[] {
  logger.newline();
  logger.log('=== Phase 3: Final Ranking ===');

  // Build metrics for surviving models
  const modelMetrics: { modelId: string; metrics: Phase3ModelMetrics }[] = [];

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

    modelMetrics.push({
      modelId: state.modelId,
      metrics: computePhase3Metrics(state, percentiles),
    });
  }

  // Rank and return top 8
  const arenaCompetitors = rankModels(modelMetrics);

  logger.newline();
  logger.log('Arena Competitors (Top 8):');
  for (const [index, competitor] of arenaCompetitors.entries()) {
    logger.log(`  ${String(index + 1)}. ${competitor.modelId} (score: ${competitor.score.toFixed(4)})`);
  }

  return arenaCompetitors;
}

/**
 * Run a single benchmark round for all active models
 * @param models - Map of model states
 * @param roundNumber - Current round number
 * @param totalRounds - Total rounds in benchmark
 * @param symbolId - Trading symbol
 * @param currentTime - Current prediction time
 */
async function runBenchmarkRound(
  models: Map<string, ModelState>,
  roundNumber: number,
  totalRounds: number,
  symbolId: string,
  currentTime: Date
): Promise<void> {
  logger.logRoundHeader(roundNumber, totalRounds, currentTime);
  logger.startSpinner(`Round ${String(roundNumber)}/${String(totalRounds)}: Fetching market data...`);

  // Fetch data for this round
  const charts = await getForecastingCharts(symbolId, currentTime);
  const orderbook = await getOrderbookSnapshot(symbolId, currentTime);
  const orderbookData = formatOrderbookForPrompt(orderbook);

  // Set context
  setBottomCallerContext({
    chart4h5mUrl: charts.chart4h5m,
    chart24h15mUrl: charts.chart24h15m,
    orderbookData,
    currentTime: currentTime.toISOString(),
    symbolId,
  });

  logger.succeedSpinner(`Round ${String(roundNumber)}/${String(totalRounds)}: Market data loaded`);

  // Get ground truth
  const { labels, timeToPivotRatios } = await resolveAllHorizonsGroundTruth(symbolId, currentTime);

  // Run each active model
  for (const state of models.values()) {
    if (state.eliminated) {
      continue;
    }

    logger.startSpinner(`Round ${String(roundNumber)}/${String(totalRounds)}: ${state.modelId} - Calling LLM...`);

    const output = await runModelRound(state.modelId);
    const roundScore = scorePhase0Round(
      output.predictions as Record<BottomContractId, number>,
      labels
    );
    state.roundScores.push(roundScore);

    // Track log loss by horizon
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

    logger.succeedSpinner(`${state.modelId}: Scored`);
  }

  clearBottomCallerContext();
}

async function main(): Promise<void> {
  logger.header('agent_006 Bitcoin Bottom Arena Benchmark');

  // Get symbol from env
  const symbolId = process.env['SYMBOL_ID'];
  if (symbolId === undefined || symbolId === '') {
    throw new Error('SYMBOL_ID environment variable is required');
  }

  // Load all vision models
  const modelIds = getModelIds();
  logger.log(`Loaded ${String(modelIds.length)} vision models`);

  // Initialize model state for all models
  const models = new Map<string, ModelState>();
  for (const modelId of modelIds) {
    models.set(modelId, createModelState(modelId));
  }

  // Initialize clock
  resetClockState();
  let clockState = initializeClock();

  logger.newline();
  logger.log(`Symbol: ${symbolId}`);
  logger.log(`Start time: ${clockState.currentTime.toISOString()}`);

  const totalRounds = PHASE_0_ROUNDS + PHASE_1_ROUNDS + PHASE_2_ROUNDS;
  let roundNumber = 0;

  // ========== PHASE 0: 6 rounds ==========
  logger.newline();
  logger.log('--- Starting Phase 0 rounds (1-6) ---');
  for (let phase0Round = 1; phase0Round <= PHASE_0_ROUNDS; phase0Round++) {
    roundNumber++;
    await runBenchmarkRound(models, roundNumber, totalRounds, symbolId, clockState.currentTime);
    clockState = advanceClock();
  }

  // Run Phase 0 elimination
  runPhase0(models);

  // ========== PHASE 1: 12 more rounds (7-18) ==========
  logger.newline();
  logger.log('--- Starting Phase 1 rounds (7-18) ---');
  for (let phase1Round = 1; phase1Round <= PHASE_1_ROUNDS; phase1Round++) {
    roundNumber++;
    await runBenchmarkRound(models, roundNumber, totalRounds, symbolId, clockState.currentTime);
    clockState = advanceClock();
  }

  // Run Phase 1 elimination
  runPhase1(models);

  // ========== PHASE 2: 24 more rounds (19-42) ==========
  logger.newline();
  logger.log('--- Starting Phase 2 rounds (19-42) ---');
  for (let phase2Round = 1; phase2Round <= PHASE_2_ROUNDS; phase2Round++) {
    roundNumber++;
    await runBenchmarkRound(models, roundNumber, totalRounds, symbolId, clockState.currentTime);
    clockState = advanceClock();
  }

  // Run Phase 2 elimination
  runPhase2(models);

  // ========== PHASE 3: Final ranking (no additional rounds) ==========
  const arenaCompetitors = runPhase3(models);

  logger.newline();
  logger.log('=== Benchmark Complete ===');
  logger.log(`Total rounds: ${String(roundNumber)}`);
  logger.log(`Final arena size: ${String(arenaCompetitors.length)}`);
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
