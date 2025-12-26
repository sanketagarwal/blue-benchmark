/* eslint-disable no-console -- CLI benchmark tool requires console output */
import { runRound } from '@nullagent/agent-core';

import {
  initializeClock,
  advanceClock,
  getPredictionWindow,
  resetClockState,
} from './clock-state.js';
import { forecaster, setForecastContext, clearForecastContext } from './forecaster.js';
import { getGroundTruthBatch } from './replay-lab/annotations.js';
import { getForecastingCharts } from './replay-lab/charts.js';
import { getOrderbookSnapshot, formatOrderbookForPrompt } from './replay-lab/orderbook.js';
import { forecastScorer } from './scorers/aggregate-scorer.js';

import type { ForecastOutput } from './forecaster.js';
import type { ContractId } from './scorers/types.js';

const BENCHMARK_ROUNDS = 3;

interface RoundScore {
  roundNumber: number;
  brier: number;
  logLoss: number;
  accuracy: number;
}

async function main(): Promise<void> {
  console.log('agent_003 Benchmark');
  console.log('===================\n');

  const symbolId = process.env['SYMBOL_ID'];
  if (symbolId === undefined || symbolId === '') {
    throw new Error('SYMBOL_ID environment variable is required');
  }

  // eslint-disable-next-line turbo/no-undeclared-env-vars -- MODEL_ID is set dynamically per benchmark run
  const modelId = process.env['MODEL_ID'];
  if (modelId === undefined || modelId === '') {
    throw new Error('MODEL_ID environment variable is required');
  }

  resetClockState();
  let clockState = initializeClock();

  console.log(`Symbol: ${symbolId}`);
  console.log(`Model: ${modelId}`);
  console.log(`Start Time: ${clockState.currentTime.toISOString()}`);
  console.log(`Rounds: ${String(BENCHMARK_ROUNDS)}\n`);

  const scores: RoundScore[] = [];

  for (let round = 1; round <= BENCHMARK_ROUNDS; round++) {
    console.log(`Round ${String(round)}/${String(BENCHMARK_ROUNDS)} (${clockState.currentTime.toISOString()})`);

    const charts = await getForecastingCharts(symbolId, clockState.currentTime);
    const orderbook = await getOrderbookSnapshot(symbolId, clockState.currentTime);
    const orderbookData = formatOrderbookForPrompt(orderbook);

    setForecastContext({
      chart4h5mUrl: charts.chart4h5m,
      chart24h15mUrl: charts.chart24h15m,
      orderbookData,
      currentTime: clockState.currentTime.toISOString(),
      symbolId,
    });

    const result = await runRound(forecaster);
    clearForecastContext();

    const output = result.output as ForecastOutput;
    const predictionWindow = getPredictionWindow();

    const groundTruth = await getGroundTruthBatch(
      symbolId,
      predictionWindow.from,
      predictionWindow.to
    );

    const scoreResult = await forecastScorer.score({
      predictions: output.predictions as Record<ContractId, number>,
      actuals: groundTruth as Record<ContractId, boolean>,
      predictionTime: clockState.currentTime,
      symbolId,
    });

    scores.push({
      roundNumber: round,
      brier: scoreResult.aggregates.meanBrierScore,
      logLoss: scoreResult.aggregates.meanLogLoss,
      accuracy: scoreResult.aggregates.accuracy,
    });

    console.log(`  Brier=${scoreResult.aggregates.meanBrierScore.toFixed(3)}, Accuracy=${(scoreResult.aggregates.accuracy * 100).toFixed(1)}%`);

    clockState = advanceClock();
    console.log('');
  }

  // Calculate averages
  const avgBrier = scores.map((s) => s.brier).reduce((sum, value) => sum + value, 0) / scores.length;
  const avgLogLoss = scores.map((s) => s.logLoss).reduce((sum, value) => sum + value, 0) / scores.length;
  const avgAccuracy = scores.map((s) => s.accuracy).reduce((sum, value) => sum + value, 0) / scores.length;

  // Print results table
  console.log('Results');
  console.log('-------');
  console.log(`Model: ${modelId}`);
  console.log(`Average Brier Score: ${avgBrier.toFixed(3)}`);
  console.log(`Average Log Loss: ${avgLogLoss.toFixed(3)}`);
  console.log(`Average Accuracy: ${(avgAccuracy * 100).toFixed(1)}%`);
}

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
