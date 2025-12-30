import { runRound } from '@nullagent/agent-core';
import { createBenchmarkLogger } from '@nullagent/cli-utils';

import {
  initializeClock,
  advanceClock,
  resetClockState,
} from './clock-state.js';
import { computeExtendedFillGroundTruth } from './ground-truth/fill-checker.js';
import { createMarketMaker, setMarketMakerContext, clearMarketMakerContext } from './market-maker.js';
import { MODEL_MATRIX, BENCHMARK_ROUNDS } from './matrix.js';
import { getForecastingCharts } from './replay-lab/charts.js';
import { getMidPriceAtTime, getMidPriceChange } from './replay-lab/mid-price.js';
import { getOrderbookSnapshot, formatOrderbookForPrompt, getBestBidAsk } from './replay-lab/orderbook.js';
import { getTrades } from './replay-lab/trades.js';
import { calculateModelSummary, findWinner } from './results.js';
import { forecastScorer } from './scorers/aggregate-scorer.js';
import { printResultsTable } from './table.js';

import type { FillCheckResult } from './ground-truth/fill-checker.js';
import type { ModelId } from './matrix.js';
import type { Trade } from './replay-lab/trades.js';
import type { BenchmarkResults, ModelResults, RoundResult } from './results.js';
import type { DeltaMidContractId, FillContractId } from './scorers/types.js';

const logger = createBenchmarkLogger(process.argv.includes('--verbose'));

// Horizon mappings in milliseconds
const HORIZON_MS = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
} as const;

type Horizon = keyof typeof HORIZON_MS;
type Side = 'bid' | 'ask';

/**
 * Computes delta-mid ground truth for all contracts where fill occurred.
 * Returns undefined for contracts where no fill happened.
 *
 * @param trades - Array of trades to compute mid prices from
 * @param fillDetails - Fill details for each contract from extended ground truth
 * @returns Record mapping delta-mid contract IDs to price changes (undefined if no fill)
 */
function computeDeltaMidActuals(
  trades: Trade[],
  fillDetails: Record<string, FillCheckResult>
): Record<DeltaMidContractId, number | undefined> {
  const result: Record<string, number | undefined> = {};

  const sides: Side[] = ['bid', 'ask'];
  const horizons: Horizon[] = ['1m', '5m', '15m'];

  for (const side of sides) {
    for (const horizon of horizons) {
      const fillContractId = `${side}-fill-${horizon}` as FillContractId;
      const deltaMidContractId = `${side}-delta-mid-${horizon}` as DeltaMidContractId;
      // eslint-disable-next-line security/detect-object-injection -- fillContractId is constructed from controlled enum values
      const fillDetail = fillDetails[fillContractId];
      const fillTime = fillDetail?.fillTime;

      if (fillDetail !== undefined && fillDetail.filled && fillTime !== undefined) {
        // eslint-disable-next-line security/detect-object-injection -- horizonMs lookup uses controlled enum key
        const horizonMs = HORIZON_MS[horizon];
        const deltaMid = getMidPriceChange(trades, fillTime, horizonMs);
        // eslint-disable-next-line security/detect-object-injection -- deltaMidContractId is constructed from controlled enum values
        result[deltaMidContractId] = deltaMid;
      } else {
        // eslint-disable-next-line security/detect-object-injection -- deltaMidContractId is constructed from controlled enum values
        result[deltaMidContractId] = undefined;
      }
    }
  }

  return result as Record<DeltaMidContractId, number | undefined>;
}

/**
 * Computes exit mid prices for PnL calculation.
 * For each filled contract, gets the mid price at fillTime + horizon.
 *
 * @param trades - Array of trades to compute mid prices from
 * @param fillDetails - Fill details for each contract from extended ground truth
 * @returns Record mapping fill contract IDs to exit mid prices (undefined if no fill or no data)
 */
