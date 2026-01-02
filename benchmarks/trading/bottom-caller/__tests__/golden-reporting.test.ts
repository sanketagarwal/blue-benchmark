/**
 * Golden B1-B4 Tests: Reporting Guard and Metric Completeness Tests
 *
 * These tests verify that reporting functions handle edge cases correctly:
 * - B1: Quick mode reporting guards for small cohorts and insufficient samples
 * - B2: Qualification mask consistency across leaderboards and profiles
 * - B3: Metric registry completeness per round (log loss, brier, timing fields)
 * - B4: Cross-horizon behavior profile generation (per-horizon winners, separability)
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { computePercentileRanks, getQualifiedHorizons, type Phase1ModelScore } from '../src/scorers/phase-1-scorer.js';
import { analyzeMetricSeparability, type ModelProfile } from '../src/reports/separability.js';
import { generateLeaderboard, type ModelScoreData } from '../src/reports/leaderboards.js';
import { buildModelProfile } from '../src/reports/model-profiles.js';
import { rankModelsForHorizon, type ModelWithHorizonMetrics } from '../src/scorers/phase-3-scorer.js';
import {
  scorePhase0Round,
  aggregatePhase0Scores,
  type Phase0RoundScore,
} from '../src/scorers/phase-0-scorer.js';
import { resolveDualGroundTruth } from '../src/ground-truth/bottom-checker.js';
import * as annotations from '../src/replay-lab/annotations.js';

import type { TimeframeId } from '../src/timeframe-config.js';
import type { BottomContractId } from '../src/bottom-caller.js';
import type { RoundScore } from '../src/state/model-state.js';
import type { BottomHoldAnnotation } from '../src/replay-lab/annotations.js';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../src/replay-lab/annotations.js', async (importOriginal) => {
  const actual = await importOriginal<typeof annotations>();
  return {
    ...actual,
    getBottomHoldAnnotations: vi.fn(),
  };
});

function createBottomHoldAnnotation(overrides: Partial<{
  id: string;
  time_start: string;
  drawdownFrac: number;
  maxDrawdownFrac: number;
  refLow: number;
  fwdLow: number;
}>): BottomHoldAnnotation {
  return {
    id: overrides.id ?? '1',
    time_start: overrides.time_start ?? '2025-01-01T00:05:00Z',
    time_end: null,
    type: 'bottom_event',
    method: 'bottom-hold',
    schema_version: '1.0',
    payload: {
      refLow: overrides.refLow ?? 99.5,
      fwdLow: overrides.fwdLow ?? 99.6,
      drawdownFrac: overrides.drawdownFrac ?? 0.0005,
      params: {
        horizonCandles: 3,
        lookbackCandles: 24,
        maxDrawdownFrac: overrides.maxDrawdownFrac ?? 0.001,
        candleTimeframe: '5m',
      },
    },
    source: 'fractal',
    created_at: '2025-01-01T00:00:00Z',
  };
}

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

// ============================================================================
// Helper constants and functions for B3-B4 tests
// ============================================================================

const HORIZONS: TimeframeId[] = ['15m', '1h', '4h', '24h'];

/**
 * Create a Phase0RoundScore fixture with all required fields
 */
function createPhase0RoundScore(
  horizonData: Record<TimeframeId, { logLoss: number; brier: number; prediction: number; extremeError: boolean }>
): Phase0RoundScore {
  const logLossByHorizon: Record<TimeframeId, number> = {} as Record<TimeframeId, number>;
  const brierByHorizon: Record<TimeframeId, number> = {} as Record<TimeframeId, number>;
  const predictions: Record<TimeframeId, number> = {} as Record<TimeframeId, number>;
  const extremeErrors: Record<TimeframeId, boolean> = {} as Record<TimeframeId, boolean>;

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const data = horizonData[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    logLossByHorizon[horizon] = data.logLoss;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    brierByHorizon[horizon] = data.brier;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    predictions[horizon] = data.prediction;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    extremeErrors[horizon] = data.extremeError;
  }

  return {
    logLossByHorizon,
    brierByHorizon,
    predictions,
    extremeErrors,
  };
}

