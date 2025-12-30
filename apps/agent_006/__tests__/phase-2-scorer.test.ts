import { describe, expect, it } from 'vitest';
import {
  computeRollingWindows,
  computeStabilityMetrics,
  shouldEliminatePhase2,
  type Phase2ModelScore,
} from '../src/scorers/phase-2-scorer.js';
import type { Horizon } from '../src/horizon-config.js';

describe('phase-2-scorer', () => {
  describe('computeRollingWindows', () => {
    it('computes 6-round rolling windows', () => {
      const roundLosses = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

      const windows = computeRollingWindows(roundLosses, 6);

      expect(windows).toHaveLength(3);
      expect(windows[0]).toBeCloseTo(0.55, 2);
    });
  });

  describe('computeStabilityMetrics', () => {
    it('computes best/worst window and variance', () => {
      const roundLosses = [0.3, 0.4, 0.5, 0.6, 0.5, 0.4, 0.3, 0.4];

      const metrics = computeStabilityMetrics(roundLosses);

      expect(metrics.bestWindow).toBeDefined();
      expect(metrics.worstWindow).toBeDefined();
      expect(metrics.worstWindow).toBeGreaterThanOrEqual(metrics.bestWindow);
      expect(metrics.variance).toBeGreaterThanOrEqual(0);
    });
  });

  describe('shouldEliminatePhase2', () => {
    it('eliminates if regret > 1.5 on 2+ horizons', () => {
      const modelScore: Phase2ModelScore = {
        modelId: 'test',
        regretByHorizon: {
          '15m': 1.8,
          '1h': 1.6,
          '24h': 1.0,
          '7d': 0.9,
        },
        stabilityByHorizon: { '15m': 0.1, '1h': 0.1, '24h': 0.1, '7d': 0.1 },
      };
      const medianStability: Record<Horizon, number> = {
        '15m': 0.1, '1h': 0.1, '24h': 0.1, '7d': 0.1,
      };

      expect(shouldEliminatePhase2(modelScore, medianStability)).toBe(true);
    });

    it('eliminates if stability > 2x median on 3+ horizons', () => {
      const modelScore: Phase2ModelScore = {
        modelId: 'test',
        regretByHorizon: { '15m': 1.0, '1h': 1.0, '24h': 1.0, '7d': 1.0 },
        stabilityByHorizon: {
          '15m': 0.3,
          '1h': 0.3,
          '24h': 0.3,
          '7d': 0.1,
        },
      };
      const medianStability: Record<Horizon, number> = {
        '15m': 0.1, '1h': 0.1, '24h': 0.1, '7d': 0.1,
      };

      expect(shouldEliminatePhase2(modelScore, medianStability)).toBe(true);
    });

    it('keeps stable models', () => {
      const modelScore: Phase2ModelScore = {
        modelId: 'test',
        regretByHorizon: { '15m': 1.0, '1h': 1.2, '24h': 1.1, '7d': 0.9 },
        stabilityByHorizon: { '15m': 0.08, '1h': 0.09, '24h': 0.1, '7d': 0.11 },
      };
      const medianStability: Record<Horizon, number> = {
        '15m': 0.1, '1h': 0.1, '24h': 0.1, '7d': 0.1,
      };

      expect(shouldEliminatePhase2(modelScore, medianStability)).toBe(false);
    });
  });
});
