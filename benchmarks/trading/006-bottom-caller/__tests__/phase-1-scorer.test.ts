import { describe, expect, it } from 'vitest';
import {
  computePercentileRanks,
  shouldEliminatePhase1,
  type Phase1ModelScore,
} from '../src/scorers/phase-1-scorer.js';
import type { TimeframeId } from '../src/timeframe-config.js';

describe('phase-1-scorer', () => {
  describe('computePercentileRanks', () => {
    it('computes percentile rank per horizon relative to cohort', () => {
      const modelScores: Phase1ModelScore[] = [
        { modelId: 'model-a', meanLogLoss: { '15m': 0.3, '1h': 0.4, '24h': 0.5, '4h': 0.6 } },
        { modelId: 'model-b', meanLogLoss: { '15m': 0.4, '1h': 0.5, '24h': 0.6, '4h': 0.7 } },
        { modelId: 'model-c', meanLogLoss: { '15m': 0.5, '1h': 0.6, '24h': 0.7, '4h': 0.8 } },
        { modelId: 'model-d', meanLogLoss: { '15m': 0.6, '1h': 0.7, '24h': 0.8, '4h': 0.9 } },
        { modelId: 'model-e', meanLogLoss: { '15m': 0.7, '1h': 0.8, '24h': 0.9, '4h': 1.0 } },
      ];

      const ranks = computePercentileRanks(modelScores);

      expect(ranks.get('model-a')?.['15m']).toBeGreaterThan(75);
      expect(ranks.get('model-e')?.['15m']).toBeLessThan(25);
    });
  });

  describe('shouldEliminatePhase1', () => {
    it('eliminates if percentileRank < 25 on 2+ horizons', () => {
      const percentiles: Record<TimeframeId, number> = {
        '15m': 20,
        '1h': 15,
        '24h': 50,
        '4h': 60,
      };

      expect(shouldEliminatePhase1(percentiles)).toBe(true);
    });

    it('eliminates if no horizon has percentileRank >= 75', () => {
      const percentiles: Record<TimeframeId, number> = {
        '15m': 50,
        '1h': 60,
        '24h': 55,
        '4h': 65,
      };

      expect(shouldEliminatePhase1(percentiles)).toBe(true);
    });

    it('keeps specialists with one strong horizon', () => {
      const percentiles: Record<TimeframeId, number> = {
        '15m': 80,
        '1h': 40,
        '24h': 35,
        '4h': 30,
      };

      expect(shouldEliminatePhase1(percentiles)).toBe(false);
    });

    it('keeps well-rounded models', () => {
      const percentiles: Record<TimeframeId, number> = {
        '15m': 60,
        '1h': 80,
        '24h': 55,
        '4h': 50,
      };

      expect(shouldEliminatePhase1(percentiles)).toBe(false);
    });
  });
});
