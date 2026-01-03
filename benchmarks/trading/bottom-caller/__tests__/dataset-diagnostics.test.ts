import { describe, expect, it } from 'vitest';
import {
  computeLabelDistribution,
  computeBaselineMetrics,
  computeHorizonDiagnostics,
  computeDatasetDiagnostics,
  formatDatasetDiagnostics,
} from '../src/diagnostics/dataset-diagnostics';

const LOG_2 = Math.log(2);

describe('Dataset Diagnostics', () => {
  describe('computeLabelDistribution', () => {
    it('computes balanced labels (50/50)', () => {
      const labels = [true, false, true, false, true, false, true, false, true, false];
      const result = computeLabelDistribution(labels);

      expect(result.n).toBe(10);
      expect(result.countTrue).toBe(5);
      expect(result.countFalse).toBe(5);
      expect(result.pTrue).toBe(0.5);
    });

    it('computes skewed labels (90/10)', () => {
      const labels = [true, true, true, true, true, true, true, true, true, false];
      const result = computeLabelDistribution(labels);

      expect(result.n).toBe(10);
      expect(result.countTrue).toBe(9);
      expect(result.countFalse).toBe(1);
      expect(result.pTrue).toBe(0.9);
    });

    it('handles empty array', () => {
      const labels: boolean[] = [];
      const result = computeLabelDistribution(labels);

      expect(result.n).toBe(0);
      expect(result.countTrue).toBe(0);
      expect(result.countFalse).toBe(0);
      expect(result.pTrue).toBe(0);
    });

    it('handles all true labels', () => {
      const labels = [true, true, true];
      const result = computeLabelDistribution(labels);

      expect(result.n).toBe(3);
      expect(result.countTrue).toBe(3);
      expect(result.countFalse).toBe(0);
      expect(result.pTrue).toBe(1);
    });

    it('handles all false labels', () => {
      const labels = [false, false, false];
      const result = computeLabelDistribution(labels);

      expect(result.n).toBe(3);
      expect(result.countTrue).toBe(0);
      expect(result.countFalse).toBe(3);
      expect(result.pTrue).toBe(0);
    });
  });

  describe('computeBaselineMetrics', () => {
    it('random baseline is always log(2)', () => {
      const balanced = [true, false, true, false];
      const skewed = [true, true, true, false];
      const allTrue = [true, true, true];

      expect(computeBaselineMetrics(balanced).randomLogLoss).toBeCloseTo(LOG_2);
      expect(computeBaselineMetrics(skewed).randomLogLoss).toBeCloseTo(LOG_2);
      expect(computeBaselineMetrics(allTrue).randomLogLoss).toBeCloseTo(LOG_2);
    });

    it('prevalence baseline is correct for balanced labels', () => {
      const labels = [true, false, true, false];
      const result = computeBaselineMetrics(labels);

      expect(result.prevalenceLogLoss).toBeCloseTo(LOG_2);
    });

    it('prevalence baseline is lower than random for skewed labels', () => {
      const labels = [true, true, true, true, true, true, true, true, true, false];
      const result = computeBaselineMetrics(labels);

      expect(result.prevalenceLogLoss).toBeLessThan(result.randomLogLoss);
    });

    it('handles empty array', () => {
      const labels: boolean[] = [];
      const result = computeBaselineMetrics(labels);

      expect(result.randomLogLoss).toBeCloseTo(LOG_2);
      expect(result.prevalenceLogLoss).toBeCloseTo(LOG_2);
    });

    it('prevalence baseline approaches 0 for extreme skew with majority class', () => {
      const labels = Array(100).fill(true) as boolean[];
      const result = computeBaselineMetrics(labels);

      expect(result.prevalenceLogLoss).toBeLessThan(0.1);
    });
  });

  describe('computeHorizonDiagnostics', () => {
    it('returns correct horizon diagnostics', () => {
      const labels = [true, true, false, true, false];
      const result = computeHorizonDiagnostics('1h', labels);

      expect(result.horizon).toBe('1h');
      expect(result.labels.n).toBe(5);
      expect(result.labels.countTrue).toBe(3);
      expect(result.labels.countFalse).toBe(2);
      expect(result.labels.pTrue).toBeCloseTo(0.6);
      expect(result.baselines.randomLogLoss).toBeCloseTo(LOG_2);
    });
  });

  describe('computeDatasetDiagnostics', () => {
    it('works for all horizons', () => {
      const labelsByHorizon = {
        '15m': [true, false, true],
        '1h': [true, true, false, false],
        '4h': [true, true, true, false, false],
        '24h': [false, false, false, true],
      } as const;

      const result = computeDatasetDiagnostics(labelsByHorizon);

      expect(result.totalRounds).toBe(5);
      expect(result.byHorizon['15m'].labels.n).toBe(3);
      expect(result.byHorizon['1h'].labels.n).toBe(4);
      expect(result.byHorizon['4h'].labels.n).toBe(5);
      expect(result.byHorizon['24h'].labels.n).toBe(4);
    });

    it('handles missing horizons with empty arrays', () => {
      const labelsByHorizon = {
        '15m': [true, false],
        '1h': [],
        '4h': [],
        '24h': [],
      } as const;

      const result = computeDatasetDiagnostics(labelsByHorizon);

      expect(result.totalRounds).toBe(2);
      expect(result.byHorizon['15m'].labels.n).toBe(2);
      expect(result.byHorizon['1h'].labels.n).toBe(0);
      expect(result.byHorizon['4h'].labels.n).toBe(0);
      expect(result.byHorizon['24h'].labels.n).toBe(0);
    });
  });

  describe('formatDatasetDiagnostics', () => {
    it('produces human-readable output', () => {
      const labelsByHorizon = {
        '15m': [true, false],
        '1h': [true, true],
        '4h': [false],
        '24h': [],
      } as const;

      const diagnostics = computeDatasetDiagnostics(labelsByHorizon);
      const output = formatDatasetDiagnostics(diagnostics);

      expect(output).toContain('=== Dataset Diagnostics ===');
      expect(output).toContain('Total rounds: 2');
      expect(output).toContain('15m horizon:');
      expect(output).toContain('N=2');
      expect(output).toContain('True=1');
      expect(output).toContain('False=1');
      expect(output).toContain('pTrue=0.500');
      expect(output).toContain('random=0.693');
    });
  });
});
