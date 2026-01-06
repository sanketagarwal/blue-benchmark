/**
 * Golden B4 Tests: Cross-horizon behavior profile generation
 *
 * These tests verify cross-horizon behavior:
 * - Per-horizon winners matching expected specializations
 * - Separability correctly identifying which metrics separate models
 * - Cross-horizon map showing correct categories for model specialization
 * - Aggregation producing per-horizon metrics
 */
import { describe, expect, it } from 'vitest';

import { analyzeMetricSeparability, type ModelProfile } from '../src/reports/separability.js';
import { generateLeaderboard, type ModelScoreData } from '../src/reports/leaderboards.js';
import {
  aggregatePhase0Scores,
  type Phase0RoundScore,
} from '../src/scorers/phase-0-scorer.js';

import type { TimeframeId } from '../src/timeframe-config.js';

// ============================================================================
// Helper constants and functions
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
