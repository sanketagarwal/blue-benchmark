import { defineScorer } from '@nullagent/scorers';

import { brierScore, meanBrierScore } from './brier-scorer';
import { logLoss, meanLogLoss } from './log-loss-scorer';
import { checkMonotonicity } from './monotonicity-scorer';

import type { ContractId, ForecastScorerInput, ForecastScoreResult, ContractScore, RunningTally } from './types';

// All 9 CONTRACT_IDS (15m and 1h timeframes only)
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

    // Calculate per-contract scores
    const { perContract, predictionArray, actualArray } = scorePerContract(predictions, actuals);

    // Calculate aggregates
    const meanBrier = meanBrierScore(predictionArray, actualArray);
    const meanLL = meanLogLoss(predictionArray, actualArray);

    // Calculate accuracy (threshold = 0.5)
    let correctPredictions = 0;
    for (const contractScore of perContract) {
      const predictedOutcome = contractScore.predicted >= 0.5;
      if (predictedOutcome === contractScore.actual) {
        correctPredictions += 1;
      }
    }
    const accuracy = correctPredictions / CONTRACT_IDS.length;

    // Count events that occurred
    let eventsOccurred = 0;
    for (const contractScore of perContract) {
      if (contractScore.actual) {
        eventsOccurred += 1;
      }
    }

    // Check monotonicity violations
    const violations = checkMonotonicity(predictions);
    const monotonicityViolations = violations.length;

    return {
      score: meanBrier,
      aggregates: {
        meanBrierScore: meanBrier,
        meanLogLoss: meanLL,
        accuracy,
        eventsOccurred,
        monotonicityViolations,
      },
      perContract,
      violations,
    };
  },
});

export function createEmptyRunningTally(): RunningTally {
  const perContract: RunningTally['perContract'] = {} as RunningTally['perContract'];
  for (const contractId of CONTRACT_IDS) {
    // eslint-disable-next-line security/detect-object-injection -- ContractId is a controlled enum type, not user input
    perContract[contractId] = {
      totalPredictions: 0,
      totalBrierScore: 0,
      totalLogLoss: 0,
      timesEventOccurred: 0,
    };
  }

  return {
    roundsCompleted: 0,
    cumulativeBrierScore: 0,
    cumulativeLogLoss: 0,
    cumulativeAccuracy: 0,
    totalEventsOccurred: 0,
    totalViolations: 0,
    perContract,
  };
}

export function updateRunningTally(
  tally: RunningTally | undefined,
  roundScore: ForecastScoreResult,
  predictions: Record<ContractId, number>,
  actuals: Record<ContractId, boolean>
): RunningTally {
  // Initialize tally if undefined
  const currentTally = tally ?? createEmptyRunningTally();

  // Update cumulative scores
  const updatedTally: RunningTally = {
    roundsCompleted: currentTally.roundsCompleted + 1,
    cumulativeBrierScore: currentTally.cumulativeBrierScore + roundScore.aggregates.meanBrierScore,
    cumulativeLogLoss: currentTally.cumulativeLogLoss + roundScore.aggregates.meanLogLoss,
    cumulativeAccuracy: currentTally.cumulativeAccuracy + roundScore.aggregates.accuracy,
    totalEventsOccurred: currentTally.totalEventsOccurred + roundScore.aggregates.eventsOccurred,
    totalViolations: currentTally.totalViolations + roundScore.aggregates.monotonicityViolations,
    perContract: {} as RunningTally['perContract'],
  };

  // Update per-contract stats
  for (const contractId of CONTRACT_IDS) {
    // eslint-disable-next-line security/detect-object-injection -- ContractId is a controlled enum type, not user input
    const currentStats = currentTally.perContract[contractId];
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

    // eslint-disable-next-line security/detect-object-injection -- ContractId is a controlled enum type, not user input
    updatedTally.perContract[contractId] = {
      totalPredictions: currentStats.totalPredictions + 1,
      totalBrierScore: currentStats.totalBrierScore + brierScore(predicted, actual),
      totalLogLoss: currentStats.totalLogLoss + logLoss(predicted, actual),
      timesEventOccurred: currentStats.timesEventOccurred + (actual ? 1 : 0),
    };
  }

  return updatedTally;
}
