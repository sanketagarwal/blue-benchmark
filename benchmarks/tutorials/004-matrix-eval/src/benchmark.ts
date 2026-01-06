import { runRound } from '@nullagent/agent-core';
import { createBenchmarkLogger } from '@nullagent/cli-utils';

import {
  initializeClock,
  advanceClock,
  getPredictionWindow,
  resetClockState,
} from './clock-state.js';
import { createForecaster, setForecastContext, clearForecastContext } from './forecaster.js';
import { MODEL_MATRIX, BENCHMARK_ROUNDS } from './matrix.js';
import { getGroundTruthBatch } from './replay-lab/annotations.js';
import { getForecastingCharts } from './replay-lab/charts.js';
import { getOrderbookSnapshot, formatOrderbookForPrompt } from './replay-lab/orderbook.js';
import { calculateModelSummary, findWinner } from './results.js';
import { forecastScorer } from './scorers/aggregate-scorer.js';
import { printResultsTable } from './table.js';

import type { ModelId } from './matrix.js';
import type { BenchmarkResults, ModelResults, RoundResult } from './results.js';
import type { ContractId } from './scorers/types.js';

// Create logger with --verbose flag support
const logger = createBenchmarkLogger(process.argv.includes('--verbose'));

async function runModelRound(
  modelId: ModelId,
  symbolId: string,
  roundNumber: number
): Promise<RoundResult> {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- MODEL_ID is set dynamically per model in benchmark
  process.env['MODEL_ID'] = modelId;

  const forecaster = createForecaster(modelId);
  const result = await runRound(forecaster);
  const output = result.output;

  // Verbose: show model's reasoning and predictions
  logger.log(`\n  [${modelId}] Reasoning: ${output.reasoning}`);
  logger.log(`  [${modelId}] Predictions:`);
  for (const [contract, probability] of Object.entries(output.predictions)) {
    logger.log(`    ${contract}: ${probability.toFixed(3)}`);
  }

  const predictionWindow = getPredictionWindow();
  const groundTruth = await getGroundTruthBatch(
    symbolId,
    predictionWindow.from,
    predictionWindow.to
  );

  const scoreResult = await forecastScorer.score({
    predictions: output.predictions as Record<ContractId, number>,
    actuals: groundTruth as Record<ContractId, boolean>,
    predictionTime: predictionWindow.from,
    symbolId,
  });

  logger.log(
    `  ${modelId}: Brier=${scoreResult.aggregates.meanBrierScore.toFixed(3)}, Accuracy=${(scoreResult.aggregates.accuracy * 100).toFixed(1)}%`
  );

  return {
    roundNumber,
    score: scoreResult,
  };
}

async function main(): Promise<void> {
  logger.header('agent_004 Model Matrix Benchmark');
  logger.objective('Compare LLM model performance on identical forecasting tasks');

  const startTime = new Date().toISOString();

  // Get symbol from env
  const symbolId = process.env['SYMBOL_ID'];
  if (symbolId === undefined || symbolId === '') {
    throw new Error('SYMBOL_ID environment variable is required');
  }

  // Initialize clock
  resetClockState();
  let clockState = initializeClock();

  logger.log(`Symbol: ${symbolId}`);
  logger.log(`Start Time: ${clockState.currentTime.toISOString()}`);
  logger.log(`Models: ${MODEL_MATRIX.join(', ')}`);
  logger.log(`Rounds: ${String(BENCHMARK_ROUNDS)}`);

  // Initialize results tracking
  const modelResults = new Map<ModelId, RoundResult[]>();
  for (const modelId of MODEL_MATRIX) {
    modelResults.set(modelId, []);
  }

  // Run benchmark rounds
  for (let round = 1; round <= BENCHMARK_ROUNDS; round++) {
    logger.startSpinner(`Round ${String(round)}/${String(BENCHMARK_ROUNDS)} (${clockState.currentTime.toISOString()})`);

    // Fetch data once for this round
    const charts = await getForecastingCharts(symbolId, clockState.currentTime);
    const orderbook = await getOrderbookSnapshot(symbolId, clockState.currentTime);
    const orderbookData = formatOrderbookForPrompt(orderbook);

    // Set context for all models
    setForecastContext({
      chart4h5mUrl: charts.chart4h5m,
      chart24h15mUrl: charts.chart24h15m,
      orderbookData,
      currentTime: clockState.currentTime.toISOString(),
      symbolId,
    });

    // Run each model sequentially
    for (const modelId of MODEL_MATRIX) {
      logger.updateSpinner(`Round ${String(round)}/${String(BENCHMARK_ROUNDS)} - ${modelId}`);
      const roundResult = await runModelRound(modelId, symbolId, round);
      modelResults.get(modelId)?.push(roundResult);
    }

    // Clear context
    clearForecastContext();

    // Advance clock for next round
    clockState = advanceClock();
    logger.succeedSpinner(`Round ${String(round)}/${String(BENCHMARK_ROUNDS)} complete`);
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

  // Print results table (always displayed)
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
