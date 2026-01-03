import { describe, expect, test } from 'vitest';

import {
  computeHorizonPredictionDiversity,
  computeModelPredictionDiversity,
  computeStandardDeviation,
  formatPredictionDiversity,
  isConstantPredictor,
  type PredictionRecord,
} from '../src/diagnostics/prediction-diagnostics.js';

describe('computeStandardDeviation', () => {
  test('returns 0 for empty array', () => {
    expect(computeStandardDeviation([])).toBe(0);
  });

  test('returns 0 for single value', () => {
    expect(computeStandardDeviation([5])).toBe(0);
  });

  test('computes standard deviation correctly', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] has mean=5, stddev=2
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(computeStandardDeviation(values)).toBeCloseTo(2, 5);
  });

  test('returns 0 for identical values', () => {
    expect(computeStandardDeviation([0.5, 0.5, 0.5, 0.5])).toBe(0);
  });
});

describe('computeHorizonPredictionDiversity', () => {
  test('returns zero metrics for empty predictions', () => {
    const result = computeHorizonPredictionDiversity([]);
    expect(result).toEqual({
      n: 0,
      uniquePCount: 0,
      pMin: 0,
      pMax: 0,
      pStdDev: 0,
      confidenceStdDev: 0,
      noNewLowTrueRate: 0,
    });
  });

  test('computes metrics for varied predictions', () => {
    const predictions: PredictionRecord[] = [
      { noNewLow: true, confidence: 0.8, probability: 0.8 },
      { noNewLow: false, confidence: 0.7, probability: 0.3 },
      { noNewLow: true, confidence: 0.6, probability: 0.6 },
      { noNewLow: false, confidence: 0.9, probability: 0.1 },
    ];

    const result = computeHorizonPredictionDiversity(predictions);

    expect(result.n).toBe(4);
    expect(result.uniquePCount).toBe(4);
    expect(result.pMin).toBe(0.1);
    expect(result.pMax).toBe(0.8);
    expect(result.pStdDev).toBeGreaterThan(0);
    expect(result.confidenceStdDev).toBeGreaterThan(0);
    expect(result.noNewLowTrueRate).toBe(0.5);
  });

  test('detects constant predictions (uniquePCount = 1)', () => {
    const predictions: PredictionRecord[] = [
      { noNewLow: true, confidence: 0.5, probability: 0.5 },
      { noNewLow: true, confidence: 0.5, probability: 0.5 },
      { noNewLow: true, confidence: 0.5, probability: 0.5 },
    ];

    const result = computeHorizonPredictionDiversity(predictions);

    expect(result.n).toBe(3);
    expect(result.uniquePCount).toBe(1);
    expect(result.pMin).toBe(0.5);
    expect(result.pMax).toBe(0.5);
    expect(result.pStdDev).toBe(0);
    expect(result.confidenceStdDev).toBe(0);
    expect(result.noNewLowTrueRate).toBe(1);
  });

  test('handles single prediction', () => {
    const predictions: PredictionRecord[] = [
      { noNewLow: false, confidence: 0.6, probability: 0.4 },
    ];

    const result = computeHorizonPredictionDiversity(predictions);

    expect(result.n).toBe(1);
    expect(result.uniquePCount).toBe(1);
    expect(result.pMin).toBe(0.4);
    expect(result.pMax).toBe(0.4);
    expect(result.pStdDev).toBe(0);
    expect(result.noNewLowTrueRate).toBe(0);
  });
});

