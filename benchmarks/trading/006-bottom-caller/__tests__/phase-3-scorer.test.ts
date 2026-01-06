import { describe, expect, it } from 'vitest';
import {
  winsorize,
  normalize,
  computeCompositeScore,
  rankModels,
  rankModelsForHorizon,
  rankModelsPerHorizon,
  type Phase3ModelMetrics,
  type ModelWithHorizonMetrics,
} from '../src/scorers/phase-3-scorer.js';

describe('phase-3-scorer', () => {
  describe('winsorize', () => {
    it('clips values to 5th-95th percentile', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];

      const result = winsorize(values);

      expect(result[9]).toBeLessThan(100);
      expect(result[0]).toBe(1);
    });

    it('returns empty array for empty input', () => {
      expect(winsorize([])).toEqual([]);
    });

    it('handles single value', () => {
      expect(winsorize([42])).toEqual([42]);
    });

    it('handles two values (clips to same due to percentile calculation)', () => {
      const result = winsorize([10, 20]);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe(10);
      expect(result[1]).toBe(10);
    });
  });

  describe('normalize', () => {
    it('normalizes to 0-1 range', () => {
      const values = [10, 20, 30, 40, 50];

      const result = normalize(values);

      expect(Math.min(...result)).toBeCloseTo(0);
      expect(Math.max(...result)).toBeCloseTo(1);
    });

    it('returns empty array for empty input', () => {
      expect(normalize([])).toEqual([]);
    });

    it('returns 0.5 for all same values (min === max)', () => {
      const result = normalize([5, 5, 5, 5]);
      expect(result).toEqual([0.5, 0.5, 0.5, 0.5]);
    });

    it('handles single value', () => {
      const result = normalize([42]);
      expect(result).toEqual([0.5]);
    });
  });

  describe('computeCompositeScore', () => {
    it('computes weighted composite', () => {
      const metrics: Phase3ModelMetrics = {
        avgPercentileRank: 80,
        avgBestWindow: 0.3,
        avgStability: 0.1,
        avgTimeToPivotRatio: 0.4,
      };

      const score = computeCompositeScore(metrics, {
        bestWindowRange: { min: 0.2, max: 0.5 },
        stabilityRange: { min: 0.05, max: 0.2 },
      });

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('returns valid number when ranges are degenerate (min === max)', () => {
      const metrics: Phase3ModelMetrics = {
        avgPercentileRank: 75,
        avgBestWindow: 0.3,
        avgStability: 0.15,
        avgTimeToPivotRatio: 0.5,
      };

      // All models have identical metrics, so min === max
      const score = computeCompositeScore(metrics, {
        bestWindowRange: { min: 0.3, max: 0.3 },
        stabilityRange: { min: 0.15, max: 0.15 },
      });

      expect(Number.isFinite(score)).toBe(true);
      expect(Number.isNaN(score)).toBe(false);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('rankModels', () => {
    it('returns top 8 models by composite score', () => {
      const models: Array<{ modelId: string; metrics: Phase3ModelMetrics }> = [];
      for (let i = 0; i < 12; i++) {
        models.push({
          modelId: `model-${String(i)}`,
          metrics: {
            // Higher index = higher percentile rank (better)
            avgPercentileRank: 50 + i * 4,
            // Higher index = lower bestWindow (better, since lower is better)
            avgBestWindow: 0.5 - i * 0.01,
            // Higher index = lower stability (better, since lower is better)
            avgStability: 0.2 - i * 0.005,
            avgTimeToPivotRatio: 0.5,
          },
        });
      }

      const ranked = rankModels(models);

      expect(ranked).toHaveLength(8);
      expect(ranked[0]?.modelId).toBe('model-11');
    });
  });

  describe('rankModelsForHorizon', () => {
    function createModel(
      id: string,
      qualified: string[],
      horizonData: Partial<Record<string, { logLoss: number; bestWindow: number; stability: number }>>
    ): ModelWithHorizonMetrics {
      const defaultMetrics = { logLoss: 0.5, bestWindow: 5, stability: 0.1 };
      return {
        modelId: id,
        metrics: {
          avgPercentileRank: 50,
          avgBestWindow: 0.3,
          avgStability: 0.1,
          avgTimeToPivotRatio: 0.5,
        },
        horizonMetrics: {
          '15m': horizonData['15m'] ?? defaultMetrics,
          '1h': horizonData['1h'] ?? defaultMetrics,
          '4h': horizonData['4h'] ?? defaultMetrics,
          '24h': horizonData['24h'] ?? defaultMetrics,
        },
        qualifiedHorizons: new Set(qualified as Array<'15m' | '1h' | '4h' | '24h'>),
      };
    }

    it('returns empty array for empty models', () => {
      const result = rankModelsForHorizon([], '15m');
      expect(result).toEqual([]);
    });

    it('returns empty array when no models qualified for horizon', () => {
      const models = [
        createModel('m1', ['1h'], {}),
        createModel('m2', ['4h'], {}),
      ];
      const result = rankModelsForHorizon(models, '15m');
      expect(result).toEqual([]);
    });

    it('returns single model when only one qualified', () => {
      const models = [
        createModel('m1', ['15m'], { '15m': { logLoss: 0.3, bestWindow: 3, stability: 0.05 } }),
      ];
      const result = rankModelsForHorizon(models, '15m');
      expect(result).toHaveLength(1);
      expect(result[0]?.modelId).toBe('m1');
    });

    it('filters out models with invalid metrics (NaN, Infinity)', () => {
      const models = [
        createModel('m1', ['15m'], { '15m': { logLoss: NaN, bestWindow: 3, stability: 0.05 } }),
        createModel('m2', ['15m'], { '15m': { logLoss: 0.3, bestWindow: Infinity, stability: 0.05 } }),
        createModel('m3', ['15m'], { '15m': { logLoss: 0.3, bestWindow: 3, stability: 0.05 } }),
      ];
      const result = rankModelsForHorizon(models, '15m');
      expect(result).toHaveLength(1);
      expect(result[0]?.modelId).toBe('m3');
    });

    it('handles all models with identical metrics (degenerate ranges)', () => {
      const sameMetrics = { logLoss: 0.5, bestWindow: 5, stability: 0.1 };
      const models = [
        createModel('m1', ['15m'], { '15m': sameMetrics }),
        createModel('m2', ['15m'], { '15m': sameMetrics }),
        createModel('m3', ['15m'], { '15m': sameMetrics }),
      ];
      const result = rankModelsForHorizon(models, '15m');
      expect(result).toHaveLength(3);
      expect(result[0]?.score).toEqual(result[1]?.score);
      expect(Number.isFinite(result[0]?.score)).toBe(true);
    });

    it('ranks models by score (lower logLoss is better)', () => {
      const models: ModelWithHorizonMetrics[] = [];
      for (let i = 0; i < 10; i++) {
        models.push(createModel(`m${String(i)}`, ['15m'], {
          '15m': { logLoss: 0.1 + i * 0.08, bestWindow: 5, stability: 0.1 },
        }));
      }
      const result = rankModelsForHorizon(models, '15m');
      expect(result[0]?.modelId).toBe('m0');
      expect(result[0]?.score).toBeGreaterThan(result[1]?.score ?? 0);
    });

    it('returns at most 8 models', () => {
      const models: ModelWithHorizonMetrics[] = [];
      for (let i = 0; i < 12; i++) {
        models.push(createModel(`m${String(i)}`, ['15m'], {
          '15m': { logLoss: 0.5 - i * 0.01, bestWindow: 5, stability: 0.1 },
        }));
      }
      const result = rankModelsForHorizon(models, '15m');
      expect(result).toHaveLength(8);
    });
  });

  describe('rankModelsPerHorizon', () => {
    function createModel(
      id: string,
      qualified: string[]
    ): ModelWithHorizonMetrics {
      const defaultMetrics = { logLoss: 0.5, bestWindow: 5, stability: 0.1 };
      return {
        modelId: id,
        metrics: {
          avgPercentileRank: 50,
          avgBestWindow: 0.3,
          avgStability: 0.1,
          avgTimeToPivotRatio: 0.5,
        },
        horizonMetrics: {
          '15m': defaultMetrics,
          '1h': defaultMetrics,
          '4h': defaultMetrics,
          '24h': defaultMetrics,
        },
        qualifiedHorizons: new Set(qualified as Array<'15m' | '1h' | '4h' | '24h'>),
      };
    }

    it('returns empty arrays for empty models', () => {
      const result = rankModelsPerHorizon([]);
      expect(result['15m']).toEqual([]);
      expect(result['1h']).toEqual([]);
      expect(result['4h']).toEqual([]);
      expect(result['24h']).toEqual([]);
    });

    it('returns rankings for each horizon independently', () => {
      const models = [
        createModel('m1', ['15m', '1h']),
        createModel('m2', ['1h', '4h']),
        createModel('m3', ['4h', '24h']),
      ];
      const result = rankModelsPerHorizon(models);
      expect(result['15m']).toHaveLength(1);
      expect(result['1h']).toHaveLength(2);
      expect(result['4h']).toHaveLength(2);
      expect(result['24h']).toHaveLength(1);
    });

    it('handles single model qualified for all horizons', () => {
      const models = [createModel('solo', ['15m', '1h', '4h', '24h'])];
      const result = rankModelsPerHorizon(models);
      expect(result['15m']).toHaveLength(1);
      expect(result['1h']).toHaveLength(1);
      expect(result['4h']).toHaveLength(1);
      expect(result['24h']).toHaveLength(1);
    });
  });
});
