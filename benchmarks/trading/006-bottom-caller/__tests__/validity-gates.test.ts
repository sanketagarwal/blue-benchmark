import { describe, expect, it } from 'vitest';
import {
  checkHorizonValidity,
  checkModelValidity,
  getDefaultValidityConfig,
  type ValidityConfig,
} from '../src/scorers/validity-gates.js';
import type { TimeframeId } from '../src/timeframe-config.js';

describe('validity-gates', () => {
  describe('getDefaultValidityConfig', () => {
    it('returns expected default values', () => {
      const config = getDefaultValidityConfig();

      expect(config.minCoverage).toBe(0.8);
      expect(config.maxFailureRate).toBe(0.1);
      expect(config.constantPredictor.maxUniqueP).toBe(2);
      expect(config.constantPredictor.maxPStdDev).toBe(0.02);
      expect(config.extremeWrongRate).toBe(0.2);
      expect(config.extremeThresholds.high).toBe(0.9);
      expect(config.extremeThresholds.low).toBe(0.1);
    });
  });

  describe('checkHorizonValidity', () => {
    const config = getDefaultValidityConfig();
    const horizon: TimeframeId = '1h';

    describe('coverage gate', () => {
      it('fails when effectiveN < threshold (coverage < 80%)', () => {
        const predictions = [0.5, 0.6, 0.4];
        const labels = [true, false, true];
        const totalRounds = 10;
        const failedRounds = 0;

        const result = checkHorizonValidity(
          predictions,
          labels,
          failedRounds,
          totalRounds,
          horizon,
          config
        );

        expect(result.isValid).toBe(false);
        expect(result.failureReasons).toContain('coverage');
        expect(result.metrics.coverage).toBe(0.3);
      });

      it('passes when coverage >= 80%', () => {
        const predictions = Array.from({ length: 80 }, (_, i) => 0.3 + (i % 50) * 0.01);
        const labels = Array.from({ length: 80 }, (_, i) => i % 2 === 0);
        const totalRounds = 100;
        const failedRounds = 0;

        const result = checkHorizonValidity(
          predictions,
          labels,
          failedRounds,
          totalRounds,
          horizon,
          config
        );

        expect(result.failureReasons).not.toContain('coverage');
        expect(result.metrics.coverage).toBe(0.8);
      });
    });

    describe('failure rate gate', () => {
      it('fails when >10% failure rate', () => {
        const predictions = Array.from({ length: 80 }, (_, i) => 0.3 + (i % 50) * 0.01);
        const labels = Array.from({ length: 80 }, (_, i) => i % 2 === 0);
        const totalRounds = 100;
        const failedRounds = 15;

        const result = checkHorizonValidity(
          predictions,
          labels,
          failedRounds,
          totalRounds,
          horizon,
          config
        );

        expect(result.isValid).toBe(false);
        expect(result.failureReasons).toContain('failure_rate');
        expect(result.metrics.failureRate).toBe(0.15);
      });

      it('passes when failure rate <= 10%', () => {
        const predictions = Array.from({ length: 90 }, (_, i) => 0.3 + (i % 50) * 0.01);
        const labels = Array.from({ length: 90 }, (_, i) => i % 2 === 0);
        const totalRounds = 100;
        const failedRounds = 10;

        const result = checkHorizonValidity(
          predictions,
          labels,
          failedRounds,
          totalRounds,
          horizon,
          config
        );

        expect(result.failureReasons).not.toContain('failure_rate');
        expect(result.metrics.failureRate).toBe(0.1);
      });
    });

    describe('degeneracy gate - constant predictor', () => {
      it('fails when uniqueP <= 2 and stdDev <= 0.02', () => {
        const predictions = Array.from({ length: 100 }, () => 0.5);
        const labels = Array.from({ length: 100 }, (_, i) => i % 2 === 0);
        const totalRounds = 100;
        const failedRounds = 0;

        const result = checkHorizonValidity(
          predictions,
          labels,
          failedRounds,
          totalRounds,
          horizon,
          config
        );

        expect(result.isValid).toBe(false);
        expect(result.failureReasons).toContain('constant_predictor');
        expect(result.metrics.uniqueP).toBe(1);
        expect(result.metrics.pStdDev).toBe(0);
      });

      it('fails when uniqueP = 2 with very low variance', () => {
        const predictions = Array.from({ length: 100 }, (_, i) =>
          i % 2 === 0 ? 0.50 : 0.51
        );
        const labels = Array.from({ length: 100 }, (_, i) => i % 2 === 0);
        const totalRounds = 100;
        const failedRounds = 0;

        const result = checkHorizonValidity(
          predictions,
          labels,
          failedRounds,
          totalRounds,
          horizon,
          config
        );

        expect(result.isValid).toBe(false);
        expect(result.failureReasons).toContain('constant_predictor');
        expect(result.metrics.uniqueP).toBe(2);
        expect(result.metrics.pStdDev).toBeLessThanOrEqual(0.02);
      });

      it('passes when sufficient variation (uniqueP > 2)', () => {
        const predictions = Array.from({ length: 100 }, (_, i) =>
          0.3 + (i % 50) * 0.01
        );
        const labels = Array.from({ length: 100 }, (_, i) => i % 2 === 0);
        const totalRounds = 100;
        const failedRounds = 0;

        const result = checkHorizonValidity(
          predictions,
          labels,
          failedRounds,
          totalRounds,
          horizon,
          config
        );

        expect(result.failureReasons).not.toContain('constant_predictor');
        expect(result.metrics.uniqueP).toBeGreaterThan(2);
      });
    });

    describe('degeneracy gate - extreme predictions', () => {
      it('fails when >90% predictions at p >= 0.9 or p <= 0.1', () => {
        const predictions = Array.from({ length: 100 }, (_, i) =>
          i < 95 ? 0.95 : 0.5
        );
        const labels = Array.from({ length: 100 }, () => true);
        const totalRounds = 100;
        const failedRounds = 0;

        const result = checkHorizonValidity(
          predictions,
          labels,
          failedRounds,
          totalRounds,
          horizon,
          config
        );

        expect(result.isValid).toBe(false);
        expect(result.failureReasons).toContain('extreme_predictions');
        expect(result.metrics.extremePredictionRate).toBe(0.95);
      });

      it('fails when >90% predictions at low extreme (p <= 0.1)', () => {
        const predictions = Array.from({ length: 100 }, (_, i) =>
          i < 92 ? 0.05 : 0.5
        );
        const labels = Array.from({ length: 100 }, () => false);
        const totalRounds = 100;
        const failedRounds = 0;

        const result = checkHorizonValidity(
          predictions,
          labels,
          failedRounds,
          totalRounds,
          horizon,
          config
        );

        expect(result.isValid).toBe(false);
        expect(result.failureReasons).toContain('extreme_predictions');
        expect(result.metrics.extremePredictionRate).toBe(0.92);
      });

      it('passes when extreme prediction rate <= 90%', () => {
        const predictions = Array.from({ length: 100 }, (_, i) =>
          i < 50 ? 0.95 : 0.5
        );
        const labels = Array.from({ length: 100 }, (_, i) => i % 2 === 0);
        const totalRounds = 100;
        const failedRounds = 0;

        const result = checkHorizonValidity(
          predictions,
          labels,
          failedRounds,
          totalRounds,
          horizon,
          config
        );

        expect(result.failureReasons).not.toContain('extreme_predictions');
        expect(result.metrics.extremePredictionRate).toBe(0.5);
      });
    });

    describe('extreme wrong gate', () => {
      it('fails when >20% confident wrong (p > 0.8 when y=0)', () => {
        const predictions = Array.from({ length: 100 }, (_, i) =>
          i < 25 ? 0.85 : 0.5
        );
        const labels = Array.from({ length: 100 }, () => false);
        const totalRounds = 100;
        const failedRounds = 0;

        const result = checkHorizonValidity(
          predictions,
          labels,
          failedRounds,
          totalRounds,
          horizon,
          config
        );

        expect(result.isValid).toBe(false);
        expect(result.failureReasons).toContain('extreme_wrong_rate');
        expect(result.metrics.confidentWrongRate).toBe(0.25);
      });

      it('fails when >20% confident wrong (p < 0.2 when y=1)', () => {
        const predictions = Array.from({ length: 100 }, (_, i) =>
          i < 25 ? 0.15 : 0.5
        );
        const labels = Array.from({ length: 100 }, () => true);
        const totalRounds = 100;
        const failedRounds = 0;

        const result = checkHorizonValidity(
          predictions,
          labels,
          failedRounds,
          totalRounds,
          horizon,
          config
        );

        expect(result.isValid).toBe(false);
        expect(result.failureReasons).toContain('extreme_wrong_rate');
        expect(result.metrics.confidentWrongRate).toBe(0.25);
      });

      it('passes when confident wrong rate <= 20%', () => {
        const predictions = Array.from({ length: 100 }, (_, i) =>
          i < 20 ? 0.85 : 0.5
        );
        const labels = Array.from({ length: 100 }, () => false);
        const totalRounds = 100;
        const failedRounds = 0;

        const result = checkHorizonValidity(
          predictions,
          labels,
          failedRounds,
          totalRounds,
          horizon,
          config
        );

        expect(result.failureReasons).not.toContain('extreme_wrong_rate');
        expect(result.metrics.confidentWrongRate).toBe(0.2);
      });
    });

    describe('combinations', () => {
      it('passes when all gates pass', () => {
        const predictions = Array.from({ length: 90 }, (_, i) =>
          0.3 + (i % 40) * 0.01
        );
        const labels = Array.from({ length: 90 }, (_, i) => i % 2 === 0);
        const totalRounds = 100;
        const failedRounds = 5;

        const result = checkHorizonValidity(
          predictions,
          labels,
          failedRounds,
          totalRounds,
          horizon,
          config
        );

        expect(result.isValid).toBe(true);
        expect(result.failureReasons).toHaveLength(0);
      });

      it('fails with single gate failure', () => {
        const predictions = Array.from({ length: 50 }, (_, i) =>
          0.3 + (i % 40) * 0.01
        );
        const labels = Array.from({ length: 50 }, (_, i) => i % 2 === 0);
        const totalRounds = 100;
        const failedRounds = 0;

        const result = checkHorizonValidity(
          predictions,
          labels,
          failedRounds,
          totalRounds,
          horizon,
          config
        );

        expect(result.isValid).toBe(false);
        expect(result.failureReasons).toHaveLength(1);
        expect(result.failureReasons).toContain('coverage');
      });

      it('fails with multiple gate failures', () => {
        const predictions = Array.from({ length: 50 }, () => 0.5);
        const labels = Array.from({ length: 50 }, (_, i) => i % 2 === 0);
        const totalRounds = 100;
        const failedRounds = 20;

        const result = checkHorizonValidity(
          predictions,
          labels,
          failedRounds,
          totalRounds,
          horizon,
          config
        );

        expect(result.isValid).toBe(false);
        expect(result.failureReasons.length).toBeGreaterThan(1);
        expect(result.failureReasons).toContain('coverage');
        expect(result.failureReasons).toContain('failure_rate');
        expect(result.failureReasons).toContain('constant_predictor');
      });
    });

    it('returns correct horizon in result', () => {
      const result = checkHorizonValidity(
        [0.5],
        [true],
        0,
        1,
        '15m',
        config
      );
      expect(result.horizon).toBe('15m');
    });
  });

  describe('checkModelValidity', () => {
    const config = getDefaultValidityConfig();
    const totalRounds = 100;

    function makeGoodData(length: number): { predictions: number[]; labels: boolean[] } {
      return {
        predictions: Array.from({ length }, (_, i) => 0.3 + (i % 40) * 0.01),
        labels: Array.from({ length }, (_, i) => i % 2 === 0),
      };
    }

    function makeBadData(length: number): { predictions: number[]; labels: boolean[] } {
      return {
        predictions: Array.from({ length }, () => 0.5),
        labels: Array.from({ length }, (_, i) => i % 2 === 0),
      };
    }

    it('aggregates all valid horizons correctly', () => {
      const good = makeGoodData(90);
      const predictionsByHorizon: Record<TimeframeId, number[]> = {
        '15m': good.predictions,
        '1h': good.predictions,
        '4h': good.predictions,
        '24h': good.predictions,
      };
      const labelsByHorizon: Record<TimeframeId, boolean[]> = {
        '15m': good.labels,
        '1h': good.labels,
        '4h': good.labels,
        '24h': good.labels,
      };
      const failedRoundsByHorizon: Record<TimeframeId, number> = {
        '15m': 5,
        '1h': 5,
        '4h': 5,
        '24h': 5,
      };

      const result = checkModelValidity(
        'model-1',
        predictionsByHorizon,
        labelsByHorizon,
        failedRoundsByHorizon,
        totalRounds,
        config
      );

      expect(result.modelId).toBe('model-1');
      expect(result.validHorizons).toHaveLength(4);
      expect(result.validHorizons).toContain('15m');
      expect(result.validHorizons).toContain('1h');
      expect(result.validHorizons).toContain('4h');
      expect(result.validHorizons).toContain('24h');
      expect(result.invalidHorizons.size).toBe(0);
      expect(result.isFullyInvalid).toBe(false);
    });

    it('marks model as fully invalid when all horizons fail', () => {
      const bad = makeBadData(50);
      const predictionsByHorizon: Record<TimeframeId, number[]> = {
        '15m': bad.predictions,
        '1h': bad.predictions,
        '4h': bad.predictions,
        '24h': bad.predictions,
      };
      const labelsByHorizon: Record<TimeframeId, boolean[]> = {
        '15m': bad.labels,
        '1h': bad.labels,
        '4h': bad.labels,
        '24h': bad.labels,
      };
      const failedRoundsByHorizon: Record<TimeframeId, number> = {
        '15m': 0,
        '1h': 0,
        '4h': 0,
        '24h': 0,
      };

      const result = checkModelValidity(
        'bad-model',
        predictionsByHorizon,
        labelsByHorizon,
        failedRoundsByHorizon,
        totalRounds,
        config
      );

      expect(result.modelId).toBe('bad-model');
      expect(result.validHorizons).toHaveLength(0);
      expect(result.invalidHorizons.size).toBe(4);
      expect(result.isFullyInvalid).toBe(true);
    });

    it('handles mixed valid and invalid horizons', () => {
      const good = makeGoodData(90);
      const bad = makeBadData(50);
      const predictionsByHorizon: Record<TimeframeId, number[]> = {
        '15m': good.predictions,
        '1h': bad.predictions,
        '4h': good.predictions,
        '24h': bad.predictions,
      };
      const labelsByHorizon: Record<TimeframeId, boolean[]> = {
        '15m': good.labels,
        '1h': bad.labels,
        '4h': good.labels,
        '24h': bad.labels,
      };
      const failedRoundsByHorizon: Record<TimeframeId, number> = {
        '15m': 5,
        '1h': 0,
        '4h': 5,
        '24h': 0,
      };

      const result = checkModelValidity(
        'mixed-model',
        predictionsByHorizon,
        labelsByHorizon,
        failedRoundsByHorizon,
        totalRounds,
        config
      );

      expect(result.modelId).toBe('mixed-model');
      expect(result.validHorizons).toHaveLength(2);
      expect(result.validHorizons).toContain('15m');
      expect(result.validHorizons).toContain('4h');
      expect(result.invalidHorizons.size).toBe(2);
      expect(result.invalidHorizons.has('1h')).toBe(true);
      expect(result.invalidHorizons.has('24h')).toBe(true);
      expect(result.isFullyInvalid).toBe(false);
    });

    it('includes failure details in invalidHorizons map', () => {
      const bad = makeBadData(50);
      const predictionsByHorizon: Record<TimeframeId, number[]> = {
        '15m': bad.predictions,
        '1h': bad.predictions,
        '4h': bad.predictions,
        '24h': bad.predictions,
      };
      const labelsByHorizon: Record<TimeframeId, boolean[]> = {
        '15m': bad.labels,
        '1h': bad.labels,
        '4h': bad.labels,
        '24h': bad.labels,
      };
      const failedRoundsByHorizon: Record<TimeframeId, number> = {
        '15m': 0,
        '1h': 0,
        '4h': 0,
        '24h': 0,
      };

      const result = checkModelValidity(
        'test',
        predictionsByHorizon,
        labelsByHorizon,
        failedRoundsByHorizon,
        totalRounds,
        config
      );

      const horizon1hResult = result.invalidHorizons.get('1h');
      expect(horizon1hResult).toBeDefined();
      expect(horizon1hResult?.horizon).toBe('1h');
      expect(horizon1hResult?.isValid).toBe(false);
      expect(horizon1hResult?.failureReasons.length).toBeGreaterThan(0);
      expect(horizon1hResult?.metrics.coverage).toBe(0.5);
    });
  });
});
