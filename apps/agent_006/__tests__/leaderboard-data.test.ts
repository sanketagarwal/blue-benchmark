import { describe, it, expect } from 'vitest';
import {
  buildLeaderboardScoreData,
  extractHorizonPredictionsAndLabels,
  calculateBrierScores,
  countQualifiedModels,
  toBaseScoreData,
} from '../src/reports/leaderboard-data.js';
import type { LeaderboardModelState } from '../src/reports/leaderboard-data.js';
import type { TimeframeId } from '../src/timeframe-config.js';

/**
 * Creates a mock model state for testing
 */
function createMockModelState(
  modelId: string,
  eliminated: boolean,
  options: {
    logLossByHorizon?: Partial<Record<TimeframeId, number[]>>;
    predictions?: Record<TimeframeId, number>;
    labels?: Record<TimeframeId, boolean>;
    qualifiedHorizons?: TimeframeId[];
  } = {}
): LeaderboardModelState {
  const defaultLogLosses: Record<TimeframeId, number[]> = {
    '15m': [0.5],
    '1h': [0.6],
    '4h': [0.7],
    '24h': [0.8],
  };

  const logLossByHorizon = {
    ...defaultLogLosses,
    ...(options.logLossByHorizon ?? {}),
  };

  const trackBRounds = [
    {
      roundNumber: 1,
      logLoss: 0.5,
      predictions: options.predictions ?? { '15m': 0.7, '1h': 0.6, '4h': 0.5, '24h': 0.4 },
      labels: options.labels ?? { '15m': true, '1h': true, '4h': false, '24h': false },
    },
  ];

  return {
    modelId,
    eliminated,
    trackBRounds,
    logLossByHorizon,
    qualifiedHorizons: new Set(options.qualifiedHorizons ?? ['15m', '1h', '4h', '24h']),
  };
}

describe('buildLeaderboardScoreData', () => {
  describe('eliminated model handling', () => {
    it('should include eliminated models in leaderboard data', () => {
      // This test verifies the fix for the bug where eliminated models
      // were incorrectly excluded from leaderboard data
      const modelStates = new Map<string, LeaderboardModelState>([
        ['model-a', createMockModelState('model-a', true)],
        ['model-b', createMockModelState('model-b', true)],
      ]);

      const result = buildLeaderboardScoreData(modelStates);

      // All eliminated models should still appear in the leaderboard
      expect(result['15m'].size).toBe(2);
      expect(result['15m'].has('model-a')).toBe(true);
      expect(result['15m'].has('model-b')).toBe(true);
    });

    it('should include mix of eliminated and active models', () => {
      const modelStates = new Map<string, LeaderboardModelState>([
        ['eliminated-model', createMockModelState('eliminated-model', true)],
        ['active-model', createMockModelState('active-model', false)],
      ]);

      const result = buildLeaderboardScoreData(modelStates);

      expect(result['15m'].size).toBe(2);
      expect(result['15m'].has('eliminated-model')).toBe(true);
      expect(result['15m'].has('active-model')).toBe(true);
    });

    it('should show "No models have data" message is not triggered when all models eliminated', () => {
      // This is the key regression test - before the fix, when ALL models
      // were eliminated, the leaderboard would show "No models have data"
      const modelStates = new Map<string, LeaderboardModelState>([
        ['model-a', createMockModelState('model-a', true)],
        ['model-b', createMockModelState('model-b', true)],
        ['model-c', createMockModelState('model-c', true)],
      ]);

      const result = buildLeaderboardScoreData(modelStates);

      // Verify that data is present for each horizon
      for (const horizon of ['15m', '1h', '4h', '24h'] as const) {
        // eslint-disable-next-line security/detect-object-injection -- test iteration
        expect(result[horizon].size).toBe(3);
      }
    });
  });

  describe('horizon data extraction', () => {
    it('should extract data for all horizons', () => {
      const modelStates = new Map<string, LeaderboardModelState>([
        ['test-model', createMockModelState('test-model', false)],
      ]);

      const result = buildLeaderboardScoreData(modelStates);

      expect(result['15m'].has('test-model')).toBe(true);
      expect(result['1h'].has('test-model')).toBe(true);
      expect(result['4h'].has('test-model')).toBe(true);
      expect(result['24h'].has('test-model')).toBe(true);
    });

    it('should skip horizons with no log loss data', () => {
      const modelStates = new Map<string, LeaderboardModelState>([
        [
          'partial-model',
          createMockModelState('partial-model', false, {
            logLossByHorizon: {
              '15m': [0.5],
              '1h': [], // No data for 1h
              '4h': [0.7],
              '24h': [], // No data for 24h
            },
          }),
        ],
      ]);

      const result = buildLeaderboardScoreData(modelStates);

      expect(result['15m'].has('partial-model')).toBe(true);
      expect(result['1h'].has('partial-model')).toBe(false);
      expect(result['4h'].has('partial-model')).toBe(true);
      expect(result['24h'].has('partial-model')).toBe(false);
    });
  });

  describe('qualification status', () => {
    it('should preserve qualification status in output', () => {
      const modelStates = new Map<string, LeaderboardModelState>([
        [
          'qualified-model',
          createMockModelState('qualified-model', false, {
            qualifiedHorizons: ['15m', '1h'],
          }),
        ],
      ]);

      const result = buildLeaderboardScoreData(modelStates);

      expect(result['15m'].get('qualified-model')?.isQualified).toBe(true);
      expect(result['1h'].get('qualified-model')?.isQualified).toBe(true);
      expect(result['4h'].get('qualified-model')?.isQualified).toBe(false);
      expect(result['24h'].get('qualified-model')?.isQualified).toBe(false);
    });
  });

  describe('empty states', () => {
    it('should handle empty model states map', () => {
      const modelStates = new Map<string, LeaderboardModelState>();

      const result = buildLeaderboardScoreData(modelStates);

      expect(result['15m'].size).toBe(0);
      expect(result['1h'].size).toBe(0);
      expect(result['4h'].size).toBe(0);
      expect(result['24h'].size).toBe(0);
    });
  });
});

