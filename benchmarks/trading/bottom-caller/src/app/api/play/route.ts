import { runRound } from '@nullagent/agent-core';
import { NextResponse } from 'next/server';

import {
  advanceClock,
  getClockState,
  initializeClock,
  resetClockState,
} from '@/clock-state';
import { computeFillGroundTruth } from '@/ground-truth/fill-checker';
import {
  clearMarketMakerContext,
  marketMaker,
  setMarketMakerContext,
} from '@/market-maker';
import { getForecastingCharts } from '@/replay-lab/charts';
import {
  formatOrderbookForPrompt,
  getBestBidAsk,
  getOrderbookSnapshot,
} from '@/replay-lab/orderbook';
import { getTrades } from '@/replay-lab/trades';
import { forecastScorer } from '@/scorers/aggregate-scorer';

import type { MarketMakerOutput } from '@/market-maker';
import type { FillContractId } from '@/scorers/types';

export const dynamic = 'force-dynamic';

interface PlayRequest {
  action: 'start' | 'step' | 'reset';
}

interface PlayResponse {
  success: boolean;
  clockState: {
    currentTime: string;
    roundNumber: number;
    startTime: string;
  };
  prediction?: {
    reasoning: string;
    predictions: Record<FillContractId, number>;
  };
  groundTruth?: Record<FillContractId, boolean>;
  score?: {
    meanBrierScore: number;
    meanLogLoss: number;
    accuracy: number;
    monotonicityViolations: number;
  };
  error?: string;
}

function formatClockState(state: {
  currentTime: Date;
  roundNumber: number;
  startTime: Date;
}): PlayResponse['clockState'] {
  return {
    currentTime: state.currentTime.toISOString(),
    roundNumber: state.roundNumber,
    startTime: state.startTime.toISOString(),
  };
}

export async function POST(request: Request): Promise<NextResponse<PlayResponse>> {
  const body = (await request.json()) as PlayRequest;
  const { action } = body;

  const symbolId = process.env['SYMBOL_ID'];
  if (symbolId === undefined || symbolId === '') {
    return NextResponse.json(
      {
        success: false,
        clockState: { currentTime: '', roundNumber: 0, startTime: '' },
        error: 'SYMBOL_ID environment variable is required',
      },
      { status: 500 }
    );
  }

  switch (action) {
    case 'reset': {
      resetClockState();
      const clockState = initializeClock();
      return NextResponse.json({
        success: true,
        clockState: formatClockState(clockState),
      });
    }

    case 'start': {
      const clockState = initializeClock();
      return NextResponse.json({
        success: true,
        clockState: formatClockState(clockState),
      });
    }

    case 'step': {
      const clockState = getClockState();
      const predictionTime = clockState.currentTime;

      // Get chart data
      const charts = await getForecastingCharts(symbolId, predictionTime);

      // Get orderbook data and compute best bid/ask
      const orderbook = await getOrderbookSnapshot(symbolId, predictionTime);
      const orderbookData = formatOrderbookForPrompt(orderbook);
      const { bestBid, bestAsk } = getBestBidAsk(orderbook);

      // Set context and run agent (bestBid/bestAsk included in orderbookData string)
      // Map horizon-based charts to market-maker expected format
      // TODO: Update market-maker to use chartByHorizon directly
      setMarketMakerContext({
        chart4h5mUrl: charts.chartByHorizon['15m'],
        chart24h15mUrl: charts.chartByHorizon['1h'],
        orderbookData,
        currentTime: predictionTime.toISOString(),
        symbolId,
      });

      const result = await runRound(marketMaker);
      clearMarketMakerContext();

      const output = result.output as MarketMakerOutput;

      // Get trades for the 15-minute window (covers all horizons)
      const horizonEnd = new Date(predictionTime.getTime() + 15 * 60 * 1000);
      const trades = await getTrades(symbolId, predictionTime, horizonEnd);

      // Compute fill ground truth
      const groundTruth = computeFillGroundTruth(
        trades,
        bestBid,
        bestAsk,
        predictionTime
      );

      // Score the predictions
      const scoreResult = await forecastScorer.score({
        predictions: output.predictions as Record<FillContractId, number>,
        actuals: groundTruth as Record<FillContractId, boolean>,
        predictionTime,
        symbolId,
      });

      // Advance clock for next round
      advanceClock();
      const newClockState = getClockState();

      return NextResponse.json({
        success: true,
        clockState: formatClockState(newClockState),
        prediction: {
          reasoning: output.reasoning ?? '',
          predictions: output.predictions as Record<FillContractId, number>,
        },
        groundTruth: groundTruth as Record<FillContractId, boolean>,
        score: {
          meanBrierScore: scoreResult.aggregates.meanBrierScore,
          meanLogLoss: scoreResult.aggregates.meanLogLoss,
          accuracy: scoreResult.aggregates.accuracy,
          monotonicityViolations: scoreResult.aggregates.monotonicityViolations,
        },
      });
    }

    default:
      return NextResponse.json(
        {
          success: false,
          clockState: { currentTime: '', roundNumber: 0, startTime: '' },
          error: `Unknown action: ${String(action)}`,
        },
        { status: 400 }
      );
  }
}
