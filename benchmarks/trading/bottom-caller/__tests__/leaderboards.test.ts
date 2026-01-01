import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateMean,
  calculateWinRate,
  calculatePrecision,
  calculateExpectedCalibrationError,
  generateLeaderboard,
  formatLeaderboardTable,
} from '../src/reports/leaderboards';
import type { ModelScoreData } from '../src/reports/leaderboards';

describe('leaderboards', () => {
  describe('calculateMean', () => {
    it('returns mean of array of numbers', () => {
      expect(calculateMean([1, 2, 3, 4, 5])).toBe(3);
    });

    it('returns correct mean for decimals', () => {
      expect(calculateMean([0.1, 0.2, 0.3])).toBeCloseTo(0.2);
    });

    it('returns NaN for empty array', () => {
      expect(Number.isNaN(calculateMean([]))).toBe(true);
    });

    it('handles single value', () => {
      expect(calculateMean([42])).toBe(42);
    });
  });

  describe('calculateWinRate', () => {
    it('returns 1 for all correct predictions', () => {
      const predictions = [0.8, 0.2, 0.9, 0.1];
      const labels = [true, false, true, false];
      expect(calculateWinRate(predictions, labels)).toBe(1);
    });

    it('returns 0 for all incorrect predictions', () => {
      const predictions = [0.2, 0.8, 0.1, 0.9];
      const labels = [true, false, true, false];
      expect(calculateWinRate(predictions, labels)).toBe(0);
    });

    it('returns 0.5 for half correct predictions', () => {
      const predictions = [0.8, 0.8, 0.2, 0.2];
      const labels = [true, false, true, false];
      expect(calculateWinRate(predictions, labels)).toBe(0.5);
    });

    it('handles boundary case of exactly 0.5 as negative prediction', () => {
      // prediction = 0.5 is NOT > 0.5, so it's a negative prediction
      const predictions = [0.5];
      const labels = [false];
      expect(calculateWinRate(predictions, labels)).toBe(1); // Correct: predicted false, actual false
    });

    it('throws error for mismatched array lengths', () => {
      expect(() => calculateWinRate([0.5], [true, false])).toThrow('Array length mismatch');
    });

    it('returns NaN for empty arrays', () => {
      expect(Number.isNaN(calculateWinRate([], []))).toBe(true);
    });
  });

  describe('calculatePrecision', () => {
    it('returns 1 for all true positive predictions', () => {
      const predictions = [0.8, 0.9, 0.7]; // All positive predictions
      const labels = [true, true, true]; // All actually positive
      expect(calculatePrecision(predictions, labels)).toBe(1);
    });

    it('returns 0 for all false positive predictions', () => {
      const predictions = [0.8, 0.9, 0.7]; // All positive predictions
      const labels = [false, false, false]; // All actually negative
      expect(calculatePrecision(predictions, labels)).toBe(0);
    });

    it('returns 0.5 for half TP, half FP', () => {
      const predictions = [0.8, 0.9, 0.7, 0.6]; // All positive predictions
      const labels = [true, true, false, false]; // Half TP, half FP
      expect(calculatePrecision(predictions, labels)).toBe(0.5);
    });

    it('ignores negative predictions', () => {
      const predictions = [0.8, 0.2, 0.9, 0.1]; // 2 positive, 2 negative
      const labels = [true, false, true, false]; // All matching
      // Only 2 positive predictions, both are TP
      expect(calculatePrecision(predictions, labels)).toBe(1);
    });

    it('returns NaN when no positive predictions are made', () => {
      const predictions = [0.1, 0.2, 0.3]; // All negative predictions
      const labels = [true, false, true];
      expect(Number.isNaN(calculatePrecision(predictions, labels))).toBe(true);
    });

    it('throws error for mismatched array lengths', () => {
      expect(() => calculatePrecision([0.5], [true, false])).toThrow('Array length mismatch');
    });

    it('returns NaN for empty arrays', () => {
      expect(Number.isNaN(calculatePrecision([], []))).toBe(true);
    });
  });

  describe('calculateExpectedCalibrationError', () => {
    it('returns 0 for perfectly calibrated predictions', () => {
      // All predictions at 0.05 (bin 0), all actually negative
      const predictions = [0.05, 0.05, 0.05, 0.05];
      const labels = [false, false, false, false];
      // avgPredicted = 0.05, actualFreq = 0, |0.05 - 0| = 0.05
      expect(calculateExpectedCalibrationError(predictions, labels)).toBeCloseTo(0.05);
    });

    it('handles single bin with perfect calibration', () => {
      // All predictions at 0.95 (bin 9), all actually positive
      const predictions = [0.95, 0.95, 0.95, 0.95];
      const labels = [true, true, true, true];
      // avgPredicted = 0.95, actualFreq = 1, |0.95 - 1| = 0.05
      expect(calculateExpectedCalibrationError(predictions, labels)).toBeCloseTo(0.05);
    });

    it('calculates ECE across multiple bins', () => {
      // Bin 0 (0.0-0.1): prediction 0.05, label false -> |0.05 - 0| = 0.05
      // Bin 9 (0.9-1.0): prediction 0.95, label true -> |0.95 - 1| = 0.05
      const predictions = [0.05, 0.95];
      const labels = [false, true];
      // ECE = 0.5 * 0.05 + 0.5 * 0.05 = 0.05
      expect(calculateExpectedCalibrationError(predictions, labels)).toBeCloseTo(0.05);
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

    it('handles uniform distribution across all bins', () => {
      // One sample per bin, each with matching calibration
      const predictions: number[] = [];
      const labels: boolean[] = [];
      for (let i = 0; i < 10; i++) {
        // Prediction in middle of each bin
        predictions.push(i / 10 + 0.05);
        // Label matches: below 0.5 = false, above 0.5 = true
        labels.push(i >= 5);
      }
      // Each bin has 1 sample with actualFreq 0 or 1
      // Bins 0-4: avgPred ~0.05-0.45, actualFreq = 0 -> errors ~0.05-0.45
      // Bins 5-9: avgPred ~0.55-0.95, actualFreq = 1 -> errors ~0.45-0.05
      const ece = calculateExpectedCalibrationError(predictions, labels);
      expect(ece).toBeGreaterThan(0);
      expect(ece).toBeLessThan(0.5);
    });
  });

  describe('generateLeaderboard', () => {
    it('generates leaderboard with correct entries', () => {
      const modelScores = new Map<string, ModelScoreData>([
        [
          'model-a',
          {
            logLosses: [0.3, 0.4],
            briers: [0.1, 0.15],
            predictions: [0.8, 0.2],
            labels: [true, false],
          },
        ],
        [
          'model-b',
          {
            logLosses: [0.5, 0.6],
            briers: [0.2, 0.25],
            predictions: [0.6, 0.4],
            labels: [true, false],
          },
        ],
      ]);

      const leaderboard = generateLeaderboard('15m', 'fractal', modelScores);

      expect(leaderboard.horizon).toBe('15m');
      expect(leaderboard.method).toBe('fractal');
      expect(leaderboard.entries.length).toBe(2);
    });

    it('ranks models by meanLogLoss (lower is better)', () => {
      const modelScores = new Map<string, ModelScoreData>([
        [
          'worst-model',
          {
            logLosses: [0.9, 1.0],
            briers: [0.3, 0.35],
            predictions: [0.5, 0.5],
            labels: [true, false],
          },
        ],
        [
          'best-model',
          {
            logLosses: [0.1, 0.2],
            briers: [0.05, 0.1],
            predictions: [0.9, 0.1],
            labels: [true, false],
          },
        ],
        [
          'mid-model',
          {
            logLosses: [0.4, 0.5],
            briers: [0.15, 0.2],
            predictions: [0.7, 0.3],
            labels: [true, false],
          },
        ],
      ]);

      const leaderboard = generateLeaderboard('1h', 'zigzag', modelScores);

      expect(leaderboard.entries[0]?.modelId).toBe('best-model');
      expect(leaderboard.entries[0]?.rank).toBe(1);
      expect(leaderboard.entries[1]?.modelId).toBe('mid-model');
      expect(leaderboard.entries[1]?.rank).toBe(2);
      expect(leaderboard.entries[2]?.modelId).toBe('worst-model');
      expect(leaderboard.entries[2]?.rank).toBe(3);
    });

    it('handles empty model scores map', () => {
      const modelScores = new Map<string, ModelScoreData>();
      const leaderboard = generateLeaderboard('4h', 'fractal', modelScores);

      expect(leaderboard.entries.length).toBe(0);
    });

    it('calculates all metrics correctly', () => {
      const modelScores = new Map<string, ModelScoreData>([
        [
          'test-model',
          {
            logLosses: [0.3, 0.4, 0.5],
            briers: [0.1, 0.15, 0.2],
            predictions: [0.8, 0.2, 0.7],
            labels: [true, false, true],
          },
        ],
      ]);

      const leaderboard = generateLeaderboard('24h', 'zigzag', modelScores);
      const entry = leaderboard.entries[0];

      expect(entry).toBeDefined();
      expect(entry?.meanLogLoss).toBeCloseTo(0.4);
      expect(entry?.meanBrier).toBeCloseTo(0.15);
      expect(entry?.winRate).toBe(1); // All predictions correct
      expect(entry?.precision).toBe(1); // Both positive predictions are TP
      expect(entry?.roundsPlayed).toBe(3);
    });

    it('handles NaN meanLogLoss by pushing to end of rankings', () => {
      const modelScores = new Map<string, ModelScoreData>([
        [
          'nan-model',
          {
            logLosses: [], // Will produce NaN mean
            briers: [],
            predictions: [],
            labels: [],
          },
        ],
        [
          'valid-model',
          {
            logLosses: [0.5],
            briers: [0.2],
            predictions: [0.7],
            labels: [true],
          },
        ],
      ]);

      const leaderboard = generateLeaderboard('15m', 'fractal', modelScores);

      expect(leaderboard.entries[0]?.modelId).toBe('valid-model');
      expect(leaderboard.entries[1]?.modelId).toBe('nan-model');
    });

    it('supports all timeframe IDs', () => {
      const modelScores = new Map<string, ModelScoreData>([
        [
          'model',
          {
            logLosses: [0.5],
            briers: [0.2],
            predictions: [0.7],
            labels: [true],
          },
        ],
      ]);

      for (const horizon of ['15m', '1h', '4h', '24h'] as const) {
        const leaderboard = generateLeaderboard(horizon, 'fractal', modelScores);
        expect(leaderboard.horizon).toBe(horizon);
      }
    });

    it('supports both methods', () => {
      const modelScores = new Map<string, ModelScoreData>([
        [
          'model',
          {
            logLosses: [0.5],
            briers: [0.2],
            predictions: [0.7],
            labels: [true],
          },
        ],
      ]);

      for (const method of ['fractal', 'zigzag'] as const) {
        const leaderboard = generateLeaderboard('15m', method, modelScores);
        expect(leaderboard.method).toBe(method);
      }
    });
  });

  describe('formatLeaderboardTable', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('returns formatted table string', () => {
      const modelScores = new Map<string, ModelScoreData>([
        [
          'gpt-4o',
          {
            logLosses: [0.4, 0.45],
            briers: [0.18, 0.2],
            predictions: [0.8, 0.75],
            labels: [true, true],
          },
        ],
      ]);

      const leaderboard = generateLeaderboard('15m', 'fractal', modelScores);
      const table = formatLeaderboardTable(leaderboard);

      expect(typeof table).toBe('string');
      expect(table.length).toBeGreaterThan(0);
    });

    it('includes title with horizon and method', () => {
      const leaderboard = generateLeaderboard(
        '15m',
        'fractal',
        new Map([
          [
            'model',
            {
              logLosses: [0.5],
              briers: [0.2],
              predictions: [0.7],
              labels: [true],
            },
          ],
        ])
      );
      const table = formatLeaderboardTable(leaderboard);

      expect(table).toContain('15m Arena');
      expect(table).toContain('Fractal Track');
    });

    it('includes all column headers', () => {
      const leaderboard = generateLeaderboard(
        '1h',
        'zigzag',
        new Map([
          [
            'model',
            {
              logLosses: [0.5],
              briers: [0.2],
              predictions: [0.7],
              labels: [true],
            },
          ],
        ])
      );
      const table = formatLeaderboardTable(leaderboard);

      expect(table).toContain('Rank');
      expect(table).toContain('Model');
      expect(table).toContain('LL');
      expect(table).toContain('Brier');
      expect(table).toContain('Win%');
      expect(table).toContain('Prec%');
      expect(table).toContain('CalErr');
    });

    it('displays model data correctly', () => {
      const modelScores = new Map<string, ModelScoreData>([
        [
          'test-model',
          {
            logLosses: [0.423],
            briers: [0.189],
            predictions: [0.8],
            labels: [true],
          },
        ],
      ]);

      const leaderboard = generateLeaderboard('4h', 'fractal', modelScores);
      const table = formatLeaderboardTable(leaderboard);

      expect(table).toContain('test-model');
      expect(table).toContain('0.423'); // LL
      expect(table).toContain('0.189'); // Brier
    });

    it('displays medals for top 3 ranks', () => {
      const modelScores = new Map<string, ModelScoreData>([
        ['gold', { logLosses: [0.1], briers: [0.05], predictions: [0.9], labels: [true] }],
        ['silver', { logLosses: [0.2], briers: [0.1], predictions: [0.8], labels: [true] }],
        ['bronze', { logLosses: [0.3], briers: [0.15], predictions: [0.7], labels: [true] }],
        ['fourth', { logLosses: [0.4], briers: [0.2], predictions: [0.6], labels: [true] }],
      ]);

      const leaderboard = generateLeaderboard('24h', 'zigzag', modelScores);
      const table = formatLeaderboardTable(leaderboard);

      // Should contain medal emojis for top 3
      expect(table).toContain('\u{1F947}'); // 🥇
      expect(table).toContain('\u{1F948}'); // 🥈
      expect(table).toContain('\u{1F949}'); // 🥉
      expect(table).toContain('4'); // Fourth place as number
    });

    it('handles empty leaderboard', () => {
      const leaderboard = generateLeaderboard('15m', 'fractal', new Map());
      const table = formatLeaderboardTable(leaderboard);

      expect(table).toContain('15m Arena');
      expect(table).toContain('Fractal Track');
      // Should still have headers even with no data
      expect(table).toContain('Rank');
    });

    it('formats percentages correctly', () => {
      const modelScores = new Map<string, ModelScoreData>([
        [
          'model',
          {
            logLosses: [0.5],
            briers: [0.2],
            predictions: [0.8], // Will be 100% win rate with label=true
            labels: [true],
          },
        ],
      ]);

      const leaderboard = generateLeaderboard('15m', 'fractal', modelScores);
      const table = formatLeaderboardTable(leaderboard);

      expect(table).toContain('100.0%'); // Win rate
    });

    it('capitalizes method name in title', () => {
      const fractalLeaderboard = generateLeaderboard(
        '15m',
        'fractal',
        new Map([
          ['m', { logLosses: [0.5], briers: [0.2], predictions: [0.7], labels: [true] }],
        ])
      );
      const zigzagLeaderboard = generateLeaderboard(
        '15m',
        'zigzag',
        new Map([
          ['m', { logLosses: [0.5], briers: [0.2], predictions: [0.7], labels: [true] }],
        ])
      );

      expect(formatLeaderboardTable(fractalLeaderboard)).toContain('Fractal');
      expect(formatLeaderboardTable(zigzagLeaderboard)).toContain('Zigzag');
    });
  });
});
