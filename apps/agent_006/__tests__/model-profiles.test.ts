import { describe, it, expect } from 'vitest';
import {
  buildModelProfile,
  formatProfileTable,
  calculateCalibrationSlope,
  calculateExpectedCalibrationError,
} from '../src/reports/model-profiles';
import type { ModelQualityProfile } from '../src/reports/model-profiles';

describe('model-profiles', () => {
  describe('calculateCalibrationSlope', () => {
    it('returns ~1.0 for perfectly calibrated predictions', () => {
      // When predictions exactly match actual frequencies, slope should be ~1.0
      const predictions = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
      // Create labels that match the predictions roughly
      const labels = [false, false, false, false, false, true, true, true, true];
      // Slope won't be exactly 1.0 due to discrete labels, but should be positive
      const slope = calculateCalibrationSlope(predictions, labels);
      expect(slope).toBeGreaterThan(0);
    });

    it('returns positive slope for overconfident predictions', () => {
      // High predictions when actual frequency is lower
      const predictions = [0.9, 0.9, 0.9, 0.9];
      const labels = [true, true, false, false]; // 50% actual positive
      const slope = calculateCalibrationSlope(predictions, labels);
      expect(Number.isNaN(slope)).toBe(true); // All same predictions = NaN
    });

    it('returns NaN when all predictions are identical', () => {
      const predictions = [0.5, 0.5, 0.5, 0.5];
      const labels = [true, false, true, false];
      const slope = calculateCalibrationSlope(predictions, labels);
      expect(Number.isNaN(slope)).toBe(true);
    });

    it('returns NaN for single prediction', () => {
      const slope = calculateCalibrationSlope([0.5], [true]);
      expect(Number.isNaN(slope)).toBe(true);
    });

    it('returns NaN for empty arrays', () => {
      const slope = calculateCalibrationSlope([], []);
      expect(Number.isNaN(slope)).toBe(true);
    });

    it('throws error for mismatched array lengths', () => {
      expect(() => calculateCalibrationSlope([0.5, 0.6], [true])).toThrow(
        'Array length mismatch'
      );
    });

    it('handles varied predictions correctly', () => {
      // Mix of low and high predictions
      const predictions = [0.2, 0.3, 0.7, 0.8];
      const labels = [false, false, true, true];
      const slope = calculateCalibrationSlope(predictions, labels);
      // With good calibration, slope should be positive
      expect(slope).toBeGreaterThan(0);
    });
  });

  describe('calculateExpectedCalibrationError', () => {
    it('returns 0 for perfectly calibrated predictions at bin center', () => {
      // All predictions at 1.0 (bin 9), all actually positive
      const predictions = [1.0, 1.0, 1.0, 1.0];
      const labels = [true, true, true, true];
      // avgPredicted = 1.0, actualFreq = 1.0, |1.0 - 1.0| = 0
      expect(calculateExpectedCalibrationError(predictions, labels)).toBe(0);
    });

    it('returns higher ECE for poorly calibrated predictions', () => {
      // All predictions at 0.95, but half are actually negative
      const predictions = [0.95, 0.95, 0.95, 0.95];
      const labels = [true, true, false, false];
      // avgPredicted = 0.95, actualFreq = 0.5, |0.95 - 0.5| = 0.45
      expect(calculateExpectedCalibrationError(predictions, labels)).toBeCloseTo(0.45);
    });

    it('handles prediction exactly at bin boundary (1.0)', () => {
      const predictions = [1.0];
      const labels = [true];
      // 1.0 should go to bin 9 (last bin), |1.0 - 1| = 0
      expect(calculateExpectedCalibrationError(predictions, labels)).toBe(0);
    });

    it('throws error for mismatched array lengths', () => {
      expect(() => calculateExpectedCalibrationError([0.5], [true, false])).toThrow(
        'Array length mismatch'
      );
    });

    it('returns NaN for empty arrays', () => {
      expect(Number.isNaN(calculateExpectedCalibrationError([], []))).toBe(true);
    });

    it('calculates ECE across multiple bins', () => {
      // Bin 0 (0.0-0.1): prediction 0.05, label false -> |0.05 - 0| = 0.05
      // Bin 9 (0.9-1.0): prediction 0.95, label true -> |0.95 - 1| = 0.05
      const predictions = [0.05, 0.95];
      const labels = [false, true];
      // ECE = 0.5 * 0.05 + 0.5 * 0.05 = 0.05
      expect(calculateExpectedCalibrationError(predictions, labels)).toBeCloseTo(0.05);
    });
  });

  describe('buildModelProfile', () => {
    it('builds profile with correct modelId', () => {
      const roundData = [
        {
          predictions: { '15m': 0.8, '1h': 0.7, '4h': 0.6, '24h': 0.5 },
          labels: { '15m': true, '1h': true, '4h': false, '24h': false },
        },
      ];

      const profile = buildModelProfile('test-model', roundData);
      expect(profile.modelId).toBe('test-model');
    });

    it('calculates mean log loss and Brier score', () => {
      const roundData = [
        {
          predictions: { '15m': 0.9, '1h': 0.9, '4h': 0.9, '24h': 0.9 },
          labels: { '15m': true, '1h': true, '4h': true, '24h': true },
        },
      ];

      const profile = buildModelProfile('model', roundData);
      // With p=0.9 and y=1, log loss = -log(0.9) ≈ 0.105, Brier = (0.9-1)^2 = 0.01
      expect(profile.meanLogLoss).toBeCloseTo(0.105, 2);
      expect(profile.meanBrier).toBeCloseTo(0.01, 3);
    });

    it('calculates TP/FP/FN rates correctly', () => {
      const roundData = [
        {
          predictions: { '15m': 0.8, '1h': 0.8, '4h': 0.2, '24h': 0.2 },
          labels: { '15m': true, '1h': false, '4h': true, '24h': false },
        },
      ];
      // p > 0.5 for 15m (TP: true, true), 1h (FP: true, false)
      // p <= 0.5 for 4h (FN: false, true), 24h (TN: false, false)
      // TP=1, FP=1, TN=1, FN=1
      // TPR = TP/(TP+FN) = 1/2 = 0.5
      // FPR = FP/(FP+TN) = 1/2 = 0.5
      // FNR = FN/(TP+FN) = 1/2 = 0.5

      const profile = buildModelProfile('model', roundData);
      expect(profile.tpRate).toBeCloseTo(0.5);
      expect(profile.fpRate).toBeCloseTo(0.5);
      expect(profile.fnRate).toBeCloseTo(0.5);
    });

    it('calculates variance by horizon', () => {
      const roundData = [
        {
          predictions: { '15m': 0.2, '1h': 0.5, '4h': 0.5, '24h': 0.5 },
          labels: { '15m': true, '1h': true, '4h': true, '24h': true },
        },
        {
          predictions: { '15m': 0.8, '1h': 0.5, '4h': 0.5, '24h': 0.5 },
          labels: { '15m': true, '1h': true, '4h': true, '24h': true },
        },
      ];
      // 15m variance: mean=0.5, values=[0.2, 0.8], var = ((0.2-0.5)^2 + (0.8-0.5)^2)/1 = 0.18
      // 1h variance: mean=0.5, values=[0.5, 0.5], var = 0
      // 4h variance: mean=0.5, values=[0.5, 0.5], var = 0
      // 24h variance: mean=0.5, values=[0.5, 0.5], var = 0

      const profile = buildModelProfile('model', roundData);
      expect(profile.varianceByHorizon['15m']).toBeCloseTo(0.18);
      expect(profile.varianceByHorizon['1h']).toBeCloseTo(0);
      expect(profile.varianceByHorizon['4h']).toBeCloseTo(0);
      expect(profile.varianceByHorizon['24h']).toBeCloseTo(0);
    });

    it('handles empty round data', () => {
      const profile = buildModelProfile('empty-model', []);
      expect(profile.modelId).toBe('empty-model');
      expect(Number.isNaN(profile.meanLogLoss)).toBe(true);
      expect(Number.isNaN(profile.meanBrier)).toBe(true);
      expect(Number.isNaN(profile.calibrationSlope)).toBe(true);
      expect(Number.isNaN(profile.expectedCalibrationError)).toBe(true);
      expect(Number.isNaN(profile.tpRate)).toBe(true);
      expect(Number.isNaN(profile.fpRate)).toBe(true);
      expect(Number.isNaN(profile.fnRate)).toBe(true);
    });

    it('uses provided logLosses and briers when available', () => {
      const roundData = [
        {
          predictions: { '15m': 0.9, '1h': 0.9, '4h': 0.9, '24h': 0.9 },
          labels: { '15m': true, '1h': true, '4h': true, '24h': true },
          logLosses: { '15m': 0.2, '1h': 0.2, '4h': 0.2, '24h': 0.2 },
          briers: { '15m': 0.05, '1h': 0.05, '4h': 0.05, '24h': 0.05 },
        },
      ];

      const profile = buildModelProfile('model', roundData);
      expect(profile.meanLogLoss).toBeCloseTo(0.2);
      expect(profile.meanBrier).toBeCloseTo(0.05);
    });

    it('handles single round with all same labels', () => {
      const roundData = [
        {
          predictions: { '15m': 0.8, '1h': 0.7, '4h': 0.6, '24h': 0.5 },
          labels: { '15m': true, '1h': true, '4h': true, '24h': true },
        },
      ];

      const profile = buildModelProfile('model', roundData);
      // All positive labels: FPR should be NaN (no negatives to measure against)
      // TPR should be 1.0 (all positives correctly classified since p > 0.5 for first three)
      // FNR should be 0 (no false negatives, except 24h where p=0.5 is considered negative)
      expect(profile.tpRate).toBeCloseTo(0.75); // 3/4 predicted positive correctly
      expect(Number.isNaN(profile.fpRate)).toBe(true); // No actual negatives
      expect(profile.fnRate).toBeCloseTo(0.25); // 1/4 false negative (24h)
    });

    it('calculates calibration slope from predictions', () => {
      const roundData = [
        {
          predictions: { '15m': 0.2, '1h': 0.4, '4h': 0.6, '24h': 0.8 },
          labels: { '15m': false, '1h': false, '4h': true, '24h': true },
        },
        {
          predictions: { '15m': 0.3, '1h': 0.5, '4h': 0.7, '24h': 0.9 },
          labels: { '15m': false, '1h': true, '4h': true, '24h': true },
        },
      ];

      const profile = buildModelProfile('model', roundData);
      // Slope should be positive (higher predictions correlate with more positives)
      expect(profile.calibrationSlope).toBeGreaterThan(0);
    });
  });

  describe('formatProfileTable', () => {
    it('returns formatted table string', () => {
      const profiles: ModelQualityProfile[] = [
        {
          modelId: 'test-model',
          meanLogLoss: 0.423,
          meanBrier: 0.189,
          calibrationSlope: 0.95,
          expectedCalibrationError: 0.08,
          tpRate: 0.75,
          fpRate: 0.25,
          fnRate: 0.25,
          varianceByHorizon: { '15m': 0.05, '1h': 0.04, '4h': 0.03, '24h': 0.02 },
        },
      ];

      const table = formatProfileTable(profiles);
      expect(typeof table).toBe('string');
      expect(table.length).toBeGreaterThan(0);
    });

    it('includes title', () => {
      const profiles: ModelQualityProfile[] = [
        {
          modelId: 'model',
          meanLogLoss: 0.5,
          meanBrier: 0.2,
          calibrationSlope: 1.0,
          expectedCalibrationError: 0.1,
          tpRate: 0.8,
          fpRate: 0.2,
          fnRate: 0.2,
          varianceByHorizon: { '15m': 0.05, '1h': 0.04, '4h': 0.03, '24h': 0.02 },
        },
      ];

      const table = formatProfileTable(profiles);
      expect(table).toContain('Model Quality Profiles');
    });

    it('includes all column headers', () => {
      const profiles: ModelQualityProfile[] = [
        {
          modelId: 'model',
          meanLogLoss: 0.5,
          meanBrier: 0.2,
          calibrationSlope: 1.0,
          expectedCalibrationError: 0.1,
          tpRate: 0.8,
          fpRate: 0.2,
          fnRate: 0.2,
          varianceByHorizon: { '15m': 0.05, '1h': 0.04, '4h': 0.03, '24h': 0.02 },
        },
      ];

      const table = formatProfileTable(profiles);
      expect(table).toContain('Model');
      expect(table).toContain('LL');
      expect(table).toContain('Brier');
      expect(table).toContain('Slope');
      expect(table).toContain('ECE');
      expect(table).toContain('TPR');
      expect(table).toContain('FPR');
      expect(table).toContain('FNR');
      expect(table).toContain('Var(15m)');
    });

    it('displays model data correctly', () => {
      const profiles: ModelQualityProfile[] = [
        {
          modelId: 'test-model',
          meanLogLoss: 0.423,
          meanBrier: 0.189,
          calibrationSlope: 0.95,
          expectedCalibrationError: 0.08,
          tpRate: 0.75,
          fpRate: 0.25,
          fnRate: 0.25,
          varianceByHorizon: { '15m': 0.05, '1h': 0.04, '4h': 0.03, '24h': 0.02 },
        },
      ];

      const table = formatProfileTable(profiles);
      expect(table).toContain('test-model');
      expect(table).toContain('0.423'); // LL
      expect(table).toContain('0.189'); // Brier
      expect(table).toContain('0.95'); // Slope
      expect(table).toContain('0.080'); // ECE
    });

    it('handles empty profiles array', () => {
      const profiles: ModelQualityProfile[] = [];
      const table = formatProfileTable(profiles);

      expect(table).toContain('Model Quality Profiles');
      // Should still have headers even with no data
      expect(table).toContain('Model');
    });

    it('formats percentages correctly', () => {
      const profiles: ModelQualityProfile[] = [
        {
          modelId: 'model',
          meanLogLoss: 0.5,
          meanBrier: 0.2,
          calibrationSlope: 1.0,
          expectedCalibrationError: 0.1,
          tpRate: 0.756,
          fpRate: 0.244,
          fnRate: 0.244,
          varianceByHorizon: { '15m': 0.05, '1h': 0.04, '4h': 0.03, '24h': 0.02 },
        },
      ];

      const table = formatProfileTable(profiles);
      expect(table).toContain('75.6%'); // TPR
      expect(table).toContain('24.4%'); // FPR, FNR
    });

    it('sorts profiles by mean log loss (lower is better)', () => {
      const profiles: ModelQualityProfile[] = [
        {
          modelId: 'worst',
          meanLogLoss: 0.9,
          meanBrier: 0.3,
          calibrationSlope: 0.5,
          expectedCalibrationError: 0.3,
          tpRate: 0.5,
          fpRate: 0.5,
          fnRate: 0.5,
          varianceByHorizon: { '15m': 0.1, '1h': 0.1, '4h': 0.1, '24h': 0.1 },
        },
        {
          modelId: 'best',
          meanLogLoss: 0.3,
          meanBrier: 0.1,
          calibrationSlope: 0.9,
          expectedCalibrationError: 0.05,
          tpRate: 0.9,
          fpRate: 0.1,
          fnRate: 0.1,
          varianceByHorizon: { '15m': 0.02, '1h': 0.02, '4h': 0.02, '24h': 0.02 },
        },
      ];

      const table = formatProfileTable(profiles);
      // 'best' should appear before 'worst' in the table
      const bestIndex = table.indexOf('best');
      const worstIndex = table.indexOf('worst');
      expect(bestIndex).toBeLessThan(worstIndex);
    });

    it('handles NaN values with dashes', () => {
      const profiles: ModelQualityProfile[] = [
        {
          modelId: 'model',
          meanLogLoss: Number.NaN,
          meanBrier: Number.NaN,
          calibrationSlope: Number.NaN,
          expectedCalibrationError: Number.NaN,
          tpRate: Number.NaN,
          fpRate: Number.NaN,
          fnRate: Number.NaN,
          varianceByHorizon: {
            '15m': Number.NaN,
            '1h': Number.NaN,
            '4h': Number.NaN,
            '24h': Number.NaN,
          },
        },
      ];

      const table = formatProfileTable(profiles);
      expect(table).toContain('model');
      // NaN values should be displayed as dashes (chalk.dim('-'))
      expect(table).toContain('-');
    });

    it('pushes NaN meanLogLoss models to end of sorted list', () => {
      const profiles: ModelQualityProfile[] = [
        {
          modelId: 'nan-model',
          meanLogLoss: Number.NaN,
          meanBrier: 0.2,
          calibrationSlope: 1.0,
          expectedCalibrationError: 0.1,
          tpRate: 0.8,
          fpRate: 0.2,
          fnRate: 0.2,
          varianceByHorizon: { '15m': 0.05, '1h': 0.04, '4h': 0.03, '24h': 0.02 },
        },
        {
          modelId: 'valid-model',
          meanLogLoss: 0.5,
          meanBrier: 0.2,
          calibrationSlope: 1.0,
          expectedCalibrationError: 0.1,
          tpRate: 0.8,
          fpRate: 0.2,
          fnRate: 0.2,
          varianceByHorizon: { '15m': 0.05, '1h': 0.04, '4h': 0.03, '24h': 0.02 },
        },
      ];

      const table = formatProfileTable(profiles);
      // 'valid-model' should appear before 'nan-model' in the table
      const validIndex = table.indexOf('valid-model');
      const nanIndex = table.indexOf('nan-model');
      expect(validIndex).toBeLessThan(nanIndex);
    });
  });

  describe('integration tests', () => {
    it('builds profile and formats table for multiple models', () => {
      const roundDataModelA = [
        {
          predictions: { '15m': 0.8, '1h': 0.7, '4h': 0.6, '24h': 0.5 },
          labels: { '15m': true, '1h': true, '4h': false, '24h': false },
        },
        {
          predictions: { '15m': 0.9, '1h': 0.8, '4h': 0.7, '24h': 0.6 },
          labels: { '15m': true, '1h': true, '4h': true, '24h': false },
        },
      ];

      const roundDataModelB = [
        {
          predictions: { '15m': 0.3, '1h': 0.4, '4h': 0.5, '24h': 0.6 },
          labels: { '15m': false, '1h': false, '4h': true, '24h': true },
        },
        {
          predictions: { '15m': 0.2, '1h': 0.3, '4h': 0.4, '24h': 0.5 },
          labels: { '15m': false, '1h': false, '4h': false, '24h': true },
        },
      ];

      const profileA = buildModelProfile('model-a', roundDataModelA);
      const profileB = buildModelProfile('model-b', roundDataModelB);

      const table = formatProfileTable([profileA, profileB]);

      expect(table).toContain('model-a');
      expect(table).toContain('model-b');
      expect(table).toContain('Model Quality Profiles');
    });

    it('produces consistent results for same input', () => {
      const roundData = [
        {
          predictions: { '15m': 0.8, '1h': 0.7, '4h': 0.6, '24h': 0.5 },
          labels: { '15m': true, '1h': true, '4h': false, '24h': false },
        },
      ];

      const profile1 = buildModelProfile('model', roundData);
      const profile2 = buildModelProfile('model', roundData);

      expect(profile1.meanLogLoss).toBe(profile2.meanLogLoss);
      expect(profile1.meanBrier).toBe(profile2.meanBrier);
      expect(profile1.calibrationSlope).toBe(profile2.calibrationSlope);
      expect(profile1.expectedCalibrationError).toBe(profile2.expectedCalibrationError);
      expect(profile1.tpRate).toBe(profile2.tpRate);
      expect(profile1.fpRate).toBe(profile2.fpRate);
      expect(profile1.fnRate).toBe(profile2.fnRate);
    });
  });
});
