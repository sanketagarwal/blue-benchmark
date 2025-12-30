import { runRound } from '@nullagent/agent-core';
import { createBenchmarkLogger } from '@nullagent/cli-utils';

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
  const logger = createBenchmarkLogger(process.argv.includes('--verbose'));

  logger.header('agent_003 Benchmark');

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

  logger.log(`Symbol: ${symbolId}`);
  logger.log(`Model: ${modelId}`);
  logger.log(`Start Time: ${clockState.currentTime.toISOString()}`);
  logger.log(`Rounds: ${String(BENCHMARK_ROUNDS)}\n`);

  const scores: RoundScore[] = [];

  for (let round = 1; round <= BENCHMARK_ROUNDS; round++) {
    logger.startSpinner(`Round ${String(round)}/${String(BENCHMARK_ROUNDS)}: Fetching market data...`);
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

    logger.updateSpinner(`Round ${String(round)}/${String(BENCHMARK_ROUNDS)}: Calling LLM...`);
    const result = await runRound(forecaster);
    clearForecastContext();

    const output = result.output as ForecastOutput;
    const predictionWindow = getPredictionWindow();

    logger.updateSpinner(`Round ${String(round)}/${String(BENCHMARK_ROUNDS)}: Scoring...`);
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

    logger.succeedSpinner(`Round ${String(round)}/${String(BENCHMARK_ROUNDS)}: Complete`);

    logger.logPredictions(output.predictions);
    logger.logGroundTruth(groundTruth, output.predictions);
    logger.logScores({
      brier: scoreResult.aggregates.meanBrierScore,
      logLoss: scoreResult.aggregates.meanLogLoss,
      accuracy: scoreResult.aggregates.accuracy,
    });

    scores.push({
      roundNumber: round,
      brier: scoreResult.aggregates.meanBrierScore,
      logLoss: scoreResult.aggregates.meanLogLoss,
      accuracy: scoreResult.aggregates.accuracy,
    });

    clockState = advanceClock();
  }

  // Calculate averages
  const avgBrier = scores.map((s) => s.brier).reduce((sum, value) => sum + value, 0) / scores.length;
  const avgLogLoss = scores.map((s) => s.logLoss).reduce((sum, value) => sum + value, 0) / scores.length;
  const avgAccuracy = scores.map((s) => s.accuracy).reduce((sum, value) => sum + value, 0) / scores.length;

  logger.summary({
    Model: modelId,
    'Average Brier Score': avgBrier,
    'Average Log Loss': avgLogLoss,
    'Average Accuracy': `${(avgAccuracy * 100).toFixed(1)}%`,
  });
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