function computeExitMids(
  trades: Trade[],
  fillDetails: Record<string, FillCheckResult>
): Record<FillContractId, number | undefined> {
  const result: Record<string, number | undefined> = {};

  const sides: Side[] = ['bid', 'ask'];
  const horizons: Horizon[] = ['1m', '5m', '15m'];

  for (const side of sides) {
    for (const horizon of horizons) {
      const fillContractId = `${side}-fill-${horizon}` as FillContractId;
      // eslint-disable-next-line security/detect-object-injection -- fillContractId is constructed from controlled enum values
      const fillDetail = fillDetails[fillContractId];
      const fillTime = fillDetail?.fillTime;

      if (fillDetail !== undefined && fillDetail.filled && fillTime !== undefined) {
        // eslint-disable-next-line security/detect-object-injection -- horizonMs lookup uses controlled enum key
        const horizonMs = HORIZON_MS[horizon];
        const exitTime = new Date(fillTime.getTime() + horizonMs);
        const exitMid = getMidPriceAtTime(trades, exitTime);
        // eslint-disable-next-line security/detect-object-injection -- fillContractId is constructed from controlled enum values
        result[fillContractId] = exitMid;
      } else {
        // eslint-disable-next-line security/detect-object-injection -- fillContractId is constructed from controlled enum values
        result[fillContractId] = undefined;
      }
    }
  }

  return result as Record<FillContractId, number | undefined>;
}

async function runModelRound(
  modelId: ModelId,
  symbolId: string,
  roundNumber: number,
  bestBid: number,
  bestAsk: number,
  predictionTime: Date
): Promise<RoundResult> {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- MODEL_ID is set dynamically per model in benchmark
  process.env['MODEL_ID'] = modelId;

  const marketMaker = createMarketMaker(modelId);
  const result = await runRound(marketMaker);
  const output = result.output;

  // Fetch trades from prediction time to +30 minutes
  // This covers: max fill horizon (15m) + max exit horizon (15m) = 30m total
  // Exit mid is computed at fillTime + horizon, so a fill at minute 14 with 15m horizon
  // needs trade data at minute 29
  const tradeWindowEnd = new Date(predictionTime.getTime() + 30 * 60 * 1000);
  const trades = await getTrades(symbolId, predictionTime, tradeWindowEnd);

  // Compute extended fill ground truth using best bid/ask from orderbook
  const extendedGroundTruth = computeExtendedFillGroundTruth(
    trades,
    bestBid,
    bestAsk,
    predictionTime
  );

  // Compute delta-mid ground truth for contracts where fill occurred
  const deltaMidActuals = computeDeltaMidActuals(trades, extendedGroundTruth.details);

  // Compute exit mids for PnL calculation
  const exitMids = computeExitMids(trades, extendedGroundTruth.details);

  const scoreResult = await forecastScorer.score({
    predictions: output.predictions as Record<FillContractId, number>,
    actuals: extendedGroundTruth.fills as Record<FillContractId, boolean>,
    predictionTime,
    symbolId,
    // Extended inputs for delta-mid, PnL, and EV calculations
    deltaMidPredictions: output.predictions as Record<string, number>,
    deltaMidActuals: deltaMidActuals as Record<string, number | undefined>,
    fillDetails: extendedGroundTruth.details as Record<string, { filled: boolean; fillPrice?: number }>,
    exitMids: exitMids as Record<string, number | undefined>,
    fillPrices: { bestBid, bestAsk },
  });

  // Stop spinner before verbose output to prevent interleaving
  logger.succeedSpinner(`${modelId}: Scored`);

  // Log verbose predictions and detailed metrics
  logger.logModelPredictions(modelId, output.predictions);
  logger.logBasicScoresInline(
    scoreResult.aggregates.meanBrierScore,
    scoreResult.aggregates.accuracy
  );

  // Log EV metrics with quality indicators
  logger.logEVMetrics({
    deltaMidMAE: scoreResult.deltaMidScores?.aggregates.meanMAE,
    deltaMidBias: scoreResult.deltaMidScores?.aggregates.meanBias,
    totalPnL: scoreResult.pnlResults?.totalPnL,
    meanPnL: scoreResult.pnlResults?.meanPnL,
    filledCount: scoreResult.pnlResults?.filledCount,
    totalEV: scoreResult.evResults?.totalEV,
    meanEV: scoreResult.evResults?.meanEV,
    evPnlGap: scoreResult.evPnlGap?.gap,
    systematicOverestimation: scoreResult.evPnlGap?.systematicOverestimation,
  });

  // Always show compact model score line in non-verbose mode
  logger.logModelScoreCompact(
    modelId,
    scoreResult.aggregates.meanBrierScore,
    scoreResult.aggregates.accuracy
  );

  return {
    roundNumber,
    score: scoreResult,
  };
}

