/**
 * Golden B1 Tests: Quick mode reporting guards
 *
 * These tests verify that reporting functions handle small cohort edge cases:
 * - Percentile output suppression with default 50 when cohort is too small
 * - Separability suppression with undefined when cohort < 3
 * - Calibration metric handling with insufficient samples
 */
import { describe, expect, it } from 'vitest';

import { computePercentileRanks, type Phase1ModelScore } from '../src/scorers/phase-1-scorer.js';
import { analyzeMetricSeparability, type ModelProfile } from '../src/reports/separability.js';
import { generateLeaderboard, type ModelScoreData } from '../src/reports/leaderboards.js';

describe('Golden B1: Quick mode reporting guards', () => {
  it('suppresses percentile output with default 50 when cohort=1', () => {
    // Setup: Single model in the cohort
    const modelScores: Phase1ModelScore[] = [
      {
        modelId: 'lone-model',
        meanLogLoss: { '15m': 0.3, '1h': 0.4, '4h': 0.5, '24h': 0.6 },
      },
    ];

    // When computing percentile ranks with single model
    const ranks = computePercentileRanks(modelScores);

    // Then: Should return default 50 for all horizons, NOT NaN
    const loneModelRanks = ranks.get('lone-model');
    expect(loneModelRanks).toBeDefined();

    // All horizons should have percentile 50 (the default for insufficient cohort)
    expect(loneModelRanks?.['15m']).toBe(50);
    expect(loneModelRanks?.['1h']).toBe(50);
    expect(loneModelRanks?.['4h']).toBe(50);
    expect(loneModelRanks?.['24h']).toBe(50);

    // Verify no NaN values
    expect(Number.isNaN(loneModelRanks?.['15m'])).toBe(false);
    expect(Number.isNaN(loneModelRanks?.['1h'])).toBe(false);
    expect(Number.isNaN(loneModelRanks?.['4h'])).toBe(false);
    expect(Number.isNaN(loneModelRanks?.['24h'])).toBe(false);
  });

  it('suppresses percentile output with default 50 when cohort=2', () => {
    // Setup: Two models - still below threshold of 3
    const modelScores: Phase1ModelScore[] = [
      {
        modelId: 'model-a',
        meanLogLoss: { '15m': 0.3, '1h': 0.4, '4h': 0.5, '24h': 0.6 },
      },
      {
        modelId: 'model-b',
        meanLogLoss: { '15m': 0.5, '1h': 0.6, '4h': 0.7, '24h': 0.8 },
      },
    ];

    const ranks = computePercentileRanks(modelScores);

    // Both models should have default 50 percentile for all horizons
    const modelARanks = ranks.get('model-a');
    const modelBRanks = ranks.get('model-b');

    expect(modelARanks?.['15m']).toBe(50);
    expect(modelBRanks?.['15m']).toBe(50);
    expect(modelARanks?.['24h']).toBe(50);
    expect(modelBRanks?.['24h']).toBe(50);
  });

  it('computes real percentiles when cohort>=3', () => {
    // Setup: 3+ models - should compute real percentiles
    const modelScores: Phase1ModelScore[] = [
      {
        modelId: 'model-a',
        meanLogLoss: { '15m': 0.3, '1h': 0.4, '4h': 0.5, '24h': 0.6 },
      },
      {
        modelId: 'model-b',
        meanLogLoss: { '15m': 0.5, '1h': 0.6, '4h': 0.7, '24h': 0.8 },
      },
      {
        modelId: 'model-c',
        meanLogLoss: { '15m': 0.7, '1h': 0.8, '4h': 0.9, '24h': 1.0 },
      },
    ];

    const ranks = computePercentileRanks(modelScores);

    // With 3 models, best model (lowest log loss) should have highest percentile
    const modelARanks = ranks.get('model-a');
    const modelCRanks = ranks.get('model-c');

    // Best model should have higher percentile than worst model
    expect((modelARanks?.['15m'] ?? 0) > (modelCRanks?.['15m'] ?? 0)).toBe(true);

    // Percentiles should NOT be the default 50
    expect(modelARanks?.['15m']).not.toBe(50);
  });

  it('suppresses separability with undefined when cohort<3', () => {
    // Setup: 2 models in analyzeMetricSeparability (below MIN_MODELS_FOR_SEPARABILITY=3)
    const profiles: ModelProfile[] = [
      {
        modelId: 'model-a',
        meanLogLoss: 0.3,
        meanBrier: 0.15,
        expectedCalibrationError: 0.05,
        tpRate: 0.8,
        fpRate: 0.1,
      },
      {
        modelId: 'model-b',
        meanLogLoss: 0.5,
        meanBrier: 0.25,
        expectedCalibrationError: 0.1,
        tpRate: 0.6,
        fpRate: 0.2,
      },
    ];

    const analysis = analyzeMetricSeparability(profiles);

    // All metrics should have separates=undefined (not false) for insufficient cohort
    for (const metric of analysis) {
      expect(metric.separates).toBeUndefined();
    }
  });

  it('computes separability as boolean when cohort>=3', () => {
    // Setup: 3+ models
    const profiles: ModelProfile[] = [
      {
        modelId: 'model-a',
        meanLogLoss: 0.1,
        meanBrier: 0.05,
        expectedCalibrationError: 0.02,
        tpRate: 0.9,
        fpRate: 0.05,
      },
      {
        modelId: 'model-b',
        meanLogLoss: 0.4,
        meanBrier: 0.2,
        expectedCalibrationError: 0.1,
        tpRate: 0.7,
        fpRate: 0.15,
      },
      {
        modelId: 'model-c',
        meanLogLoss: 0.7,
        meanBrier: 0.35,
        expectedCalibrationError: 0.18,
        tpRate: 0.5,
        fpRate: 0.25,
      },
    ];

    const analysis = analyzeMetricSeparability(profiles);

    // With 3+ models, separates should be a boolean (true or false), not undefined
    for (const metric of analysis) {
      expect(typeof metric.separates).toBe('boolean');
    }
  });

  it('returns NaN for calibration metrics with <20 samples', () => {
    // Setup: generateLeaderboard with only 10 predictions (below MIN_SAMPLES_FOR_CALIBRATION=20)
    const modelScores = new Map<string, ModelScoreData>([
      [
        'test-model',
        {
          logLosses: [0.3, 0.4, 0.5, 0.3, 0.4, 0.5, 0.3, 0.4, 0.5, 0.3],
          briers: [0.1, 0.15, 0.2, 0.1, 0.15, 0.2, 0.1, 0.15, 0.2, 0.1],
          predictions: [0.8, 0.2, 0.7, 0.8, 0.2, 0.7, 0.8, 0.2, 0.7, 0.8],
          labels: [true, false, true, true, false, true, true, false, true, true],
        },
      ],
    ]);

    const leaderboard = generateLeaderboard('15m', 'fractal', modelScores);

    // calibrationError should be NaN for <20 samples
    expect(leaderboard.entries[0]).toBeDefined();
    expect(Number.isNaN(leaderboard.entries[0]?.calibrationError)).toBe(true);
  });

  it('computes calibration error when samples>=20', () => {
    // Setup: generateLeaderboard with 20+ predictions
    const predictions: number[] = [];
    const labels: boolean[] = [];
    const logLosses: number[] = [];
    const briers: number[] = [];

    for (let i = 0; i < 25; i++) {
      predictions.push(i % 2 === 0 ? 0.8 : 0.2);
      labels.push(i % 2 === 0);
      logLosses.push(0.3 + (i % 3) * 0.1);
      briers.push(0.1 + (i % 3) * 0.05);
    }

    const modelScores = new Map<string, ModelScoreData>([
      [
        'test-model',
        {
          logLosses,
          briers,
          predictions,
          labels,
        },
      ],
    ]);

    const leaderboard = generateLeaderboard('15m', 'fractal', modelScores);

    // calibrationError should NOT be NaN for 20+ samples
    expect(leaderboard.entries[0]).toBeDefined();
    expect(Number.isNaN(leaderboard.entries[0]?.calibrationError)).toBe(false);
  });
});
