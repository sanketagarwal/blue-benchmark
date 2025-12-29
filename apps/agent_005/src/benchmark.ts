/* eslint-disable no-console -- CLI benchmark tool requires console output */
import { runRound } from '@nullagent/agent-core';

import {
  initializeClock,
  advanceClock,
  resetClockState,
} from './clock-state.js';
import { computeFillGroundTruth } from './ground-truth/fill-checker.js';
import { createMarketMaker, setMarketMakerContext, clearMarketMakerContext } from './market-maker.js';
import { MODEL_MATRIX, BENCHMARK_ROUNDS } from './matrix.js';
import { getForecastingCharts } from './replay-lab/charts.js';
import { getOrderbookSnapshot, formatOrderbookForPrompt, getBestBidAsk } from './replay-lab/orderbook.js';
import { getTrades } from './replay-lab/trades.js';
import { calculateModelSummary, findWinner } from './results.js';
import { forecastScorer } from './scorers/aggregate-scorer.js';
import { printResultsTable } from './table.js';

import type { ModelId } from './matrix.js';
import type { BenchmarkResults, ModelResults, RoundResult } from './results.js';
import type { FillContractId } from './scorers/types.js';

const isVerbose = process.argv.includes('--verbose');

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

  // Fetch trades from prediction time to +15 minutes (covers all horizons)
  const horizonEnd = new Date(predictionTime.getTime() + 15 * 60 * 1000);
  const trades = await getTrades(symbolId, predictionTime, horizonEnd);

  // Compute fill ground truth using best bid/ask from orderbook
  const groundTruth = computeFillGroundTruth(
    trades,
    bestBid,
    bestAsk,
    predictionTime
  );

  const scoreResult = await forecastScorer.score({
    predictions: output.predictions as Record<FillContractId, number>,
    actuals: groundTruth as Record<FillContractId, boolean>,
    predictionTime,
    symbolId,
  });

  if (isVerbose) {
    console.log(`\n  ${modelId}:`);
    console.log(`    Predictions: ${JSON.stringify(output.predictions)}`);
    console.log(`    Brier=${scoreResult.aggregates.meanBrierScore.toFixed(3)}, Accuracy=${(scoreResult.aggregates.accuracy * 100).toFixed(1)}%`);
  } else {
    console.log(
      `  ${modelId}: Brier=${scoreResult.aggregates.meanBrierScore.toFixed(3)}, Accuracy=${(scoreResult.aggregates.accuracy * 100).toFixed(1)}%`
    );
  }

  return {
    roundNumber,
    score: scoreResult,
  };
}

async function main(): Promise<void> {
  console.log('agent_005 Model Matrix Benchmark');
  console.log('================================\n');

  const startTime = new Date().toISOString();

  // Get symbol from env
  const symbolId = process.env['SYMBOL_ID'];
  if (symbolId === undefined || symbolId === '') {
    throw new Error('SYMBOL_ID environment variable is required');
  }

  // Initialize clock
  resetClockState();
  let clockState = initializeClock();

  console.log(`Symbol: ${symbolId}`);
  console.log(`Start Time: ${clockState.currentTime.toISOString()}`);
  console.log(`Models: ${MODEL_MATRIX.join(', ')}`);
  console.log(`Rounds: ${String(BENCHMARK_ROUNDS)}\n`);

  // Initialize results tracking
  const modelResults = new Map<ModelId, RoundResult[]>();
  for (const modelId of MODEL_MATRIX) {
    modelResults.set(modelId, []);
  }

  // Run benchmark rounds
  for (let round = 1; round <= BENCHMARK_ROUNDS; round++) {
    console.log(`Round ${String(round)}/${String(BENCHMARK_ROUNDS)} (${clockState.currentTime.toISOString()})`);

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

    // Run each model sequentially
    for (const modelId of MODEL_MATRIX) {
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
    console.log('');
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
  console.log('');
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
/* eslint-enable no-console -- Re-enable console rule after CLI benchmark output */
