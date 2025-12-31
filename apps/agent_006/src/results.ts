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

export interface PerSideMetrics {
  meanNormalizedMAE: number;
  meanEV: number;
  meanPnL: number;
  fillCount: number;
}

export interface ModelSummary {
  modelId: ModelId;
  meanBrier: number;
  meanLogLoss: number;
  meanAccuracy: number;
  // EV benchmark metrics (optional)
  meanNormalizedDeltaMAE?: number; // Renamed from meanDeltaMAE
  meanEV?: number;
  meanPnL?: number;
  evPnLGap?: number;
  // Per-side breakdown
  bidMetrics?: PerSideMetrics;
  askMetrics?: PerSideMetrics;
  // Fill counts for low-sample warnings
  fillCounts?: {
    bid: Record<'1m' | '5m' | '15m', number>;
    ask: Record<'1m' | '5m' | '15m', number>;
  };
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
  totalNormalizedDeltaMAE: number; // Renamed from totalDeltaMAE
  totalExpectedValue: number;
  totalPnL: number;
  totalExpectedValuePnLGap: number;
  extendedRoundsCount: number;
  // Per-side totals
  bidTotals: {
    normalizedMAE: number;
    ev: number;
    pnl: number;
    fills: number;
    rounds: number;
  };
  askTotals: {
    normalizedMAE: number;
    ev: number;
    pnl: number;
    fills: number;
    rounds: number;
  };
  // Fill counts by side and horizon (accumulated across rounds)
  fillCounts: {
    bid: Record<'1m' | '5m' | '15m', number>;
    ask: Record<'1m' | '5m' | '15m', number>;
  };
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
  if (
    score.deltaMidScores === undefined ||
    score.evResults === undefined ||
    score.pnlResults === undefined ||
    score.evPnlGap === undefined
  ) {
    return;
  }

  // Aggregate normalized delta-mid MAE (changed from raw meanMAE)
  totals.totalNormalizedDeltaMAE += score.deltaMidScores.aggregates.meanNormalizedMAE;
  totals.totalExpectedValuePnLGap += score.evPnlGap.gap;
  totals.extendedRoundsCount++;

  totals.totalExpectedValue += score.evResults.meanEV;
  totals.totalPnL += score.pnlResults.meanPnL;

  // Per-side delta-mid
  const bidDelta = score.deltaMidScores.aggregates.bySide.bid;
  const askDelta = score.deltaMidScores.aggregates.bySide.ask;

  if (bidDelta.sampleCount > 0) {
    totals.bidTotals.normalizedMAE += bidDelta.meanNormalizedMAE;
    totals.bidTotals.rounds++;
  }
  if (askDelta.sampleCount > 0) {
    totals.askTotals.normalizedMAE += askDelta.meanNormalizedMAE;
    totals.askTotals.rounds++;
  }

  // Per-side EV
  totals.bidTotals.ev += score.evResults.evBySide.bid;
  totals.askTotals.ev += score.evResults.evBySide.ask;

  // Per-side PnL
  totals.bidTotals.pnl += score.pnlResults.pnlBySide.bid;
  totals.askTotals.pnl += score.pnlResults.pnlBySide.ask;

  // Fill counts by side and horizon
  totals.bidTotals.fills += bidDelta.sampleCount;
  totals.askTotals.fills += askDelta.sampleCount;

  // Accumulate per-horizon fill counts from deltaMidScores
  for (const scoreItem of score.deltaMidScores.scores) {
    const contractId = scoreItem.contractId;
    const isBid = contractId.startsWith('bid');
    const sideCounters = isBid ? totals.fillCounts.bid : totals.fillCounts.ask;

    if (contractId.endsWith('-1m')) {
      sideCounters['1m']++;
    } else if (contractId.endsWith('-5m')) {
      sideCounters['5m']++;
    } else if (contractId.endsWith('-15m')) {
      sideCounters['15m']++;
    }
  }
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

  const extendedTotals: ExtendedMetricsTotals = {
    totalNormalizedDeltaMAE: 0,
    totalExpectedValue: 0,
    totalPnL: 0,
    totalExpectedValuePnLGap: 0,
    extendedRoundsCount: 0,
    bidTotals: { normalizedMAE: 0, ev: 0, pnl: 0, fills: 0, rounds: 0 },
    askTotals: { normalizedMAE: 0, ev: 0, pnl: 0, fills: 0, rounds: 0 },
    fillCounts: {
      bid: { '1m': 0, '5m': 0, '15m': 0 },
      ask: { '1m': 0, '5m': 0, '15m': 0 },
    },
  };

  for (const round of rounds) {
    totalBrier += round.score.aggregates.meanBrierScore;
    totalLogLoss += round.score.aggregates.meanLogLoss;
    totalAccuracy += round.score.aggregates.accuracy;

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

  if (extendedTotals.extendedRoundsCount > 0) {
    const count = extendedTotals.extendedRoundsCount;
    baseSummary.meanNormalizedDeltaMAE = extendedTotals.totalNormalizedDeltaMAE / count;
    baseSummary.meanEV = extendedTotals.totalExpectedValue / count;
    baseSummary.meanPnL = extendedTotals.totalPnL / count;
    baseSummary.evPnLGap = extendedTotals.totalExpectedValuePnLGap / count;

    // Per-side metrics
    baseSummary.bidMetrics = {
      meanNormalizedMAE:
        extendedTotals.bidTotals.rounds > 0
          ? extendedTotals.bidTotals.normalizedMAE / extendedTotals.bidTotals.rounds
          : 0,
      meanEV: extendedTotals.bidTotals.ev / count,
      meanPnL: extendedTotals.bidTotals.pnl / count,
      fillCount: extendedTotals.bidTotals.fills,
    };

    baseSummary.askMetrics = {
      meanNormalizedMAE:
        extendedTotals.askTotals.rounds > 0
          ? extendedTotals.askTotals.normalizedMAE / extendedTotals.askTotals.rounds
          : 0,
      meanEV: extendedTotals.askTotals.ev / count,
      meanPnL: extendedTotals.askTotals.pnl / count,
      fillCount: extendedTotals.askTotals.fills,
    };

    baseSummary.fillCounts = extendedTotals.fillCounts;
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