/**
 * Create a RoundScore fixture with timing data
 */
function createRoundScoreWithTiming(
  roundNumber: number,
  horizonData: Record<TimeframeId, {
    prediction: number;
    label: boolean;
    timeToPivotRatio?: number;
    firstPivotAt?: Date;
  }>
): RoundScore {
  const predictions: Record<TimeframeId, number> = {} as Record<TimeframeId, number>;
  const labels: Record<TimeframeId, boolean> = {} as Record<TimeframeId, boolean>;
  const timeToPivotRatio: Record<TimeframeId, number | undefined> = {} as Record<TimeframeId, number | undefined>;
  const firstPivotAt: Record<TimeframeId, Date | undefined> = {} as Record<TimeframeId, Date | undefined>;

  let totalLogLoss = 0;
  const logLossByHorizon: Record<TimeframeId, number> = {} as Record<TimeframeId, number>;

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const data = horizonData[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    predictions[horizon] = data.prediction;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    labels[horizon] = data.label;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    timeToPivotRatio[horizon] = data.timeToPivotRatio;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    firstPivotAt[horizon] = data.firstPivotAt;

    // Compute log loss for this horizon
    const p = Math.max(1e-15, Math.min(1 - 1e-15, data.prediction));
    const y = data.label ? 1 : 0;
    const ll = -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    logLossByHorizon[horizon] = ll;
    totalLogLoss += ll;
  }

  return {
    roundNumber,
    logLoss: totalLogLoss / 4,
    logLossByHorizon,
    predictions,
    labels,
    timeToPivotRatio,
    firstPivotAt,
  };
}

/**
 * Validate that timing fields are present when required
 * Throws if label=true but timeToPivotRatio is missing
 */
function validateTimingFields(round: RoundScore, horizon: TimeframeId): void {
  // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
  const label = round.labels?.[horizon];
  // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
  const timeToPivotRatio = round.timeToPivotRatio?.[horizon];

  if (label === true && timeToPivotRatio === undefined) {
    throw new Error(
      `Track B timing validation failed for ${horizon}: ` +
      `label=true but timeToPivotRatio is undefined. ` +
      `Round ${String(round.roundNumber)} has incomplete timing data.`
    );
  }
}

// ============================================================================
// Golden B3: Metric registry completeness per round
// ============================================================================

