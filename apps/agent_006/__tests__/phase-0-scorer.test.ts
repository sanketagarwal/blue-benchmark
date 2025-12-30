import { describe, expect, it } from 'vitest';
import {
  scorePhase0Round,
  aggregatePhase0Scores,
  shouldEliminatePhase0,
  RANDOM_BASELINE,
  type Phase0RoundScore,
  type Phase0AggregateScore,
} from '../src/scorers/phase-0-scorer.js';

describe('phase-0-scorer', () => {
  describe('RANDOM_BASELINE', () => {
    it('is ln(2)', () => {
      expect(RANDOM_BASELINE).toBeCloseTo(0.693, 3);
    });
  });

  describe('scorePhase0Round', () => {
    it('computes log loss per horizon', () => {
      const predictions = {
        'bottom-15m': 0.8,
        'bottom-1h': 0.5,
        'bottom-24h': 0.3,
        'bottom-7d': 0.2,
      };
      const labels = {
        '15m': true,
        '1h': false,
        '24h': true,
        '7d': false,
      };

      const score = scorePhase0Round(predictions, labels);

      expect(score.logLossByHorizon['15m']).toBeDefined();
      expect(score.logLossByHorizon['1h']).toBeDefined();
      expect(score.logLossByHorizon['15m']).toBeLessThan(0.3);
    });

    it('tracks extreme errors (confident wrong)', () => {
      const predictions = {
        'bottom-15m': 0.9,
        'bottom-1h': 0.5,
        'bottom-24h': 0.5,
        'bottom-7d': 0.5,
      };
      const labels = {
        '15m': false,
        '1h': false,
        '24h': false,
        '7d': false,
      };

      const score = scorePhase0Round(predictions, labels);

      expect(score.extremeErrors['15m']).toBe(true);
    });
  });

  describe('aggregatePhase0Scores', () => {
    it('computes mean log loss per horizon', () => {
      const rounds: Phase0RoundScore[] = [
        {
          logLossByHorizon: { '15m': 0.2, '1h': 0.3, '24h': 0.4, '7d': 0.5 },
          extremeErrors: { '15m': false, '1h': false, '24h': false, '7d': false },
          predictions: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        },
        {
          logLossByHorizon: { '15m': 0.4, '1h': 0.5, '24h': 0.6, '7d': 0.7 },
          extremeErrors: { '15m': false, '1h': false, '24h': false, '7d': false },
          predictions: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        },
      ];

      const aggregate = aggregatePhase0Scores(rounds);

      expect(aggregate.meanLogLoss['15m']).toBeCloseTo(0.3);
      expect(aggregate.meanLogLoss['1h']).toBeCloseTo(0.4);
    });

    it('computes extreme error rate', () => {
      const rounds: Phase0RoundScore[] = [
        {
          logLossByHorizon: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
          extremeErrors: { '15m': true, '1h': false, '24h': false, '7d': false },
          predictions: { '15m': 0.9, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        },
        {
          logLossByHorizon: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
          extremeErrors: { '15m': true, '1h': false, '24h': false, '7d': false },
          predictions: { '15m': 0.85, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        },
      ];

      const aggregate = aggregatePhase0Scores(rounds);

      expect(aggregate.extremeErrorRate['15m']).toBe(1.0);
      expect(aggregate.extremeErrorRate['1h']).toBe(0);
    });

    it('detects degenerate patterns', () => {
      const rounds: Phase0RoundScore[] = Array.from({ length: 6 }, () => ({
        logLossByHorizon: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        extremeErrors: { '15m': false, '1h': false, '24h': false, '7d': false },
        predictions: { '15m': 0.95, '1h': 0.95, '24h': 0.95, '7d': 0.95 },
      }));

      const aggregate = aggregatePhase0Scores(rounds);

      expect(aggregate.degeneratePattern).toBe(true);
    });
  });

  describe('shouldEliminatePhase0', () => {
    it('eliminates if meanLogLoss > baseline * 1.1 on 2+ horizons', () => {
      const score: Phase0AggregateScore = {
        meanLogLoss: {
          '15m': RANDOM_BASELINE * 1.2,
          '1h': RANDOM_BASELINE * 1.2,
          '24h': 0.5,
          '7d': 0.5,
        },
        extremeErrorRate: { '15m': 0, '1h': 0, '24h': 0, '7d': 0 },
        degeneratePattern: false,
      };

      expect(shouldEliminatePhase0(score)).toBe(true);
    });

    it('eliminates if degenerate pattern', () => {
      const score: Phase0AggregateScore = {
        meanLogLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '7d': 0.3 },
        extremeErrorRate: { '15m': 0, '1h': 0, '24h': 0, '7d': 0 },
        degeneratePattern: true,
      };

      expect(shouldEliminatePhase0(score)).toBe(true);
    });

    it('eliminates if extreme error rate > 0.2 on any horizon', () => {
      const score: Phase0AggregateScore = {
        meanLogLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '7d': 0.3 },
        extremeErrorRate: { '15m': 0.25, '1h': 0, '24h': 0, '7d': 0 },
        degeneratePattern: false,
      };

      expect(shouldEliminatePhase0(score)).toBe(true);
    });

    it('keeps good models', () => {
      const score: Phase0AggregateScore = {
        meanLogLoss: { '15m': 0.4, '1h': 0.5, '24h': 0.5, '7d': 0.6 },
        extremeErrorRate: { '15m': 0.1, '1h': 0.05, '24h': 0, '7d': 0 },
        degeneratePattern: false,
      };

      expect(shouldEliminatePhase0(score)).toBe(false);
    });
  });
});
