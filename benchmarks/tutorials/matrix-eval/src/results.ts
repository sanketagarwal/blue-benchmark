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

  for (const round of rounds) {
    totalBrier += round.score.aggregates.meanBrierScore;
    totalLogLoss += round.score.aggregates.meanLogLoss;
    totalAccuracy += round.score.aggregates.accuracy;
  }

  return {
    modelId,
    meanBrier: totalBrier / rounds.length,
    meanLogLoss: totalLogLoss / rounds.length,
    meanAccuracy: totalAccuracy / rounds.length,
  };
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
