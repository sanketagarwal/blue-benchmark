/**
 * Golden B1-B2 Tests: Reporting Guard Tests
 *
 * These tests verify that reporting functions handle edge cases correctly:
 * - B1: Quick mode reporting guards for small cohorts and insufficient samples
 * - B2: Qualification mask consistency across leaderboards and profiles
 */
import { describe, expect, it } from 'vitest';

import { computePercentileRanks, getQualifiedHorizons, type Phase1ModelScore } from '../src/scorers/phase-1-scorer.js';
import { analyzeMetricSeparability, type ModelProfile } from '../src/reports/separability.js';
import { generateLeaderboard, type ModelScoreData } from '../src/reports/leaderboards.js';
import { buildModelProfile } from '../src/reports/model-profiles.js';
import { rankModelsForHorizon, type ModelWithHorizonMetrics } from '../src/scorers/phase-3-scorer.js';

import type { TimeframeId } from '../src/timeframe-config.js';

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

describe('Golden B2: Qualification mask consistency', () => {
  it('model only appears in leaderboards for qualified horizons', () => {
    // Setup: Model qualified for [15m, 24h], disqualified from [1h, 4h]
    // A model is qualified if percentile >= 30
    const qualifiedPercentiles: Record<TimeframeId, number> = {
      '15m': 80,  // Qualified (>= 30)
      '1h': 20,   // Disqualified (< 30)
      '4h': 10,   // Disqualified (< 30)
      '24h': 75,  // Qualified (>= 30)
    };

    const qualifiedHorizons = getQualifiedHorizons(qualifiedPercentiles);

    // Model should be qualified for 15m and 24h
    expect(qualifiedHorizons.has('15m')).toBe(true);
    expect(qualifiedHorizons.has('24h')).toBe(true);

    // Model should NOT be qualified for 1h and 4h
    expect(qualifiedHorizons.has('1h')).toBe(false);
    expect(qualifiedHorizons.has('4h')).toBe(false);
  });

  it('profile excludes data from disqualified horizons in rankModelsForHorizon', () => {
    // Setup: Model disqualified from 4h
    const modelsWithMetrics: ModelWithHorizonMetrics[] = [
      {
        modelId: 'model-a',
        qualifiedHorizons: new Set(['15m', '1h', '24h'] as TimeframeId[]), // NOT qualified for 4h
        metrics: {
          avgPercentileRank: 70,
          avgBestWindow: 0.3,
          avgStability: 0.1,
          avgTimeToPivotRatio: 0.4,
        },
        horizonMetrics: {
          '15m': { logLoss: 0.3, bestWindow: 0.2, stability: 0.1 },
          '1h': { logLoss: 0.4, bestWindow: 0.25, stability: 0.12 },
          '4h': { logLoss: 0.5, bestWindow: 0.3, stability: 0.15 }, // Has data but not qualified
          '24h': { logLoss: 0.6, bestWindow: 0.35, stability: 0.18 },
        },
      },
      {
        modelId: 'model-b',
        qualifiedHorizons: new Set(['15m', '1h', '4h', '24h'] as TimeframeId[]), // Qualified for all
        metrics: {
          avgPercentileRank: 60,
          avgBestWindow: 0.35,
          avgStability: 0.12,
          avgTimeToPivotRatio: 0.5,
        },
        horizonMetrics: {
          '15m': { logLoss: 0.35, bestWindow: 0.22, stability: 0.11 },
          '1h': { logLoss: 0.45, bestWindow: 0.27, stability: 0.13 },
          '4h': { logLoss: 0.55, bestWindow: 0.32, stability: 0.16 },
          '24h': { logLoss: 0.65, bestWindow: 0.37, stability: 0.19 },
        },
      },
    ];

    // Rank for 4h horizon - model-a should NOT appear (not qualified)
    const rankings4h = rankModelsForHorizon(modelsWithMetrics, '4h');

    // model-a should NOT appear in 4h rankings
    const modelAIn4h = rankings4h.find(r => r.modelId === 'model-a');
    expect(modelAIn4h).toBeUndefined();

    // model-b should appear in 4h rankings
    const modelBIn4h = rankings4h.find(r => r.modelId === 'model-b');
    expect(modelBIn4h).toBeDefined();

    // Rank for 15m horizon - both models should appear
    const rankings15m = rankModelsForHorizon(modelsWithMetrics, '15m');
    expect(rankings15m.find(r => r.modelId === 'model-a')).toBeDefined();
    expect(rankings15m.find(r => r.modelId === 'model-b')).toBeDefined();
  });

  it('buildModelProfile includes all horizons in data (qualification is applied elsewhere)', () => {
    // Note: buildModelProfile itself doesn't filter by qualification
    // It processes all data provided. Qualification filtering happens at a higher level.
    const roundData = [
      {
        predictions: { '15m': 0.8, '1h': 0.7, '4h': 0.6, '24h': 0.5 } as Record<TimeframeId, number>,
        labels: { '15m': true, '1h': true, '4h': false, '24h': false } as Record<TimeframeId, boolean>,
      },
      {
        predictions: { '15m': 0.9, '1h': 0.8, '4h': 0.7, '24h': 0.6 } as Record<TimeframeId, number>,
        labels: { '15m': true, '1h': true, '4h': true, '24h': false } as Record<TimeframeId, boolean>,
      },
    ];

    const profile = buildModelProfile('test-model', roundData);

    // Profile should have variance data for all horizons
    expect(profile.varianceByHorizon['15m']).toBeDefined();
    expect(profile.varianceByHorizon['1h']).toBeDefined();
    expect(profile.varianceByHorizon['4h']).toBeDefined();
    expect(profile.varianceByHorizon['24h']).toBeDefined();

    // Variance should not be NaN for horizons with 2+ data points
    expect(Number.isNaN(profile.varianceByHorizon['15m'])).toBe(false);
    expect(Number.isNaN(profile.varianceByHorizon['4h'])).toBe(false);
  });

  it('final winners only show qualified horizons in Phase 3 ranking', () => {
    // Setup: Model only qualified for specific horizons
    const modelsWithMetrics: ModelWithHorizonMetrics[] = [
      {
        modelId: 'specialist-15m',
        qualifiedHorizons: new Set(['15m'] as TimeframeId[]), // Only qualified for 15m
        metrics: {
          avgPercentileRank: 90,
          avgBestWindow: 0.2,
          avgStability: 0.08,
          avgTimeToPivotRatio: 0.3,
        },
        horizonMetrics: {
          '15m': { logLoss: 0.2, bestWindow: 0.15, stability: 0.05 },
          '1h': { logLoss: 0.3, bestWindow: 0.2, stability: 0.08 },
          '4h': { logLoss: 0.4, bestWindow: 0.25, stability: 0.1 },
          '24h': { logLoss: 0.5, bestWindow: 0.3, stability: 0.12 },
        },
      },
      {
        modelId: 'generalist',
        qualifiedHorizons: new Set(['15m', '1h', '4h', '24h'] as TimeframeId[]),
        metrics: {
          avgPercentileRank: 75,
          avgBestWindow: 0.3,
          avgStability: 0.1,
          avgTimeToPivotRatio: 0.4,
        },
        horizonMetrics: {
          '15m': { logLoss: 0.25, bestWindow: 0.18, stability: 0.07 },
          '1h': { logLoss: 0.35, bestWindow: 0.22, stability: 0.09 },
          '4h': { logLoss: 0.45, bestWindow: 0.28, stability: 0.11 },
          '24h': { logLoss: 0.55, bestWindow: 0.33, stability: 0.14 },
        },
      },
    ];

    // Check each horizon ranking
    const ranking15m = rankModelsForHorizon(modelsWithMetrics, '15m');
    const ranking1h = rankModelsForHorizon(modelsWithMetrics, '1h');
    const ranking4h = rankModelsForHorizon(modelsWithMetrics, '4h');
    const ranking24h = rankModelsForHorizon(modelsWithMetrics, '24h');

    // specialist-15m should only appear in 15m ranking
    expect(ranking15m.some(r => r.modelId === 'specialist-15m')).toBe(true);
    expect(ranking1h.some(r => r.modelId === 'specialist-15m')).toBe(false);
    expect(ranking4h.some(r => r.modelId === 'specialist-15m')).toBe(false);
    expect(ranking24h.some(r => r.modelId === 'specialist-15m')).toBe(false);

    // generalist should appear in all rankings
    expect(ranking15m.some(r => r.modelId === 'generalist')).toBe(true);
    expect(ranking1h.some(r => r.modelId === 'generalist')).toBe(true);
    expect(ranking4h.some(r => r.modelId === 'generalist')).toBe(true);
    expect(ranking24h.some(r => r.modelId === 'generalist')).toBe(true);
  });

  it('empty qualified horizons results in no rankings', () => {
    // Setup: Model with no qualified horizons
    const modelsWithMetrics: ModelWithHorizonMetrics[] = [
      {
        modelId: 'eliminated-model',
        qualifiedHorizons: new Set<TimeframeId>(), // No qualified horizons
        metrics: {
          avgPercentileRank: 20,
          avgBestWindow: 0.6,
          avgStability: 0.3,
          avgTimeToPivotRatio: 0.8,
        },
        horizonMetrics: {
          '15m': { logLoss: 0.8, bestWindow: 0.5, stability: 0.25 },
          '1h': { logLoss: 0.85, bestWindow: 0.55, stability: 0.28 },
          '4h': { logLoss: 0.9, bestWindow: 0.6, stability: 0.3 },
          '24h': { logLoss: 0.95, bestWindow: 0.65, stability: 0.32 },
        },
      },
    ];

    // No model should appear in any ranking when it has no qualified horizons
    const ranking15m = rankModelsForHorizon(modelsWithMetrics, '15m');
    const ranking1h = rankModelsForHorizon(modelsWithMetrics, '1h');
    const ranking4h = rankModelsForHorizon(modelsWithMetrics, '4h');
    const ranking24h = rankModelsForHorizon(modelsWithMetrics, '24h');

    expect(ranking15m.length).toBe(0);
    expect(ranking1h.length).toBe(0);
    expect(ranking4h.length).toBe(0);
    expect(ranking24h.length).toBe(0);
  });
});
