import { describe, expect, it } from 'vitest';
import {
  absoluteError,
  squaredError,
  signedError,
  scoreDeltaMidPrediction,
  scoreDeltaMidPredictions,
} from '../src/scorers/delta-mid-scorer';
import type { DeltaMidContractId } from '../src/scorers/types';

describe('Delta-Mid Scorer', () => {
  describe('absoluteError', () => {
    it('returns correct value for positive difference', () => {
      expect(absoluteError(10, 5)).toBe(5);
    });

    it('returns correct value for negative difference', () => {
      expect(absoluteError(5, 10)).toBe(5);
    });

    it('returns 0 for equal values', () => {
      expect(absoluteError(7, 7)).toBe(0);
    });

    it('handles decimal values correctly', () => {
      expect(absoluteError(3.5, 1.5)).toBe(2);
    });

    it('handles negative numbers correctly', () => {
      expect(absoluteError(-5, 5)).toBe(10);
    });
  });

  describe('squaredError', () => {
    it('returns correct value for positive difference', () => {
      expect(squaredError(10, 7)).toBe(9);
    });

    it('returns correct value for negative difference', () => {
      expect(squaredError(7, 10)).toBe(9);
    });

    it('returns 0 for equal values', () => {
      expect(squaredError(5, 5)).toBe(0);
    });

    it('handles larger differences correctly', () => {
      expect(squaredError(100, 90)).toBe(100);
    });

    it('handles decimal values correctly', () => {
      expect(squaredError(2.5, 1.5)).toBe(1);
    });
  });

  describe('signedError', () => {
    it('returns positive value when predicted > actual', () => {
      expect(signedError(10, 5)).toBe(5);
    });

    it('returns negative value when predicted < actual', () => {
      expect(signedError(5, 10)).toBe(-5);
    });

    it('returns 0 for equal values', () => {
      expect(signedError(7, 7)).toBe(0);
    });

    it('can be negative (for bias calculation)', () => {
      const error = signedError(3, 8);
      expect(error).toBeLessThan(0);
      expect(error).toBe(-5);
    });

    it('handles decimal values correctly', () => {
      expect(signedError(3.5, 1.5)).toBe(2);
    });
  });

  describe('scoreDeltaMidPrediction', () => {
    it('returns correct score object with all error metrics', () => {
      const contractId: DeltaMidContractId = 'bid-delta-mid-1m';
      const predicted = 10;
      const actual = 7;

      const score = scoreDeltaMidPrediction(contractId, predicted, actual);

      expect(score.contractId).toBe('bid-delta-mid-1m');
      expect(score.predicted).toBe(10);
      expect(score.actual).toBe(7);
      expect(score.absoluteError).toBe(3);
      expect(score.squaredError).toBe(9);
      expect(score.signedError).toBe(3);
    });

    it('handles negative predicted values', () => {
      const score = scoreDeltaMidPrediction('ask-delta-mid-5m', -5, 3);

      expect(score.absoluteError).toBe(8);
      expect(score.squaredError).toBe(64);
      expect(score.signedError).toBe(-8);
    });

    it('handles zero values', () => {
      const score = scoreDeltaMidPrediction('bid-delta-mid-15m', 0, 0);

      expect(score.absoluteError).toBe(0);
      expect(score.squaredError).toBe(0);
      expect(score.signedError).toBe(0);
    });
  });

  describe('scoreDeltaMidPredictions', () => {
    it('only scores contracts where actual is defined (fill occurred)', () => {
      const predictions: Record<string, number> = {
        'bid-delta-mid-1m': 10,
        'bid-delta-mid-5m': 15,
        'ask-delta-mid-1m': -5,
      };
      const actuals: Record<string, number | undefined> = {
        'bid-delta-mid-1m': 8, // Defined - should be scored
        'bid-delta-mid-5m': undefined, // Undefined - should NOT be scored
        'ask-delta-mid-1m': -3, // Defined - should be scored
      };

      const result = scoreDeltaMidPredictions(predictions, actuals);

      expect(result.scores.length).toBe(2);
      expect(result.scores.map((s) => s.contractId).sort()).toEqual(
        ['ask-delta-mid-1m', 'bid-delta-mid-1m'].sort()
      );
      expect(result.aggregates.sampleCount).toBe(2);
    });

    it('computes correct mean aggregates', () => {
      const predictions: Record<string, number> = {
        'bid-delta-mid-1m': 10,
        'ask-delta-mid-1m': 6,
      };
      const actuals: Record<string, number | undefined> = {
        'bid-delta-mid-1m': 7, // Error: 3, Squared: 9, Signed: 3
        'ask-delta-mid-1m': 2, // Error: 4, Squared: 16, Signed: 4
      };

      const result = scoreDeltaMidPredictions(predictions, actuals);

      // Mean MAE: (3 + 4) / 2 = 3.5
      expect(result.aggregates.meanMAE).toBe(3.5);
      // Mean MSE: (9 + 16) / 2 = 12.5
      expect(result.aggregates.meanMSE).toBe(12.5);
      // Mean Bias: (3 + 4) / 2 = 3.5
      expect(result.aggregates.meanBias).toBe(3.5);
      expect(result.aggregates.sampleCount).toBe(2);
    });

    it('returns zero aggregates when no actuals defined', () => {
      const predictions: Record<string, number> = {
        'bid-delta-mid-1m': 10,
        'bid-delta-mid-5m': 15,
      };
      const actuals: Record<string, number | undefined> = {
        'bid-delta-mid-1m': undefined,
        'bid-delta-mid-5m': undefined,
      };

      const result = scoreDeltaMidPredictions(predictions, actuals);

      expect(result.scores.length).toBe(0);
      expect(result.aggregates.meanMAE).toBe(0);
      expect(result.aggregates.meanMSE).toBe(0);
      expect(result.aggregates.meanBias).toBe(0);
      expect(result.aggregates.sampleCount).toBe(0);
    });

    it('handles all 6 delta-mid contracts', () => {
      const predictions: Record<string, number> = {
        'bid-delta-mid-1m': 1,
        'bid-delta-mid-5m': 2,
        'bid-delta-mid-15m': 3,
        'ask-delta-mid-1m': -1,
        'ask-delta-mid-5m': -2,
        'ask-delta-mid-15m': -3,
      };
      const actuals: Record<string, number | undefined> = {
        'bid-delta-mid-1m': 1,
        'bid-delta-mid-5m': 2,
        'bid-delta-mid-15m': 3,
        'ask-delta-mid-1m': -1,
        'ask-delta-mid-5m': -2,
        'ask-delta-mid-15m': -3,
      };

      const result = scoreDeltaMidPredictions(predictions, actuals);

      expect(result.scores.length).toBe(6);
      expect(result.aggregates.sampleCount).toBe(6);
      // All predictions equal actuals, so all errors are 0
      expect(result.aggregates.meanMAE).toBe(0);
      expect(result.aggregates.meanMSE).toBe(0);
      expect(result.aggregates.meanBias).toBe(0);
    });

    it('computes negative bias when underpredicting', () => {
      const predictions: Record<string, number> = {
        'bid-delta-mid-1m': 5,
      };
      const actuals: Record<string, number | undefined> = {
        'bid-delta-mid-1m': 10, // Signed error: 5 - 10 = -5
      };

      const result = scoreDeltaMidPredictions(predictions, actuals);

      expect(result.aggregates.meanBias).toBe(-5);
    });
  });
});
