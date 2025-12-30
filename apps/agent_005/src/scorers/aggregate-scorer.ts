import { defineScorer } from '@nullagent/scorers';

import { brierScore, meanBrierScore } from './brier-scorer';
import { scoreDeltaMidPredictions } from './delta-mid-scorer';
import { calculateAllEV, aggregateEV, calculateEVPnLGap } from './ev-calculator';
import { logLoss, meanLogLoss } from './log-loss-scorer';
import { checkMonotonicity } from './monotonicity-scorer';
import { calculateAllPnL, aggregatePnL } from './pnl-calculator';

import type { ContractId, ForecastScorerInput, ForecastScoreResult, ContractScore, RunningTally, FillContractId } from './types';

/**
 * All 6 fill prediction contract IDs
 * Predicts probability that a limit order at best bid/ask fills within timeframe
 */
export const CONTRACT_IDS: FillContractId[] = [
  'bid-fill-1m',
  'bid-fill-5m',
  'bid-fill-15m',
  'ask-fill-1m',
  'ask-fill-5m',
  'ask-fill-15m',
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

/**
 * Calculate accuracy at 0.5 threshold
 *
 * @param perContract - Array of per-contract scores
 * @returns Accuracy as a ratio of correct predictions
 */
function calculateAccuracy(perContract: ContractScore[]): number {
  let correctPredictions = 0;
  for (const contractScore of perContract) {
    const predictedOutcome = contractScore.predicted >= 0.5;
    if (predictedOutcome === contractScore.actual) {
      correctPredictions += 1;
    }
  }
  return correctPredictions / CONTRACT_IDS.length;
}

/**
 * Count events that occurred (fills)
 *
 * @param perContract - Array of per-contract scores
 * @returns Number of events that actually occurred
 */
function countEvents(perContract: ContractScore[]): number {
  let eventsOccurred = 0;
  for (const contractScore of perContract) {
    if (contractScore.actual) {
      eventsOccurred += 1;
    }
  }
  return eventsOccurred;
}

/**
 * Compute optional extended scoring metrics (delta-mid, PnL, EV)
 *
 * @param result - The forecast score result to extend with optional metrics
 * @param input - The full forecast scorer input containing optional fields
 */
function computeExtendedScores(
  result: ForecastScoreResult,
  input: ForecastScorerInput
): void {
  const { predictions, deltaMidPredictions, deltaMidActuals, fillDetails, exitMids, fillPrices } =
    input;

  // Optional: Delta-mid scoring
  if (deltaMidPredictions !== undefined && deltaMidActuals !== undefined) {
    result.deltaMidScores = scoreDeltaMidPredictions(deltaMidPredictions, deltaMidActuals);
  }

  // Optional: PnL calculation
  let pnlResultsRaw: ReturnType<typeof calculateAllPnL> | undefined;
  if (fillDetails !== undefined && exitMids !== undefined) {
    pnlResultsRaw = calculateAllPnL(fillDetails, exitMids);
    result.pnlResults = aggregatePnL(pnlResultsRaw);
  }

  // Optional: EV calculation
  let expectedValueResultsRaw: ReturnType<typeof calculateAllEV> | undefined;
  if (deltaMidPredictions !== undefined && fillPrices !== undefined) {
    expectedValueResultsRaw = calculateAllEV(predictions, deltaMidPredictions, fillPrices);
    result.evResults = aggregateEV(expectedValueResultsRaw);
  }

  // Optional: EV-PnL gap (requires both EV and PnL)
  if (expectedValueResultsRaw !== undefined && pnlResultsRaw !== undefined) {
    result.evPnlGap = calculateEVPnLGap(expectedValueResultsRaw, pnlResultsRaw);
  }
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

    // Check monotonicity violations
    const violations = checkMonotonicity(predictions);

    // Build base result
    const result: ForecastScoreResult = {
      score: meanBrier,
      aggregates: {
        meanBrierScore: meanBrier,
        meanLogLoss: meanLL,
        accuracy: calculateAccuracy(perContract),
        eventsOccurred: countEvents(perContract),
        monotonicityViolations: violations.length,
      },
      perContract,
      violations,
    };

    // Compute extended scoring metrics if inputs are provided
    computeExtendedScores(result, input);

    return result;
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