describe('Golden B3: Metric registry completeness', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('log loss and brier are always present per prediction per horizon', () => {
    // Setup: Create predictions and labels for all 4 horizons
    const predictions: Record<BottomContractId, number> = {
      'bottom-15m': 0.8,
      'bottom-1h': 0.6,
      'bottom-4h': 0.4,
      'bottom-24h': 0.3,
    };
    const labels: Record<TimeframeId, boolean> = {
      '15m': true,
      '1h': false,
      '4h': true,
      '24h': false,
    };

    // Score the round
    const roundScore = scorePhase0Round(predictions, labels);

    // All 4 horizons must have logLossByHorizon and brierByHorizon
    for (const horizon of HORIZONS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(roundScore.logLossByHorizon[horizon]).toBeDefined();
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(typeof roundScore.logLossByHorizon[horizon]).toBe('number');
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(Number.isNaN(roundScore.logLossByHorizon[horizon])).toBe(false);

      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(roundScore.brierByHorizon[horizon]).toBeDefined();
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(typeof roundScore.brierByHorizon[horizon]).toBe('number');
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(Number.isNaN(roundScore.brierByHorizon[horizon])).toBe(false);
    }
  });

  it('returns label=1 when bottom held (didBottomHold filter)', async () => {
    vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([
      createBottomHoldAnnotation({
        drawdownFrac: 0.0005,
        maxDrawdownFrac: 0.001,
      }),
    ]);

    const result = await resolveDualGroundTruth(
      'COINBASE_SPOT_BTC_USD',
      '15m',
      new Date('2025-01-01T00:00:00Z')
    );

    expect(result.primary.label).toBe(1);
    expect(result.primary.hasStructuralBottom).toBe(true);
    expect(result.secondary.label).toBe(1);
    expect(result.secondary.hasStructuralBottom).toBe(true);
  });

  it('returns label=0 when bottom did not hold (didBottomHold filter)', async () => {
    vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([
      createBottomHoldAnnotation({
        drawdownFrac: 0.002,
        maxDrawdownFrac: 0.001,
      }),
    ]);

    const result = await resolveDualGroundTruth(
      'COINBASE_SPOT_BTC_USD',
      '15m',
      new Date('2025-01-01T00:00:00Z')
    );

    expect(result.primary.label).toBe(0);
    expect(result.primary.hasStructuralBottom).toBe(false);
    expect(result.secondary.label).toBe(0);
    expect(result.secondary.hasStructuralBottom).toBe(false);
  });

  it('primary and secondary labels match (unified bottom-hold method)', async () => {
    vi.mocked(annotations.getBottomHoldAnnotations).mockResolvedValue([
      createBottomHoldAnnotation({
        drawdownFrac: 0.0005,
        maxDrawdownFrac: 0.001,
      }),
    ]);

    const result = await resolveDualGroundTruth(
      'COINBASE_SPOT_BTC_USD',
      '15m',
      new Date('2025-01-01T00:00:00Z')
    );

    expect(result.primary.label).toBeDefined();
    expect(typeof result.primary.label).toBe('number');
    expect([0, 1]).toContain(result.primary.label);

    expect(result.secondary.label).toBeDefined();
    expect(typeof result.secondary.label).toBe('number');
    expect([0, 1]).toContain(result.secondary.label);

    expect(result.primary.label).toBe(result.secondary.label);
    expect(result.primary.method).toBeDefined();
    expect(result.secondary.method).toBeDefined();
  });

  it('timing fields present when timing metrics enabled', () => {
    // Setup: RoundScore with timing data
    const pivotTime = new Date('2025-01-01T00:05:00Z');
    const round = createRoundScoreWithTiming(1, {
      '15m': { prediction: 0.8, label: true, timeToPivotRatio: 0.3, firstPivotAt: pivotTime },
      '1h': { prediction: 0.6, label: true, timeToPivotRatio: 0.5, firstPivotAt: pivotTime },
      '4h': { prediction: 0.4, label: false },
      '24h': { prediction: 0.3, label: false },
    });

    // Must have: timeToPivotRatio per horizon when label=true
    for (const horizon of HORIZONS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      const label = round.labels?.[horizon];
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      const ratio = round.timeToPivotRatio?.[horizon];

      if (label === true) {
        expect(ratio).toBeDefined();
        expect(typeof ratio).toBe('number');
      }
    }
  });

  it('fails loudly if timing fields missing on correct prediction', () => {
    // Setup: label=true but no timeToPivotRatio
    const round = createRoundScoreWithTiming(1, {
      '15m': { prediction: 0.8, label: true }, // Missing timeToPivotRatio when label=true
      '1h': { prediction: 0.6, label: false },
      '4h': { prediction: 0.4, label: false },
      '24h': { prediction: 0.3, label: false },
    });

    // validateTimingFields should throw when label=true but timeToPivotRatio missing
    expect(() => validateTimingFields(round, '15m')).toThrow(
      'Track B timing validation failed for 15m'
    );
  });

  it('validates timing fields pass when label=false regardless of timeToPivotRatio', () => {
    // Setup: label=false, no timeToPivotRatio needed
    const round = createRoundScoreWithTiming(1, {
      '15m': { prediction: 0.2, label: false },
      '1h': { prediction: 0.3, label: false },
      '4h': { prediction: 0.4, label: false },
      '24h': { prediction: 0.5, label: false },
    });

    // validateTimingFields should NOT throw when label=false
    for (const horizon of HORIZONS) {
      expect(() => validateTimingFields(round, horizon)).not.toThrow();
    }
  });

  it('Phase0RoundScore has all metric fields defined for each horizon', () => {
    // Create a complete Phase0RoundScore
    const roundScore = createPhase0RoundScore({
      '15m': { logLoss: 0.2, brier: 0.1, prediction: 0.8, extremeError: false },
      '1h': { logLoss: 0.3, brier: 0.15, prediction: 0.7, extremeError: false },
      '4h': { logLoss: 0.4, brier: 0.2, prediction: 0.6, extremeError: false },
      '24h': { logLoss: 0.5, brier: 0.25, prediction: 0.5, extremeError: false },
    });

    // Verify all fields are present and valid numbers
    for (const horizon of HORIZONS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(roundScore.logLossByHorizon[horizon]).toBeDefined();
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(Number.isFinite(roundScore.logLossByHorizon[horizon])).toBe(true);

      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(roundScore.brierByHorizon[horizon]).toBeDefined();
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(Number.isFinite(roundScore.brierByHorizon[horizon])).toBe(true);

      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(roundScore.predictions[horizon]).toBeDefined();
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(Number.isFinite(roundScore.predictions[horizon])).toBe(true);

      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(roundScore.extremeErrors[horizon]).toBeDefined();
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(typeof roundScore.extremeErrors[horizon]).toBe('boolean');
    }
  });
});