describe('isConstantPredictor', () => {
  test('returns true when all predictions are identical (uniquePCount = 1, n > 1)', () => {
    const diversity = {
      n: 5,
      uniquePCount: 1,
      pMin: 0.5,
      pMax: 0.5,
      pStdDev: 0,
      confidenceStdDev: 0,
      noNewLowTrueRate: 1,
    };
    expect(isConstantPredictor(diversity)).toBe(true);
  });

  test('returns false when predictions vary', () => {
    const diversity = {
      n: 5,
      uniquePCount: 3,
      pMin: 0.3,
      pMax: 0.8,
      pStdDev: 0.15,
      confidenceStdDev: 0.1,
      noNewLowTrueRate: 0.6,
    };
    expect(isConstantPredictor(diversity)).toBe(false);
  });

  test('returns false for single prediction (n = 1)', () => {
    const diversity = {
      n: 1,
      uniquePCount: 1,
      pMin: 0.5,
      pMax: 0.5,
      pStdDev: 0,
      confidenceStdDev: 0,
      noNewLowTrueRate: 1,
    };
    expect(isConstantPredictor(diversity)).toBe(false);
  });

  test('returns true when uniquePCount is 0 with n > 1', () => {
    const diversity = {
      n: 3,
      uniquePCount: 0,
      pMin: 0,
      pMax: 0,
      pStdDev: 0,
      confidenceStdDev: 0,
      noNewLowTrueRate: 0,
    };
    expect(isConstantPredictor(diversity)).toBe(true);
  });
});

describe('computeModelPredictionDiversity', () => {
  test('computes diversity for all horizons', () => {
    const predictionsByHorizon = {
      '15m': [
        { noNewLow: true, confidence: 0.8, probability: 0.8 },
        { noNewLow: false, confidence: 0.6, probability: 0.4 },
      ],
      '1h': [{ noNewLow: true, confidence: 0.7, probability: 0.7 }],
      '4h': [],
      '24h': [
        { noNewLow: false, confidence: 0.5, probability: 0.5 },
        { noNewLow: false, confidence: 0.5, probability: 0.5 },
        { noNewLow: false, confidence: 0.5, probability: 0.5 },
      ],
    };

    const result = computeModelPredictionDiversity(
      'test-model',
      predictionsByHorizon
    );

    expect(result.modelId).toBe('test-model');
    expect(result.byHorizon['15m'].n).toBe(2);
    expect(result.byHorizon['15m'].uniquePCount).toBe(2);
    expect(result.byHorizon['1h'].n).toBe(1);
    expect(result.byHorizon['4h'].n).toBe(0);
    expect(result.byHorizon['24h'].n).toBe(3);
    expect(result.byHorizon['24h'].uniquePCount).toBe(1);
  });

  test('handles missing horizons with empty array fallback', () => {
    const predictionsByHorizon = {
      '15m': [{ noNewLow: true, confidence: 0.5, probability: 0.5 }],
    } as Record<'15m' | '1h' | '4h' | '24h', PredictionRecord[]>;

    const result = computeModelPredictionDiversity(
      'partial-model',
      predictionsByHorizon
    );

    expect(result.byHorizon['15m'].n).toBe(1);
    expect(result.byHorizon['1h'].n).toBe(0);
    expect(result.byHorizon['4h'].n).toBe(0);
    expect(result.byHorizon['24h'].n).toBe(0);
  });
});

describe('formatPredictionDiversity', () => {
  test('formats diversity with constant warning', () => {
    const diversity = {
      modelId: 'test-model',
      byHorizon: {
        '15m': {
          n: 3,
          uniquePCount: 1,
          pMin: 0.5,
          pMax: 0.5,
          pStdDev: 0,
          confidenceStdDev: 0,
          noNewLowTrueRate: 1,
        },
        '1h': {
          n: 2,
          uniquePCount: 2,
          pMin: 0.3,
          pMax: 0.7,
          pStdDev: 0.2,
          confidenceStdDev: 0.1,
          noNewLowTrueRate: 0.5,
        },
        '4h': {
          n: 0,
          uniquePCount: 0,
          pMin: 0,
          pMax: 0,
          pStdDev: 0,
          confidenceStdDev: 0,
          noNewLowTrueRate: 0,
        },
        '24h': {
          n: 5,
          uniquePCount: 5,
          pMin: 0.1,
          pMax: 0.9,
          pStdDev: 0.3,
          confidenceStdDev: 0.25,
          noNewLowTrueRate: 0.6,
        },
      },
    };

    const output = formatPredictionDiversity(diversity);

    expect(output).toContain('Model: test-model');
    expect(output).toContain('15m:');
    expect(output).toContain('⚠️ CONSTANT');
    expect(output).toContain('1h:');
    expect(output).not.toMatch(/1h:.*⚠️ CONSTANT/);
  });
});