async function main(): Promise<void> {
  logger.header('agent_005 Model Matrix Benchmark');

  const startTime = new Date().toISOString();

  // Get symbol from env
  const symbolId = process.env['SYMBOL_ID'];
  if (symbolId === undefined || symbolId === '') {
    throw new Error('SYMBOL_ID environment variable is required');
  }

  // Initialize clock
  resetClockState();
  let clockState = initializeClock();

  logger.logBenchmarkInfo({
    symbol: symbolId,
    startTime: clockState.currentTime.toISOString(),
    models: [...MODEL_MATRIX],
    rounds: BENCHMARK_ROUNDS,
  });

  // Show EV metric explanations in verbose mode
  logger.explainEVMetrics();

  // Initialize results tracking
  const modelResults = new Map<ModelId, RoundResult[]>();
  for (const modelId of MODEL_MATRIX) {
    modelResults.set(modelId, []);
  }

  // Run benchmark rounds
  for (let round = 1; round <= BENCHMARK_ROUNDS; round++) {
    logger.logRoundHeader(round, BENCHMARK_ROUNDS, clockState.currentTime);
    logger.startSpinner(`Round ${String(round)}/${String(BENCHMARK_ROUNDS)}: Fetching market data...`);

    // Fetch data once for this round
    const charts = await getForecastingCharts(symbolId, clockState.currentTime);
    const orderbook = await getOrderbookSnapshot(symbolId, clockState.currentTime);
    const orderbookData = formatOrderbookForPrompt(orderbook);
    const { bestBid, bestAsk } = getBestBidAsk(orderbook);

    // Set context for all models
    setMarketMakerContext({
      chart4h5mUrl: charts.chart4h5m,
      chart24h15mUrl: charts.chart24h15m,
      orderbookData,
      currentTime: clockState.currentTime.toISOString(),
      symbolId,
    });

    logger.succeedSpinner(`Round ${String(round)}/${String(BENCHMARK_ROUNDS)}: Market data loaded`);

    // Run each model sequentially
    for (const modelId of MODEL_MATRIX) {
      logger.startSpinner(`Round ${String(round)}/${String(BENCHMARK_ROUNDS)}: ${modelId} - Calling LLM...`);
      const roundResult = await runModelRound(
        modelId,
        symbolId,
        round,
        bestBid,
        bestAsk,
        clockState.currentTime
      );
      modelResults.get(modelId)?.push(roundResult);
    }

    // Clear context
    clearMarketMakerContext();

    // Advance clock for next round
    clockState = advanceClock();
  }

  const endTime = new Date().toISOString();

  // Build results
  const results: BenchmarkResults = {
    startTime,
    endTime,
    totalRounds: BENCHMARK_ROUNDS,
    models: MODEL_MATRIX.map((modelId): ModelResults => ({
      modelId,
      rounds: modelResults.get(modelId) ?? [],
    })),
  };

  // Calculate summaries
  const summaries = results.models.map((m) => calculateModelSummary(m));
  const winner = findWinner(summaries);

  // Print results table
  printResultsTable(summaries, BENCHMARK_ROUNDS, winner);
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