// ============================================================================
// Golden B4: Cross-horizon behavior profile generation
// ============================================================================

describe('Golden B4: Cross-horizon behavior profiles', () => {
  it('per-horizon winners match expected specializations', () => {
    // Setup: 3 models with deterministic scores per horizon
    // Model A best on 15m, Model B best on 1h, Model C best on 4h
    const modelAData: ModelScoreData = {
      logLosses: [0.1], // Best on 15m
      briers: [0.05],
      predictions: [0.9],
      labels: [true],
    };

    const modelBData: ModelScoreData = {
      logLosses: [0.3], // Middle on 15m
      briers: [0.15],
      predictions: [0.7],
      labels: [true],
    };

    const modelCData: ModelScoreData = {
      logLosses: [0.5], // Worst on 15m
      briers: [0.25],
      predictions: [0.5],
      labels: [false],
    };

    const modelScores15m = new Map<string, ModelScoreData>();
    modelScores15m.set('model-a', modelAData);
    modelScores15m.set('model-b', modelBData);
    modelScores15m.set('model-c', modelCData);

    // Generate leaderboard for 15m
    const leaderboard15m = generateLeaderboard('15m', 'fractal', modelScores15m);

    // Verify Model A wins 15m (lowest log loss)
    expect(leaderboard15m.entries[0]?.modelId).toBe('model-a');
    expect(leaderboard15m.entries[0]?.rank).toBe(1);

    // Model B should be second (0.3 log loss)
    expect(leaderboard15m.entries[1]?.modelId).toBe('model-b');
    expect(leaderboard15m.entries[1]?.rank).toBe(2);

    // Model C should be third (0.5 log loss)
    expect(leaderboard15m.entries[2]?.modelId).toBe('model-c');
    expect(leaderboard15m.entries[2]?.rank).toBe(3);
  });

  it('separability correctly identifies which metrics separate models', () => {
    // Setup: Models with large spread in meanLogLoss, small spread in tpRate
    const profiles: ModelProfile[] = [
      {
        modelId: 'model-a',
        meanLogLoss: 0.2, // Large spread
        meanBrier: 0.1,
        expectedCalibrationError: 0.05,
        tpRate: 0.80, // Small spread (0.80, 0.81, 0.82)
        fpRate: 0.1,
      },
      {
        modelId: 'model-b',
        meanLogLoss: 0.5, // Large spread
        meanBrier: 0.25,
        expectedCalibrationError: 0.12,
        tpRate: 0.81, // Small spread
        fpRate: 0.15,
      },
      {
        modelId: 'model-c',
        meanLogLoss: 0.9, // Large spread (range = 0.7)
        meanBrier: 0.45,
        expectedCalibrationError: 0.25,
        tpRate: 0.82, // Small spread (range = 0.02)
        fpRate: 0.2,
      },
    ];

    const separability = analyzeMetricSeparability(profiles);

    // Find metrics by name
    const logLossSep = separability.find(s => s.metricName === 'meanLogLoss');
    const tpRateSep = separability.find(s => s.metricName === 'tpRate');

    expect(logLossSep).toBeDefined();
    expect(tpRateSep).toBeDefined();

    // meanLogLoss should have large range (0.7) and separate models
    expect(logLossSep?.range).toBeCloseTo(0.7, 2);
    expect(logLossSep?.separates).toBe(true);

    // tpRate should have small range (0.02) and NOT separate models
    expect(tpRateSep?.range).toBeCloseTo(0.02, 2);
    expect(tpRateSep?.separates).toBe(false);
  });

  it('cross-horizon map shows correct categories for model specialization', () => {
    // If Model A wins 15m,1h but loses 4h,24h
    // We should be able to detect this pattern via leaderboards

    // Model A: good at short horizons
    const modelAShort: ModelScoreData = { logLosses: [0.1], briers: [0.05], predictions: [0.9], labels: [true] };
    const modelALong: ModelScoreData = { logLosses: [0.5], briers: [0.25], predictions: [0.5], labels: [false] };

    // Model B: good at long horizons
    const modelBShort: ModelScoreData = { logLosses: [0.4], briers: [0.2], predictions: [0.6], labels: [true] };
    const modelBLong: ModelScoreData = { logLosses: [0.1], briers: [0.05], predictions: [0.9], labels: [true] };

    // 15m leaderboard
    const scores15m = new Map<string, ModelScoreData>([
      ['model-a', modelAShort],
      ['model-b', modelBShort],
    ]);
    const leaderboard15m = generateLeaderboard('15m', 'fractal', scores15m);

    // 4h leaderboard
    const scores4h = new Map<string, ModelScoreData>([
      ['model-a', modelALong],
      ['model-b', modelBLong],
    ]);
    const leaderboard4h = generateLeaderboard('4h', 'fractal', scores4h);

    // Model A wins 15m (rank 1)
    expect(leaderboard15m.entries[0]?.modelId).toBe('model-a');

    // Model B wins 4h (rank 1)
    expect(leaderboard4h.entries[0]?.modelId).toBe('model-b');

    // This demonstrates cross-horizon specialization detection:
    // Model A: short-horizon specialist (wins 15m, loses 4h)
    // Model B: long-horizon specialist (loses 15m, wins 4h)
    const modelARank15m = leaderboard15m.entries.find(e => e.modelId === 'model-a')?.rank;
    const modelARank4h = leaderboard4h.entries.find(e => e.modelId === 'model-a')?.rank;

    expect(modelARank15m).toBe(1); // Wins short horizon
    expect(modelARank4h).toBe(2); // Loses long horizon
  });

  it('separability returns undefined for insufficient cohort', () => {
    // With only 2 models, separability analysis is not meaningful
    const profiles: ModelProfile[] = [
      {
        modelId: 'model-a',
        meanLogLoss: 0.2,
        meanBrier: 0.1,
        expectedCalibrationError: 0.05,
        tpRate: 0.8,
        fpRate: 0.1,
      },
      {
        modelId: 'model-b',
        meanLogLoss: 0.5,
        meanBrier: 0.25,
        expectedCalibrationError: 0.12,
        tpRate: 0.75,
        fpRate: 0.15,
      },
    ];

    const separability = analyzeMetricSeparability(profiles);

    // With fewer than 3 models, separates should be undefined (not false)
    for (const metric of separability) {
      expect(metric.separates).toBeUndefined();
    }
  });

  it('aggregatePhase0Scores produces per-horizon metrics', () => {
    // Create multiple rounds
    const rounds: Phase0RoundScore[] = [
      createPhase0RoundScore({
        '15m': { logLoss: 0.2, brier: 0.1, prediction: 0.8, extremeError: false },
        '1h': { logLoss: 0.3, brier: 0.15, prediction: 0.7, extremeError: false },
        '4h': { logLoss: 0.4, brier: 0.2, prediction: 0.6, extremeError: false },
        '24h': { logLoss: 0.5, brier: 0.25, prediction: 0.5, extremeError: false },
      }),
      createPhase0RoundScore({
        '15m': { logLoss: 0.3, brier: 0.15, prediction: 0.7, extremeError: false },
        '1h': { logLoss: 0.4, brier: 0.2, prediction: 0.6, extremeError: false },
        '4h': { logLoss: 0.5, brier: 0.25, prediction: 0.5, extremeError: false },
        '24h': { logLoss: 0.6, brier: 0.3, prediction: 0.4, extremeError: false },
      }),
    ];

    const aggregate = aggregatePhase0Scores(rounds);

    // Verify per-horizon aggregation exists
    for (const horizon of HORIZONS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(aggregate.meanLogLoss[horizon]).toBeDefined();
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(Number.isFinite(aggregate.meanLogLoss[horizon])).toBe(true);

      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(aggregate.meanBrier[horizon]).toBeDefined();
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(Number.isFinite(aggregate.meanBrier[horizon])).toBe(true);
    }

    // Verify specific aggregated values
    expect(aggregate.meanLogLoss['15m']).toBeCloseTo(0.25, 2); // (0.2 + 0.3) / 2
    expect(aggregate.meanLogLoss['1h']).toBeCloseTo(0.35, 2); // (0.3 + 0.4) / 2
    expect(aggregate.meanBrier['15m']).toBeCloseTo(0.125, 3); // (0.1 + 0.15) / 2
  });

  it('leaderboard rankings are sorted by meanLogLoss (lower is better)', () => {
    const modelScores = new Map<string, ModelScoreData>([
      ['worst-model', { logLosses: [0.9], briers: [0.4], predictions: [0.2], labels: [true] }],
      ['best-model', { logLosses: [0.1], briers: [0.05], predictions: [0.9], labels: [true] }],
      ['mid-model', { logLosses: [0.5], briers: [0.2], predictions: [0.6], labels: [true] }],
    ]);

    const leaderboard = generateLeaderboard('15m', 'fractal', modelScores);

    expect(leaderboard.entries[0]?.modelId).toBe('best-model');
    expect(leaderboard.entries[0]?.rank).toBe(1);

    expect(leaderboard.entries[1]?.modelId).toBe('mid-model');
    expect(leaderboard.entries[1]?.rank).toBe(2);

    expect(leaderboard.entries[2]?.modelId).toBe('worst-model');
    expect(leaderboard.entries[2]?.rank).toBe(3);
  });

  it('Spearman rank correlation computed for separability analysis', () => {
    // Models with correlated log loss and brier score
    const profiles: ModelProfile[] = [
      { modelId: 'a', meanLogLoss: 0.1, meanBrier: 0.05, expectedCalibrationError: 0.03, tpRate: 0.9, fpRate: 0.1 },
      { modelId: 'b', meanLogLoss: 0.3, meanBrier: 0.15, expectedCalibrationError: 0.08, tpRate: 0.8, fpRate: 0.2 },
      { modelId: 'c', meanLogLoss: 0.6, meanBrier: 0.3, expectedCalibrationError: 0.15, tpRate: 0.7, fpRate: 0.3 },
    ];

    const separability = analyzeMetricSeparability(profiles);

    // Find meanBrier metric
    const brierSep = separability.find(s => s.metricName === 'meanBrier');
    expect(brierSep).toBeDefined();

    // Brier should have high rank correlation with logLoss (both rank same: a=1, b=2, c=3)
    expect(brierSep?.rankCorrelation).toBeCloseTo(1.0, 2);
  });
});
