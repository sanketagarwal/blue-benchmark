import type { ScorerResult } from '@nullagent/scorers';

export type ContractId =
  | 'dump-simple-15m-1pct'
  | 'dump-simple-15m-3pct'
  | 'dump-simple-15m-5pct'
  | 'dump-simple-1h-0.5pct'
  | 'dump-simple-1h-1pct'
  | 'dump-vol-adjusted-15m-z2'
  | 'dump-vol-adjusted-1h-z2'
  | 'dump-drawdown-1pct'
  | 'dump-drawdown-3pct';

export interface ForecastScorerInput {
  predictions: Record<ContractId, number>;
  actuals: Record<ContractId, boolean>;
  predictionTime: Date;
  symbolId: string;
}

export interface ContractScore {
  contractId: ContractId;
  predicted: number;
  actual: boolean;
  brierScore: number;
  logLoss: number;
}

export interface ForecastScoreResult extends ScorerResult {
  score: number;
  aggregates: {
    meanBrierScore: number;
    meanLogLoss: number;
    accuracy: number;
    eventsOccurred: number;
  };
  perContract: ContractScore[];
}
