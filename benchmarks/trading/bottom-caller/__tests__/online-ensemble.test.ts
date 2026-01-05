import { describe, expect, it } from 'vitest';

import {
  computeRollingMeanLL,
  computeModelWeights,
  computeEnsemblePrediction,
  computeWeightEntropy,
  scoreEnsemble,
  getDefaultEnsembleConfig,
  type ModelHistory,
  type ModelRoundPrediction,
  type EnsembleRoundResult,
  type EnsembleConfig,
} from '../src/ensemble/online-ensemble.js';

describe('Online Ensemble', () => {
  describe('getDefaultEnsembleConfig', () => {
    it('returns expected defaults for wide mode', () => {
      const config = getDefaultEnsembleConfig('wide');
      expect(config.rollingWindowSize).toBe(6);
      expect(config.alpha).toBe(4);
      expect(config.minModels).toBe(3);
      expect(config.mode).toBe('wide');
      expect(config.validModelIds).toBeUndefined();
    });

    it('returns expected defaults for strict mode', () => {
      const config = getDefaultEnsembleConfig('strict');
      expect(config.mode).toBe('strict');
    });

    it('defaults to wide mode when no argument provided', () => {
      const config = getDefaultEnsembleConfig();
      expect(config.mode).toBe('wide');
    });
  });

  describe('computeRollingMeanLL', () => {
    it('returns Infinity for empty history', () => {
      const history: ModelHistory = {
        modelId: 'model1',
        logLossByRound: [],
        effectiveRounds: 0,
      };
      expect(computeRollingMeanLL(history, 6)).toBe(Infinity);
    });

    it('computes mean of all values when history shorter than window', () => {
      const history: ModelHistory = {
        modelId: 'model1',
        logLossByRound: [0.3, 0.5, 0.4],
        effectiveRounds: 3,
      };
      const expected = (0.3 + 0.5 + 0.4) / 3;
      expect(computeRollingMeanLL(history, 6)).toBeCloseTo(expected);
    });

    it('computes rolling mean of last windowSize values when history >= window', () => {
      const history: ModelHistory = {
        modelId: 'model1',
        logLossByRound: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        effectiveRounds: 8,
      };
      const expected = (0.3 + 0.4 + 0.5 + 0.6 + 0.7 + 0.8) / 6;
      expect(computeRollingMeanLL(history, 6)).toBeCloseTo(expected);
    });

    it('computes correctly with exactly windowSize entries', () => {
      const history: ModelHistory = {
        modelId: 'model1',
        logLossByRound: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
        effectiveRounds: 6,
      };
      const expected = (0.1 + 0.2 + 0.3 + 0.4 + 0.5 + 0.6) / 6;
      expect(computeRollingMeanLL(history, 6)).toBeCloseTo(expected);
    });

    it('handles single entry history', () => {
      const history: ModelHistory = {
        modelId: 'model1',
        logLossByRound: [0.693],
        effectiveRounds: 1,
      };
      expect(computeRollingMeanLL(history, 6)).toBeCloseTo(0.693);
    });
  });

  describe('computeModelWeights', () => {
    const baseConfig: EnsembleConfig = {
      rollingWindowSize: 6,
      alpha: 4,
      minModels: 3,
      mode: 'wide',
      validModelIds: undefined,
    };

    it('assigns equal weights for models with no history', () => {
      const histories: ModelHistory[] = [
        { modelId: 'model1', logLossByRound: [], effectiveRounds: 0 },
        { modelId: 'model2', logLossByRound: [], effectiveRounds: 0 },
      ];
      const weights = computeModelWeights(histories, 0, baseConfig);
      expect(weights.get('model1')).toBeCloseTo(0.5);
      expect(weights.get('model2')).toBeCloseTo(0.5);
    });

    it('uses exp(-alpha * LL) weighting with coverage factor', () => {
      const histories: ModelHistory[] = [
        { modelId: 'model1', logLossByRound: [0.3], effectiveRounds: 1 },
        { modelId: 'model2', logLossByRound: [0.5], effectiveRounds: 1 },
      ];
      const weights = computeModelWeights(histories, 1, baseConfig);

      const coverageFactor = 1 / 6;
      const raw1 = Math.exp(-4 * 0.3) * coverageFactor;
      const raw2 = Math.exp(-4 * 0.5) * coverageFactor;
      const total = raw1 + raw2;

      expect(weights.get('model1')).toBeCloseTo(raw1 / total);
      expect(weights.get('model2')).toBeCloseTo(raw2 / total);
    });

    it('is leakage-safe: only uses history < round', () => {
      const histories: ModelHistory[] = [
        { modelId: 'model1', logLossByRound: [0.3, 0.4, 0.5], effectiveRounds: 3 },
        { modelId: 'model2', logLossByRound: [0.6, 0.7, 0.8], effectiveRounds: 3 },
      ];
      const weightsRound1 = computeModelWeights(histories, 1, baseConfig);
      const weightsRound2 = computeModelWeights(histories, 2, baseConfig);

      const coverageFactor1 = 1 / 6;
      const raw1_r1 = Math.exp(-4 * 0.3) * coverageFactor1;
      const raw2_r1 = Math.exp(-4 * 0.6) * coverageFactor1;
      const total_r1 = raw1_r1 + raw2_r1;
      expect(weightsRound1.get('model1')).toBeCloseTo(raw1_r1 / total_r1);

      const coverageFactor2 = 2 / 6;
      const meanLL1 = (0.3 + 0.4) / 2;
      const meanLL2 = (0.6 + 0.7) / 2;
      const raw1_r2 = Math.exp(-4 * meanLL1) * coverageFactor2;
      const raw2_r2 = Math.exp(-4 * meanLL2) * coverageFactor2;
      const total_r2 = raw1_r2 + raw2_r2;
      expect(weightsRound2.get('model1')).toBeCloseTo(raw1_r2 / total_r2);
    });

    it('excludes models not in validModelIds in strict mode', () => {
      const strictConfig: EnsembleConfig = {
        ...baseConfig,
        mode: 'strict',
        validModelIds: new Set(['model1']),
      };
      const histories: ModelHistory[] = [
        { modelId: 'model1', logLossByRound: [0.3], effectiveRounds: 1 },
        { modelId: 'model2', logLossByRound: [0.4], effectiveRounds: 1 },
        { modelId: 'model3', logLossByRound: [0.5], effectiveRounds: 1 },
      ];
      const weights = computeModelWeights(histories, 1, strictConfig);

      expect(weights.has('model1')).toBe(true);
      expect(weights.has('model2')).toBe(false);
      expect(weights.has('model3')).toBe(false);
      expect(weights.get('model1')).toBeCloseTo(1);
    });

    it('includes all models in wide mode', () => {
      const histories: ModelHistory[] = [
        { modelId: 'model1', logLossByRound: [0.3], effectiveRounds: 1 },
        { modelId: 'model2', logLossByRound: [0.4], effectiveRounds: 1 },
      ];
      const weights = computeModelWeights(histories, 1, baseConfig);

      expect(weights.has('model1')).toBe(true);
      expect(weights.has('model2')).toBe(true);
    });

    it('assigns uniform weights when all raw weights are zero', () => {
      const histories: ModelHistory[] = [
        { modelId: 'model1', logLossByRound: [Infinity], effectiveRounds: 1 },
        { modelId: 'model2', logLossByRound: [Infinity], effectiveRounds: 1 },
      ];
      const weights = computeModelWeights(histories, 1, baseConfig);
      expect(weights.get('model1')).toBeCloseTo(0.5);
      expect(weights.get('model2')).toBeCloseTo(0.5);
    });
  });

  describe('computeEnsemblePrediction', () => {
    const baseConfig: EnsembleConfig = {
      rollingWindowSize: 6,
      alpha: 4,
      minModels: 3,
      mode: 'wide',
      validModelIds: undefined,
    };

    it('computes weighted average of predictions', () => {
      const predictions: ModelRoundPrediction[] = [
        { modelId: 'model1', prediction: 0.2, failed: false },
        { modelId: 'model2', prediction: 0.8, failed: false },
        { modelId: 'model3', prediction: 0.5, failed: false },
      ];
      const weights = new Map([
        ['model1', 0.5],
        ['model2', 0.3],
        ['model3', 0.2],
      ]);
      const result = computeEnsemblePrediction(predictions, weights, baseConfig);

      const expected = 0.5 * 0.2 + 0.3 * 0.8 + 0.2 * 0.5;
      expect(result.pEnsemble).toBeCloseTo(expected);
      expect(result.isScoreable).toBe(true);
      expect(result.contributingModels).toBe(3);
    });

    it('excludes failed predictions from ensemble', () => {
      const predictions: ModelRoundPrediction[] = [
        { modelId: 'model1', prediction: 0.2, failed: false },
        { modelId: 'model2', prediction: 0.8, failed: true },
        { modelId: 'model3', prediction: 0.5, failed: false },
        { modelId: 'model4', prediction: 0.6, failed: false },
      ];
      const weights = new Map([
        ['model1', 0.4],
        ['model2', 0.3],
        ['model3', 0.2],
        ['model4', 0.1],
      ]);
      const result = computeEnsemblePrediction(predictions, weights, baseConfig);

      const totalNonFailedWeight = 0.4 + 0.2 + 0.1;
      const expected = (0.4 * 0.2 + 0.2 * 0.5 + 0.1 * 0.6) / totalNonFailedWeight;
      expect(result.pEnsemble).toBeCloseTo(expected);
      expect(result.contributingModels).toBe(3);
    });

    it('marks result as not scoreable when < minModels', () => {
      const configHighMin: EnsembleConfig = { ...baseConfig, minModels: 4 };
      const predictions: ModelRoundPrediction[] = [
        { modelId: 'model1', prediction: 0.3, failed: false },
        { modelId: 'model2', prediction: 0.7, failed: false },
        { modelId: 'model3', prediction: 0.5, failed: false },
      ];
      const weights = new Map([
        ['model1', 0.33],
        ['model2', 0.33],
        ['model3', 0.34],
      ]);
      const result = computeEnsemblePrediction(predictions, weights, configHighMin);

      expect(result.isScoreable).toBe(false);
      expect(result.pEnsemble).toBe(0.5);
      expect(result.contributingModels).toBe(3);
    });

    it('uses uniform weights when all weights are zero', () => {
      const predictions: ModelRoundPrediction[] = [
        { modelId: 'model1', prediction: 0.2, failed: false },
        { modelId: 'model2', prediction: 0.4, failed: false },
        { modelId: 'model3', prediction: 0.6, failed: false },
      ];
      const weights = new Map<string, number>([
        ['model1', 0],
        ['model2', 0],
        ['model3', 0],
      ]);
      const result = computeEnsemblePrediction(predictions, weights, baseConfig);

      const expected = (0.2 + 0.4 + 0.6) / 3;
      expect(result.pEnsemble).toBeCloseTo(expected);
    });

    it('clamps prediction to [0, 1]', () => {
      const predictions: ModelRoundPrediction[] = [
        { modelId: 'model1', prediction: 1.5, failed: false },
        { modelId: 'model2', prediction: 0.8, failed: false },
        { modelId: 'model3', prediction: 0.9, failed: false },
      ];
      const weights = new Map([
        ['model1', 0.5],
        ['model2', 0.25],
        ['model3', 0.25],
      ]);
      const result = computeEnsemblePrediction(predictions, weights, baseConfig);
      expect(result.pEnsemble).toBeLessThanOrEqual(1);
      expect(result.pEnsemble).toBeGreaterThanOrEqual(0);
    });
  });

  describe('computeWeightEntropy', () => {
    it('returns 0 for empty weights', () => {
      const weights = new Map<string, number>();
      expect(computeWeightEntropy(weights)).toBe(0);
    });

    it('returns 0 for single model with weight 1', () => {
      const weights = new Map([['model1', 1]]);
      expect(computeWeightEntropy(weights)).toBeCloseTo(0);
    });

    it('returns ln(n) for uniform weights across n models', () => {
      const weights = new Map([
        ['model1', 0.25],
        ['model2', 0.25],
        ['model3', 0.25],
        ['model4', 0.25],
      ]);
      expect(computeWeightEntropy(weights)).toBeCloseTo(Math.log(4));
    });

    it('returns higher entropy for more uniform distributions', () => {
      const uniformWeights = new Map([
        ['model1', 0.5],
        ['model2', 0.5],
      ]);
      const skewedWeights = new Map([
        ['model1', 0.9],
        ['model2', 0.1],
      ]);
      expect(computeWeightEntropy(uniformWeights)).toBeGreaterThan(
        computeWeightEntropy(skewedWeights)
      );
    });

    it('handles zero weights correctly', () => {
      const weights = new Map([
        ['model1', 1],
        ['model2', 0],
      ]);
      expect(computeWeightEntropy(weights)).toBeCloseTo(0);
    });
  });

  describe('scoreEnsemble', () => {
    it('computes meanLL, bestWindow, and stability correctly', () => {
      const roundResults: EnsembleRoundResult[] = [
        { round: 0, horizon: '15m', pEnsemble: 0.9, isScoreable: true, weights: new Map(), contributingModels: 3, weightEntropy: 0 },
        { round: 1, horizon: '15m', pEnsemble: 0.8, isScoreable: true, weights: new Map(), contributingModels: 3, weightEntropy: 0 },
        { round: 2, horizon: '15m', pEnsemble: 0.7, isScoreable: true, weights: new Map(), contributingModels: 3, weightEntropy: 0 },
        { round: 3, horizon: '15m', pEnsemble: 0.6, isScoreable: true, weights: new Map(), contributingModels: 3, weightEntropy: 0 },
        { round: 4, horizon: '15m', pEnsemble: 0.5, isScoreable: true, weights: new Map(), contributingModels: 3, weightEntropy: 0 },
        { round: 5, horizon: '15m', pEnsemble: 0.4, isScoreable: true, weights: new Map(), contributingModels: 3, weightEntropy: 0 },
        { round: 6, horizon: '15m', pEnsemble: 0.3, isScoreable: true, weights: new Map(), contributingModels: 3, weightEntropy: 0 },
      ];
      const labels = [true, true, true, false, false, false, false];
      const result = scoreEnsemble(roundResults, labels, '15m');

      expect(result.horizon).toBe('15m');
      expect(Number.isFinite(result.meanLogLoss)).toBe(true);
      expect(Number.isFinite(result.bestWindowLogLoss)).toBe(true);
      expect(Number.isFinite(result.stability)).toBe(true);
      expect(result.roundResults).toBe(roundResults);
    });

    it('returns Infinity metrics when no scoreable results', () => {
      const roundResults: EnsembleRoundResult[] = [
        { round: 0, horizon: '15m', pEnsemble: 0.5, isScoreable: false, weights: new Map(), contributingModels: 1, weightEntropy: 0 },
      ];
      const labels = [true];
      const result = scoreEnsemble(roundResults, labels, '15m');

      expect(result.meanLogLoss).toBe(Infinity);
      expect(result.bestWindowLogLoss).toBe(Infinity);
      expect(result.stability).toBe(Infinity);
    });

    it('skips rounds with undefined labels', () => {
      const roundResults: EnsembleRoundResult[] = [
        { round: 0, horizon: '15m', pEnsemble: 0.9, isScoreable: true, weights: new Map(), contributingModels: 3, weightEntropy: 0 },
        { round: 5, horizon: '15m', pEnsemble: 0.8, isScoreable: true, weights: new Map(), contributingModels: 3, weightEntropy: 0 },
      ];
      const labels = [true];
      const result = scoreEnsemble(roundResults, labels, '15m');

      expect(Number.isFinite(result.meanLogLoss)).toBe(true);
    });

    it('uses meanLogLoss as bestWindow when fewer than 6 rounds', () => {
      const roundResults: EnsembleRoundResult[] = [
        { round: 0, horizon: '15m', pEnsemble: 0.9, isScoreable: true, weights: new Map(), contributingModels: 3, weightEntropy: 0 },
        { round: 1, horizon: '15m', pEnsemble: 0.8, isScoreable: true, weights: new Map(), contributingModels: 3, weightEntropy: 0 },
      ];
      const labels = [true, true];
      const result = scoreEnsemble(roundResults, labels, '15m');

      expect(result.bestWindowLogLoss).toBeCloseTo(result.meanLogLoss);
    });

    it('computes stability as standard deviation of log losses', () => {
      const roundResults: EnsembleRoundResult[] = [
        { round: 0, horizon: '15m', pEnsemble: 0.9, isScoreable: true, weights: new Map(), contributingModels: 3, weightEntropy: 0 },
        { round: 1, horizon: '15m', pEnsemble: 0.9, isScoreable: true, weights: new Map(), contributingModels: 3, weightEntropy: 0 },
      ];
      const labels = [true, true];
      const result = scoreEnsemble(roundResults, labels, '15m');

      expect(result.stability).toBeCloseTo(0);
    });
  });
});
