import { describe, it, expect } from 'vitest';
import {
  calculateModelSummary,
  findWinner,
  type ModelResults,
  type ModelSummary,
  type RoundResult,
} from '../src/results';
import type { ForecastScoreResult } from '../src/scorers/types';

// Helper to create a minimal ForecastScoreResult
function createBaseScore(brier: number, logLoss: number, accuracy: number): ForecastScoreResult {
  return {
    score: brier,
    aggregates: {
      meanBrierScore: brier,
      meanLogLoss: logLoss,
      accuracy,
      eventsOccurred: 3,
      monotonicityViolations: 0,
    },
    perContract: [],
    violations: [],
  };
}

// Helper to create a ForecastScoreResult with extended EV metrics
function createExtendedScore(
  brier: number,
  logLoss: number,
  accuracy: number,
  deltaMidMAE: number,
  deltaMidNormalizedMAE: number,
  meanEV: number,
  meanPnL: number,
  evPnlGap: number,
  bidSamples = 5,
  askSamples = 5
): ForecastScoreResult {
  return {
    score: brier,
    aggregates: {
      meanBrierScore: brier,
      meanLogLoss: logLoss,
      accuracy,
      eventsOccurred: 6,
      monotonicityViolations: 0,
    },
    perContract: [],
    violations: [],
    deltaMidScores: {
      scores: [
        { contractId: 'bid-delta-mid-1m', predicted: 0.1, actual: 0.12, absoluteError: 0.02, squaredError: 0.0004, signedError: -0.02, atr: 0.05, normalizedError: 0.4, normalizedSignedError: -0.4 },
        { contractId: 'bid-delta-mid-5m', predicted: 0.15, actual: 0.14, absoluteError: 0.01, squaredError: 0.0001, signedError: 0.01, atr: 0.05, normalizedError: 0.2, normalizedSignedError: 0.2 },
        { contractId: 'bid-delta-mid-15m', predicted: 0.2, actual: 0.18, absoluteError: 0.02, squaredError: 0.0004, signedError: 0.02, atr: 0.05, normalizedError: 0.4, normalizedSignedError: 0.4 },
        { contractId: 'ask-delta-mid-1m', predicted: -0.1, actual: -0.11, absoluteError: 0.01, squaredError: 0.0001, signedError: 0.01, atr: 0.05, normalizedError: 0.2, normalizedSignedError: 0.2 },
        { contractId: 'ask-delta-mid-5m', predicted: -0.15, actual: -0.14, absoluteError: 0.01, squaredError: 0.0001, signedError: -0.01, atr: 0.05, normalizedError: 0.2, normalizedSignedError: -0.2 },
        { contractId: 'ask-delta-mid-15m', predicted: -0.2, actual: -0.22, absoluteError: 0.02, squaredError: 0.0004, signedError: 0.02, atr: 0.05, normalizedError: 0.4, normalizedSignedError: 0.4 },
      ],
      aggregates: {
        meanMAE: deltaMidMAE,
        meanMSE: deltaMidMAE * deltaMidMAE,
        meanBias: 0.01,
        sampleCount: bidSamples + askSamples,
        meanNormalizedMAE: deltaMidNormalizedMAE,
        meanNormalizedBias: 0.1,
        bySide: {
          bid: { meanNormalizedMAE: deltaMidNormalizedMAE, meanNormalizedBias: 0.1, sampleCount: bidSamples },
          ask: { meanNormalizedMAE: deltaMidNormalizedMAE, meanNormalizedBias: -0.1, sampleCount: askSamples },
        },
      },
    },
    evResults: {
      meanEV,
      totalEV: meanEV * 6,
      evBySide: { bid: meanEV * 0.6, ask: meanEV * 0.4 },
      evByHorizon: { '1m': meanEV * 0.2, '5m': meanEV * 0.3, '15m': meanEV * 0.5 },
    },
    pnlResults: {
      meanPnL,
      totalPnL: meanPnL * 6,
      filledCount: 6,
      pnlBySide: { bid: meanPnL * 0.5, ask: meanPnL * 0.5 },
      pnlByHorizon: { '1m': meanPnL * 0.2, '5m': meanPnL * 0.3, '15m': meanPnL * 0.5 },
    },
    evPnlGap: {
      gap: evPnlGap,
      gapVariance: evPnlGap * evPnlGap,
      systematicOverestimation: evPnlGap > 0,
    },
  };
}

