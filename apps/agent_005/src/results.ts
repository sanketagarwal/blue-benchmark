import type { ModelId } from './matrix.js';
import type { ForecastScoreResult } from './scorers/types.js';

export interface RoundResult {
  roundNumber: number;
  score: ForecastScoreResult;
}

export interface ModelResults {
  modelId: ModelId;
  rounds: RoundResult[];
}

export interface BenchmarkResults {
  startTime: string;
  endTime: string;
  totalRounds: number;
  models: ModelResults[];
}

export interface ModelSummary {
  modelId: ModelId;
  meanBrier: number;
  meanLogLoss: number;
  meanAccuracy: number;
  // EV benchmark metrics (optional - only present if ExtendedForecastScoreResult used)
  meanDeltaMAE?: number;
  meanEV?: number;
  meanPnL?: number;
  evPnLGap?: number;
}

/**
 * Checks if a score has extended EV benchmark metrics
 * @param score - The forecast score result to check
 * @returns True if the score contains extended EV benchmark metrics
 */
function hasExtendedMetrics(score: ForecastScoreResult): boolean {
  return (
    score.deltaMidScores !== undefined &&
    score.evResults !== undefined &&
    score.pnlResults !== undefined &&
    score.evPnlGap !== undefined
  );
}

/**
 * Aggregates extended EV metrics from a single round's score
 */
interface ExtendedMetricsTotals {
  totalDeltaMAE: number;
  totalExpectedValue: number;
  totalPnL: number;
  totalExpectedValuePnLGap: number;
  extendedRoundsCount: number;
}

/**
 * Aggregates extended EV metrics from a round score into the totals
 * @param score - The forecast score result with extended metrics
 * @param totals - The running totals to update
 */
function aggregateExtendedMetrics(
  score: ForecastScoreResult,
  totals: ExtendedMetricsTotals
): void {
  // These are guaranteed to be defined due to hasExtendedMetrics check
  if (
    score.deltaMidScores === undefined ||
    score.evResults === undefined ||
    score.pnlResults === undefined ||
    score.evPnlGap === undefined
  ) {
    return;
  }

  totals.totalDeltaMAE += score.deltaMidScores.aggregates.meanMAE;
  totals.totalExpectedValuePnLGap += score.evPnlGap.gap;
  totals.extendedRoundsCount++;

  // Use pre-aggregated mean EV
  totals.totalExpectedValue += score.evResults.meanEV;

  // Use pre-aggregated mean PnL
  totals.totalPnL += score.pnlResults.meanPnL;
}

export function calculateModelSummary(results: ModelResults): ModelSummary {
  const { modelId, rounds } = results;

  if (rounds.length === 0) {
    return {
      modelId,
      meanBrier: 0,
      meanLogLoss: 0,
      meanAccuracy: 0,
    };
  }

  let totalBrier = 0;
  let totalLogLoss = 0;
  let totalAccuracy = 0;

  // EV metrics accumulators
  const extendedTotals: ExtendedMetricsTotals = {
    totalDeltaMAE: 0,
    totalExpectedValue: 0,
    totalPnL: 0,
    totalExpectedValuePnLGap: 0,
    extendedRoundsCount: 0,
  };

  for (const round of rounds) {
    totalBrier += round.score.aggregates.meanBrierScore;
    totalLogLoss += round.score.aggregates.meanLogLoss;
    totalAccuracy += round.score.aggregates.accuracy;

    // Aggregate EV metrics if present
    if (hasExtendedMetrics(round.score)) {
      aggregateExtendedMetrics(round.score, extendedTotals);
    }
  }

  const baseSummary: ModelSummary = {
    modelId,
    meanBrier: totalBrier / rounds.length,
    meanLogLoss: totalLogLoss / rounds.length,
    meanAccuracy: totalAccuracy / rounds.length,
  };

  // Add EV metrics if any rounds had them
  if (extendedTotals.extendedRoundsCount > 0) {
    const count = extendedTotals.extendedRoundsCount;
    baseSummary.meanDeltaMAE = extendedTotals.totalDeltaMAE / count;
    baseSummary.meanEV = extendedTotals.totalExpectedValue / count;
    baseSummary.meanPnL = extendedTotals.totalPnL / count;
    baseSummary.evPnLGap = extendedTotals.totalExpectedValuePnLGap / count;
  }

  return baseSummary;
}

export function findWinner(summaries: ModelSummary[]): ModelSummary | undefined {
  if (summaries.length === 0) {
    return undefined;
  }

  let winner = summaries[0];
  if (winner === undefined) {
    return undefined;
  }

  for (const summary of summaries) {
    if (summary.meanBrier < winner.meanBrier) {
      winner = summary;
    }
  }

  return winner;
}
