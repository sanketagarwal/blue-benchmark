import { defineScorer } from '@nullagent/scorers';

import { brierScore, meanBrierScore } from './brier-scorer.js';
import { logLoss, meanLogLoss } from './log-loss-scorer.js';

import type { ContractId, ForecastScorerInput, ForecastScoreResult, ContractScore } from './types.js';

export const CONTRACT_IDS: ContractId[] = [
  'dump-simple-15m-1pct',
  'dump-simple-15m-3pct',
  'dump-simple-15m-5pct',
  'dump-simple-1h-0.5pct',
  'dump-simple-1h-1pct',
  'dump-vol-adjusted-15m-z2',
  'dump-vol-adjusted-1h-z2',
  'dump-drawdown-1pct',
  'dump-drawdown-3pct',
];

function scorePerContract(
  predictions: Record<ContractId, number>,
  actuals: Record<ContractId, boolean>
): { perContract: ContractScore[]; predictionArray: number[]; actualArray: boolean[] } {
  const perContract: ContractScore[] = [];
  const predictionArray: number[] = [];
  const actualArray: boolean[] = [];

  for (const contractId of CONTRACT_IDS) {
    // eslint-disable-next-line security/detect-object-injection -- ContractId is a controlled enum type, not user input
    const predicted = predictions[contractId];
    // eslint-disable-next-line security/detect-object-injection -- ContractId is a controlled enum type, not user input
    const actual = actuals[contractId];

    if (typeof predicted !== 'number') {
      throw new TypeError(`Missing prediction for contract ${contractId}`);
    }
    if (typeof actual !== 'boolean') {
      throw new TypeError(`Missing actual for contract ${contractId}`);
    }

    predictionArray.push(predicted);
    actualArray.push(actual);

    perContract.push({
      contractId,
      predicted,
      actual,
      brierScore: brierScore(predicted, actual),
      logLoss: logLoss(predicted, actual),
    });
  }

  return { perContract, predictionArray, actualArray };
}

export const forecastScorer = defineScorer<ForecastScorerInput, ForecastScoreResult>({
  id: 'forecast_scorer',
  name: 'Forecast Scorer',
  score(input): ForecastScoreResult {
    const { predictions, actuals } = input;

    const { perContract, predictionArray, actualArray } = scorePerContract(predictions, actuals);

    const meanBrier = meanBrierScore(predictionArray, actualArray);
    const meanLL = meanLogLoss(predictionArray, actualArray);

    let correctPredictions = 0;
    for (const contractScore of perContract) {
      const predictedOutcome = contractScore.predicted >= 0.5;
      if (predictedOutcome === contractScore.actual) {
        correctPredictions += 1;
      }
    }
    const accuracy = correctPredictions / CONTRACT_IDS.length;

    let eventsOccurred = 0;
    for (const contractScore of perContract) {
      if (contractScore.actual) {
        eventsOccurred += 1;
      }
    }

    return {
      score: meanBrier,
      aggregates: {
        meanBrierScore: meanBrier,
        meanLogLoss: meanLL,
        accuracy,
        eventsOccurred,
      },
      perContract,
    };
  },
});
