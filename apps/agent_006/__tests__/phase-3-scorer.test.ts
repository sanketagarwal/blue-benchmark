import { describe, expect, it } from 'vitest';
import {
  winsorize,
  normalize,
  computeCompositeScore,
  rankModels,
  type Phase3ModelMetrics,
} from '../src/scorers/phase-3-scorer.js';

describe('phase-3-scorer', () => {
  describe('winsorize', () => {
    it('clips values to 5th-95th percentile', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];

      const result = winsorize(values);

      expect(result[9]).toBeLessThan(100);
      expect(result[0]).toBe(1);
    });
  });

  describe('normalize', () => {
    it('normalizes to 0-1 range', () => {
      const values = [10, 20, 30, 40, 50];

      const result = normalize(values);

      expect(Math.min(...result)).toBeCloseTo(0);
      expect(Math.max(...result)).toBeCloseTo(1);
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
});
