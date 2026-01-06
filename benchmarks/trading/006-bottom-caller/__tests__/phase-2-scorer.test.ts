import { describe, expect, it } from 'vitest';
import {
  computeRegret,
  computeRollingWindows,
  computeStabilityMetrics,
  getHorizonsToDisqualify,
  median,
  shouldEliminatePhase2,
  type Phase2ModelScore,
} from '../src/scorers/phase-2-scorer.js';
import type { TimeframeId } from '../src/timeframe-config.js';

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

    it('returns zeros for empty windows (less than window size)', () => {
      const roundLosses = [0.3, 0.4, 0.5];

      const metrics = computeStabilityMetrics(roundLosses);

      expect(metrics.bestWindow).toBe(0);
      expect(metrics.worstWindow).toBe(0);
      expect(metrics.variance).toBe(0);
    });

    it('returns zeros for empty array', () => {
      const metrics = computeStabilityMetrics([]);

      expect(metrics.bestWindow).toBe(0);
      expect(metrics.worstWindow).toBe(0);
      expect(metrics.variance).toBe(0);
    });
  });

  describe('computeRegret', () => {
    it('returns 1 when median is zero', () => {
      expect(computeRegret(0.5, 0)).toBe(1);
      expect(computeRegret(0, 0)).toBe(1);
    });

    it('computes ratio of model worst to median worst', () => {
      expect(computeRegret(0.6, 0.4)).toBeCloseTo(1.5, 2);
      expect(computeRegret(0.4, 0.4)).toBeCloseTo(1.0, 2);
      expect(computeRegret(0.2, 0.4)).toBeCloseTo(0.5, 2);
    });
  });

  describe('getHorizonsToDisqualify', () => {
    it('disqualifies horizons with regret > 1.5', () => {
      const modelScore: Phase2ModelScore = {
        modelId: 'test',
        regretByHorizon: { '15m': 1.8, '1h': 1.0, '4h': 1.0, '24h': 1.0 },
        stabilityByHorizon: { '15m': 0.1, '1h': 0.1, '4h': 0.1, '24h': 0.1 },
      };
      const medianStability: Record<TimeframeId, number> = {
        '15m': 0.1, '1h': 0.1, '4h': 0.1, '24h': 0.1,
      };

      const result = getHorizonsToDisqualify(modelScore, medianStability);

      expect(result.has('15m')).toBe(true);
      expect(result.size).toBe(1);
    });

    it('disqualifies horizons with stability > 2x median', () => {
      const modelScore: Phase2ModelScore = {
        modelId: 'test',
        regretByHorizon: { '15m': 1.0, '1h': 1.0, '4h': 1.0, '24h': 1.0 },
        stabilityByHorizon: { '15m': 0.25, '1h': 0.1, '4h': 0.1, '24h': 0.1 },
      };
      const medianStability: Record<TimeframeId, number> = {
        '15m': 0.1, '1h': 0.1, '4h': 0.1, '24h': 0.1,
      };

      const result = getHorizonsToDisqualify(modelScore, medianStability);

      expect(result.has('15m')).toBe(true);
      expect(result.size).toBe(1);
    });

    it('disqualifies multiple horizons with mixed conditions', () => {
      const modelScore: Phase2ModelScore = {
        modelId: 'test',
        regretByHorizon: { '15m': 1.8, '1h': 1.0, '4h': 1.0, '24h': 1.0 },
        stabilityByHorizon: { '15m': 0.1, '1h': 0.3, '4h': 0.1, '24h': 0.1 },
      };
      const medianStability: Record<TimeframeId, number> = {
        '15m': 0.1, '1h': 0.1, '4h': 0.1, '24h': 0.1,
      };

      const result = getHorizonsToDisqualify(modelScore, medianStability);

      expect(result.has('15m')).toBe(true);
      expect(result.has('1h')).toBe(true);
      expect(result.size).toBe(2);
    });

    it('returns empty set for stable model', () => {
      const modelScore: Phase2ModelScore = {
        modelId: 'test',
        regretByHorizon: { '15m': 1.0, '1h': 1.0, '4h': 1.0, '24h': 1.0 },
        stabilityByHorizon: { '15m': 0.1, '1h': 0.1, '4h': 0.1, '24h': 0.1 },
      };
      const medianStability: Record<TimeframeId, number> = {
        '15m': 0.1, '1h': 0.1, '4h': 0.1, '24h': 0.1,
      };

      const result = getHorizonsToDisqualify(modelScore, medianStability);

      expect(result.size).toBe(0);
    });
  });

  describe('median', () => {
    it('returns 0 for empty array', () => {
      expect(median([])).toBe(0);
    });

    it('returns middle value for odd-length array', () => {
      expect(median([1, 2, 3])).toBe(2);
      expect(median([5])).toBe(5);
      expect(median([3, 1, 2])).toBe(2);
    });

    it('returns average of two middle values for even-length array', () => {
      expect(median([1, 2, 3, 4])).toBe(2.5);
      expect(median([1, 2])).toBe(1.5);
      expect(median([4, 1, 3, 2])).toBe(2.5);
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
          '4h': 0.9,
        },
        stabilityByHorizon: { '15m': 0.1, '1h': 0.1, '24h': 0.1, '4h': 0.1 },
      };
      const medianStability: Record<TimeframeId, number> = {
        '15m': 0.1, '1h': 0.1, '24h': 0.1, '4h': 0.1,
      };

      expect(shouldEliminatePhase2(modelScore, medianStability)).toBe(true);
    });

    it('eliminates if stability > 2x median on 3+ horizons', () => {
      const modelScore: Phase2ModelScore = {
        modelId: 'test',
        regretByHorizon: { '15m': 1.0, '1h': 1.0, '24h': 1.0, '4h': 1.0 },
        stabilityByHorizon: {
          '15m': 0.3,
          '1h': 0.3,
          '24h': 0.3,
          '4h': 0.1,
        },
      };
      const medianStability: Record<TimeframeId, number> = {
        '15m': 0.1, '1h': 0.1, '24h': 0.1, '4h': 0.1,
      };

      expect(shouldEliminatePhase2(modelScore, medianStability)).toBe(true);
    });

    it('keeps stable models', () => {
      const modelScore: Phase2ModelScore = {
        modelId: 'test',
        regretByHorizon: { '15m': 1.0, '1h': 1.2, '24h': 1.1, '4h': 0.9 },
        stabilityByHorizon: { '15m': 0.08, '1h': 0.09, '24h': 0.1, '4h': 0.11 },
      };
      const medianStability: Record<TimeframeId, number> = {
        '15m': 0.1, '1h': 0.1, '24h': 0.1, '4h': 0.1,
      };

      expect(shouldEliminatePhase2(modelScore, medianStability)).toBe(false);
    });
  });
});