describe('results', () => {
  describe('calculateModelSummary', () => {
    it('should return zero values for empty rounds', () => {
      const results: ModelResults = {
        modelId: 'test-model',
        rounds: [],
      };

      const summary = calculateModelSummary(results);

      expect(summary.modelId).toBe('test-model');
      expect(summary.meanBrier).toBe(0);
      expect(summary.meanLogLoss).toBe(0);
      expect(summary.meanAccuracy).toBe(0);
    });

    it('should calculate mean of basic metrics across rounds', () => {
      const results: ModelResults = {
        modelId: 'test-model',
        rounds: [
          { roundNumber: 1, score: createBaseScore(0.2, 0.5, 0.7) },
          { roundNumber: 2, score: createBaseScore(0.3, 0.6, 0.8) },
          { roundNumber: 3, score: createBaseScore(0.4, 0.7, 0.6) },
        ],
      };

      const summary = calculateModelSummary(results);

      expect(summary.modelId).toBe('test-model');
      expect(summary.meanBrier).toBeCloseTo(0.3, 5);
      expect(summary.meanLogLoss).toBeCloseTo(0.6, 5);
      expect(summary.meanAccuracy).toBeCloseTo(0.7, 5);
    });

    it('should handle single round correctly', () => {
      const results: ModelResults = {
        modelId: 'single-round-model',
        rounds: [{ roundNumber: 1, score: createBaseScore(0.25, 0.55, 0.75) }],
      };

      const summary = calculateModelSummary(results);

      expect(summary.meanBrier).toBe(0.25);
      expect(summary.meanLogLoss).toBe(0.55);
      expect(summary.meanAccuracy).toBe(0.75);
    });

    it('should not include extended metrics when none present', () => {
      const results: ModelResults = {
        modelId: 'basic-model',
        rounds: [{ roundNumber: 1, score: createBaseScore(0.25, 0.55, 0.75) }],
      };

      const summary = calculateModelSummary(results);

      expect(summary.meanNormalizedDeltaMAE).toBeUndefined();
      expect(summary.meanEV).toBeUndefined();
      expect(summary.meanPnL).toBeUndefined();
      expect(summary.evPnLGap).toBeUndefined();
      expect(summary.bidMetrics).toBeUndefined();
      expect(summary.askMetrics).toBeUndefined();
    });

    it('should calculate extended EV metrics when present', () => {
      const results: ModelResults = {
        modelId: 'ev-model',
        rounds: [
          { roundNumber: 1, score: createExtendedScore(0.2, 0.5, 0.7, 0.02, 0.4, 0.05, 0.03, 0.02) },
          { roundNumber: 2, score: createExtendedScore(0.3, 0.6, 0.8, 0.03, 0.6, 0.07, 0.05, 0.02) },
        ],
      };

      const summary = calculateModelSummary(results);

      expect(summary.meanNormalizedDeltaMAE).toBeCloseTo(0.5, 5); // (0.4 + 0.6) / 2
      expect(summary.meanEV).toBeCloseTo(0.06, 5); // (0.05 + 0.07) / 2
      expect(summary.meanPnL).toBeCloseTo(0.04, 5); // (0.03 + 0.05) / 2
      expect(summary.evPnLGap).toBeCloseTo(0.02, 5);
    });

    it('should calculate per-side metrics when extended metrics present', () => {
      const results: ModelResults = {
        modelId: 'per-side-model',
        rounds: [
          { roundNumber: 1, score: createExtendedScore(0.2, 0.5, 0.7, 0.02, 0.4, 0.05, 0.03, 0.02, 3, 3) },
        ],
      };

      const summary = calculateModelSummary(results);

      expect(summary.bidMetrics).toBeDefined();
      expect(summary.askMetrics).toBeDefined();
      expect(summary.bidMetrics?.meanNormalizedMAE).toBeCloseTo(0.4, 5);
      expect(summary.askMetrics?.meanNormalizedMAE).toBeCloseTo(0.4, 5);
    });

    it('should accumulate fill counts across rounds', () => {
      const results: ModelResults = {
        modelId: 'fill-count-model',
        rounds: [
          { roundNumber: 1, score: createExtendedScore(0.2, 0.5, 0.7, 0.02, 0.4, 0.05, 0.03, 0.02, 5, 5) },
          { roundNumber: 2, score: createExtendedScore(0.3, 0.6, 0.8, 0.03, 0.6, 0.07, 0.05, 0.02, 5, 5) },
        ],
      };

      const summary = calculateModelSummary(results);

      expect(summary.fillCounts).toBeDefined();
      // Each extended score has 6 delta-mid scores: 3 bid, 3 ask (one per horizon)
      // 2 rounds * 3 horizons per side = 6 fills per side
      expect(summary.fillCounts?.bid['1m']).toBe(2);
      expect(summary.fillCounts?.bid['5m']).toBe(2);
      expect(summary.fillCounts?.bid['15m']).toBe(2);
      expect(summary.fillCounts?.ask['1m']).toBe(2);
      expect(summary.fillCounts?.ask['5m']).toBe(2);
      expect(summary.fillCounts?.ask['15m']).toBe(2);
    });

    it('should handle mixed rounds with and without extended metrics', () => {
      const results: ModelResults = {
        modelId: 'mixed-model',
        rounds: [
          { roundNumber: 1, score: createBaseScore(0.2, 0.5, 0.7) },
          { roundNumber: 2, score: createExtendedScore(0.3, 0.6, 0.8, 0.02, 0.4, 0.05, 0.03, 0.02) },
        ],
      };

      const summary = calculateModelSummary(results);

      // Basic metrics should average both rounds
      expect(summary.meanBrier).toBeCloseTo(0.25, 5);
      // Extended metrics should only use the one extended round
      expect(summary.meanNormalizedDeltaMAE).toBeCloseTo(0.4, 5);
      expect(summary.meanEV).toBeCloseTo(0.05, 5);
    });

    it('should handle zero sample counts for per-side metrics', () => {
      const results: ModelResults = {
        modelId: 'zero-samples-model',
        rounds: [
          { roundNumber: 1, score: createExtendedScore(0.2, 0.5, 0.7, 0.02, 0.4, 0.05, 0.03, 0.02, 0, 0) },
        ],
      };

      const summary = calculateModelSummary(results);

      // Per-side metrics with zero rounds should be 0
      expect(summary.bidMetrics?.meanNormalizedMAE).toBe(0);
      expect(summary.askMetrics?.meanNormalizedMAE).toBe(0);
    });
  });

  describe('findWinner', () => {
    it('should return undefined for empty summaries array', () => {
      const winner = findWinner([]);
      expect(winner).toBeUndefined();
    });

    it('should return the single model for single-element array', () => {
      const summaries: ModelSummary[] = [
        { modelId: 'only-model', meanBrier: 0.3, meanLogLoss: 0.5, meanAccuracy: 0.7 },
      ];

      const winner = findWinner(summaries);
      expect(winner?.modelId).toBe('only-model');
    });

    it('should return model with lowest Brier score', () => {
      const summaries: ModelSummary[] = [
        { modelId: 'model-a', meanBrier: 0.4, meanLogLoss: 0.5, meanAccuracy: 0.6 },
        { modelId: 'model-b', meanBrier: 0.2, meanLogLoss: 0.6, meanAccuracy: 0.7 },
        { modelId: 'model-c', meanBrier: 0.3, meanLogLoss: 0.4, meanAccuracy: 0.8 },
      ];

      const winner = findWinner(summaries);
      expect(winner?.modelId).toBe('model-b');
    });

    it('should return first model when multiple have same Brier score', () => {
      const summaries: ModelSummary[] = [
        { modelId: 'model-a', meanBrier: 0.25, meanLogLoss: 0.5, meanAccuracy: 0.6 },
        { modelId: 'model-b', meanBrier: 0.25, meanLogLoss: 0.6, meanAccuracy: 0.7 },
      ];

      const winner = findWinner(summaries);
      // First one with lowest score wins in tie
      expect(winner?.modelId).toBe('model-a');
    });

    it('should ignore extended metrics when determining winner', () => {
      const summaries: ModelSummary[] = [
        {
          modelId: 'model-a',
          meanBrier: 0.3,
          meanLogLoss: 0.5,
          meanAccuracy: 0.6,
          meanEV: 0.1, // Higher EV
          meanPnL: 0.08,
        },
        {
          modelId: 'model-b',
          meanBrier: 0.2, // Lower Brier (winner)
          meanLogLoss: 0.6,
          meanAccuracy: 0.7,
          meanEV: 0.05,
          meanPnL: 0.04,
        },
      ];

      const winner = findWinner(summaries);
      expect(winner?.modelId).toBe('model-b');
    });

    it('should handle very small Brier score differences', () => {
      const summaries: ModelSummary[] = [
        { modelId: 'model-a', meanBrier: 0.2001, meanLogLoss: 0.5, meanAccuracy: 0.6 },
        { modelId: 'model-b', meanBrier: 0.2000, meanLogLoss: 0.6, meanAccuracy: 0.7 },
      ];

      const winner = findWinner(summaries);
      expect(winner?.modelId).toBe('model-b');
    });
  });
});

// Type assertions to ensure exports are correctly typed
const _typeCheckRoundResult: RoundResult = {
  roundNumber: 1,
  score: createBaseScore(0.25, 0.5, 0.75),
};
const _typeCheckModelResults: ModelResults = {
  modelId: 'test',
  rounds: [_typeCheckRoundResult],
};
void _typeCheckModelResults;