describe('extractHorizonPredictionsAndLabels', () => {
  it('should extract predictions and labels for a horizon', () => {
    const trackBRounds = [
      { roundNumber: 1, logLoss: 0.5, predictions: { '15m': 0.7 }, labels: { '15m': true } },
      { roundNumber: 2, logLoss: 0.4, predictions: { '15m': 0.3 }, labels: { '15m': false } },
    ];

    const result = extractHorizonPredictionsAndLabels(trackBRounds, '15m');

    expect(result.predictions).toEqual([0.7, 0.3]);
    expect(result.labels).toEqual([true, false]);
  });

  it('should skip rounds without predictions or labels', () => {
    const trackBRounds = [
      { roundNumber: 1, logLoss: 0.5, predictions: { '15m': 0.7 }, labels: { '15m': true } },
      { roundNumber: 2, logLoss: 0.4, predictions: {}, labels: {} }, // Missing data
      { roundNumber: 3, logLoss: 0.3, predictions: { '15m': 0.5 }, labels: { '15m': false } },
    ];

    const result = extractHorizonPredictionsAndLabels(trackBRounds, '15m');

    expect(result.predictions).toEqual([0.7, 0.5]);
    expect(result.labels).toEqual([true, false]);
  });

  it('should return empty arrays for empty rounds', () => {
    const result = extractHorizonPredictionsAndLabels([], '15m');

    expect(result.predictions).toEqual([]);
    expect(result.labels).toEqual([]);
  });
});

describe('calculateBrierScores', () => {
  it('should calculate Brier scores correctly', () => {
    const predictions = [0.9, 0.1];
    const labels = [true, false];

    const result = calculateBrierScores(predictions, labels);

    // Brier score = (prediction - label)^2
    // For (0.9, true): (0.9 - 1)^2 = 0.01
    // For (0.1, false): (0.1 - 0)^2 = 0.01
    expect(result[0]).toBeCloseTo(0.01);
    expect(result[1]).toBeCloseTo(0.01);
  });

  it('should handle empty arrays', () => {
    const result = calculateBrierScores([], []);
    expect(result).toEqual([]);
  });
});

describe('countQualifiedModels', () => {
  it('should count qualified models correctly', () => {
    const horizonScores = new Map([
      ['model-a', { logLosses: [0.5], briers: [0.1], predictions: [0.7], labels: [true], isQualified: true }],
      ['model-b', { logLosses: [0.6], briers: [0.2], predictions: [0.6], labels: [true], isQualified: false }],
      ['model-c', { logLosses: [0.7], briers: [0.3], predictions: [0.5], labels: [false], isQualified: true }],
    ]);

    const count = countQualifiedModels(horizonScores);

    expect(count).toBe(2);
  });

  it('should return 0 for empty map', () => {
    const count = countQualifiedModels(new Map());
    expect(count).toBe(0);
  });
});

describe('toBaseScoreData', () => {
  it('should strip isQualified field', () => {
    const horizonScores = new Map([
      ['model-a', { logLosses: [0.5], briers: [0.1], predictions: [0.7], labels: [true], isQualified: true }],
    ]);

    const result = toBaseScoreData(horizonScores);
    const modelData = result.get('model-a');

    expect(modelData).toBeDefined();
    expect(modelData).toEqual({
      logLosses: [0.5],
      briers: [0.1],
      predictions: [0.7],
      labels: [true],
    });
    // Verify isQualified is not present
    expect('isQualified' in (modelData ?? {})).toBe(false);
  });
});
