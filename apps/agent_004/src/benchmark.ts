import { runRound } from '@nullagent/agent-core';

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
import type { ForecastOutput } from './forecaster.js';
import type { BenchmarkResults, ModelResults, RoundResult } from './results.js';
import type { ContractId } from './scorers/types.js';

async function runModelRound(
  modelId: ModelId,
  symbolId: string,
  roundNumber: number
): Promise<RoundResult> {
  // Set MODEL_ID env var for this model
  process.env['MODEL_ID'] = modelId;

  const forecaster = createForecaster(modelId);
  const result = await runRound(forecaster);
  const output = result.output as ForecastOutput;

  const predictionWindow = getPredictionWindow();
  const groundTruth = await getGroundTruthBatch(
    symbolId,
    predictionWindow.from,
    predictionWindow.to
  );

  const scoreResult = forecastScorer.score({
    predictions: output.predictions as Record<ContractId, number>,
    actuals: groundTruth as Record<ContractId, boolean>,
    predictionTime: predictionWindow.from,
    symbolId,
  });

  console.log(`  ${modelId}: Brier=${scoreResult.aggregates.meanBrierScore.toFixed(3)}, Accuracy=${(scoreResult.aggregates.accuracy * 100).toFixed(1)}%`);

  return {
    roundNumber,
    score: scoreResult,
  };
}

async function main(): Promise<void> {
  console.log('agent_004 Model Matrix Benchmark');
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
  const modelResults: Map<ModelId, RoundResult[]> = new Map();
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
      const roundResult = await runModelRound(modelId, symbolId, round);
      modelResults.get(modelId)?.push(roundResult);
    }

    // Clear context
    clearForecastContext();

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

main().catch((error: unknown) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
