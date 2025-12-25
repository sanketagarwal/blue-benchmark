import { runRound } from '@nullagent/agent-core';
import { NextResponse } from 'next/server';

import {
  initializeClock,
  advanceClock,
  getPredictionWindow,
} from '../../../clock-state';
import { forecaster, setForecastContext, clearForecastContext } from '../../../forecaster';
import { getGroundTruthBatch } from '../../../replay-lab/annotations';
import { getForecastingCharts } from '../../../replay-lab/charts';
import { getOrderbookSnapshot, formatOrderbookForPrompt } from '../../../replay-lab/orderbook';
import { forecastScorer } from '../../../scorers/aggregate-scorer';

import type { ForecastOutput } from '../../../forecaster';
import type { GroundTruth } from '../../../replay-lab/annotations';
import type { ContractId } from '../../../scorers/types';

export async function POST(): Promise<NextResponse> {
  try {
    // 1. Initialize or get clock state
    const clockState = initializeClock();

    // 2. Get symbol from env
    const symbolId = process.env['SYMBOL_ID'];
    if (symbolId === undefined || symbolId === '') {
      throw new Error('SYMBOL_ID environment variable is required');
    }

    // 3. Get signed chart URLs (4hr/5m and 24hr/15m with indicators)
    const charts = await getForecastingCharts(symbolId, clockState.currentTime);

    // 4. Get orderbook snapshot at current time
    const orderbook = await getOrderbookSnapshot(symbolId, clockState.currentTime);
    const orderbookData = formatOrderbookForPrompt(orderbook);

    // 5. Set forecast context
    setForecastContext({
      chart4h5mUrl: charts.chart4h5m,
      chart24h15mUrl: charts.chart24h15m,
      orderbookData,
      currentTime: clockState.currentTime.toISOString(),
      symbolId,
    });

    // 6. Run forecaster agent
    const result = await runRound(forecaster);

    // 7. Clear context
    clearForecastContext();

    // 8. Get prediction window
    const predictionWindow = getPredictionWindow();

    // 9. Get ground truth (actual outcomes)
    const groundTruth: GroundTruth = await getGroundTruthBatch(
      symbolId,
      predictionWindow.from,
      predictionWindow.to
    );

    const output = result.output as ForecastOutput;

    // 10. Score the predictions against ground truth
    const scoreResult = await forecastScorer.score({
      predictions: output.predictions as Record<ContractId, number>,
      actuals: groundTruth as Record<ContractId, boolean>,
      predictionTime: clockState.currentTime,
      symbolId,
    });

    // 11. Advance clock for next round
    advanceClock();

    // 12. Return response
    return NextResponse.json({
      success: true,
      roundNumber: clockState.roundNumber,
      simulationTime: clockState.currentTime.toISOString(),
      symbolId,
      chartUrls: {
        chart4h5m: charts.chart4h5m,
        chart24h15m: charts.chart24h15m,
      },
      predictions: output.predictions,
      reasoning: output.reasoning,
      groundTruth,
      score: {
        brierScore: scoreResult.aggregates.meanBrierScore,
        logLoss: scoreResult.aggregates.meanLogLoss,
        accuracy: scoreResult.aggregates.accuracy,
        eventsOccurred: scoreResult.aggregates.eventsOccurred,
        perContract: scoreResult.perContract,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
