import { describe, expect, it } from 'vitest';
import {
  scorePhase0Round,
  aggregatePhase0Scores,
  getPhase0DisqualifiedHorizons,
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
          brierByHorizon: { '15m': 0.1, '1h': 0.15, '24h': 0.2, '7d': 0.25 },
          extremeErrors: { '15m': false, '1h': false, '24h': false, '7d': false },
          predictions: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        },
        {
          logLossByHorizon: { '15m': 0.4, '1h': 0.5, '24h': 0.6, '7d': 0.7 },
          brierByHorizon: { '15m': 0.2, '1h': 0.25, '24h': 0.3, '7d': 0.35 },
          extremeErrors: { '15m': false, '1h': false, '24h': false, '7d': false },
          predictions: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        },
      ];

      const aggregate = aggregatePhase0Scores(rounds);

      expect(aggregate.meanLogLoss['15m']).toBeCloseTo(0.3);
      expect(aggregate.meanLogLoss['1h']).toBeCloseTo(0.4);
      expect(aggregate.meanBrier['15m']).toBeCloseTo(0.15);
      expect(aggregate.meanBrier['1h']).toBeCloseTo(0.2);
    });

    it('computes extreme error rate', () => {
      const rounds: Phase0RoundScore[] = [
        {
          logLossByHorizon: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
          brierByHorizon: { '15m': 0.25, '1h': 0.25, '24h': 0.25, '7d': 0.25 },
          extremeErrors: { '15m': true, '1h': false, '24h': false, '7d': false },
          predictions: { '15m': 0.9, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        },
        {
          logLossByHorizon: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
          brierByHorizon: { '15m': 0.25, '1h': 0.25, '24h': 0.25, '7d': 0.25 },
          extremeErrors: { '15m': true, '1h': false, '24h': false, '7d': false },
          predictions: { '15m': 0.85, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        },
      ];

      const aggregate = aggregatePhase0Scores(rounds);

      expect(aggregate.extremeErrorRate['15m']).toBe(1.0);
      expect(aggregate.extremeErrorRate['1h']).toBe(0);
    });

    it('detects degenerate patterns per horizon', () => {
      const rounds: Phase0RoundScore[] = Array.from({ length: 6 }, () => ({
        logLossByHorizon: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        brierByHorizon: { '15m': 0.25, '1h': 0.25, '24h': 0.25, '7d': 0.25 },
        extremeErrors: { '15m': false, '1h': false, '24h': false, '7d': false },
        predictions: { '15m': 0.95, '1h': 0.95, '24h': 0.95, '7d': 0.95 },
      }));

      const aggregate = aggregatePhase0Scores(rounds);

      // All horizons should be marked as degenerate
      expect(aggregate.degenerateByHorizon['15m']).toBe(true);
      expect(aggregate.degenerateByHorizon['1h']).toBe(true);
      expect(aggregate.degenerateByHorizon['24h']).toBe(true);
      expect(aggregate.degenerateByHorizon['7d']).toBe(true);
    });

    it('detects degenerate patterns only on affected horizons', () => {
      const rounds: Phase0RoundScore[] = Array.from({ length: 6 }, () => ({
        logLossByHorizon: { '15m': 0.5, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
        brierByHorizon: { '15m': 0.25, '1h': 0.25, '24h': 0.25, '7d': 0.25 },
        extremeErrors: { '15m': false, '1h': false, '24h': false, '7d': false },
        // Only 15m is degenerate (always > 0.9), others are normal
        predictions: { '15m': 0.95, '1h': 0.5, '24h': 0.5, '7d': 0.5 },
      }));

      const aggregate = aggregatePhase0Scores(rounds);

      // Only 15m should be marked as degenerate
      expect(aggregate.degenerateByHorizon['15m']).toBe(true);
      expect(aggregate.degenerateByHorizon['1h']).toBe(false);
      expect(aggregate.degenerateByHorizon['24h']).toBe(false);
      expect(aggregate.degenerateByHorizon['7d']).toBe(false);
    });
  });

  describe('getPhase0DisqualifiedHorizons', () => {
    it('returns empty set for good model', () => {
      const score: Phase0AggregateScore = {
        meanLogLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '7d': 0.3 },
        meanBrier: { '15m': 0.15, '1h': 0.15, '24h': 0.15, '7d': 0.15 },
        extremeErrorRate: { '15m': 0.1, '1h': 0.1, '24h': 0.1, '7d': 0.1 },
        degenerateByHorizon: { '15m': false, '1h': false, '24h': false, '7d': false },
      };

      const disqualified = getPhase0DisqualifiedHorizons(score);
      expect(disqualified.size).toBe(0);
    });

    it('disqualifies horizons with high log loss', () => {
      const score: Phase0AggregateScore = {
        meanLogLoss: {
          '15m': RANDOM_BASELINE * 1.2, // Bad
          '1h': 0.3, // Good
          '24h': RANDOM_BASELINE * 1.2, // Bad
          '7d': 0.3, // Good
        },
        meanBrier: { '15m': 0.3, '1h': 0.15, '24h': 0.3, '7d': 0.15 },
        extremeErrorRate: { '15m': 0, '1h': 0, '24h': 0, '7d': 0 },
        degenerateByHorizon: { '15m': false, '1h': false, '24h': false, '7d': false },
      };

      const disqualified = getPhase0DisqualifiedHorizons(score);
      expect(disqualified.size).toBe(2);
      expect(disqualified.has('15m')).toBe(true);
      expect(disqualified.has('24h')).toBe(true);
      expect(disqualified.has('1h')).toBe(false);
      expect(disqualified.has('7d')).toBe(false);
    });

    it('disqualifies horizons with degenerate patterns', () => {
      const score: Phase0AggregateScore = {
        meanLogLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '7d': 0.3 },
        meanBrier: { '15m': 0.15, '1h': 0.15, '24h': 0.15, '7d': 0.15 },
        extremeErrorRate: { '15m': 0, '1h': 0, '24h': 0, '7d': 0 },
        degenerateByHorizon: { '15m': true, '1h': false, '24h': false, '7d': false },
      };

      const disqualified = getPhase0DisqualifiedHorizons(score);
      expect(disqualified.size).toBe(1);
      expect(disqualified.has('15m')).toBe(true);
    });

    it('disqualifies horizons with high extreme error rate', () => {
      const score: Phase0AggregateScore = {
        meanLogLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '7d': 0.3 },
        meanBrier: { '15m': 0.15, '1h': 0.15, '24h': 0.15, '7d': 0.15 },
        extremeErrorRate: { '15m': 0.1, '1h': 0.1, '24h': 0.3, '7d': 0.1 },
        degenerateByHorizon: { '15m': false, '1h': false, '24h': false, '7d': false },
      };

      const disqualified = getPhase0DisqualifiedHorizons(score);
      expect(disqualified.size).toBe(1);
      expect(disqualified.has('24h')).toBe(true);
    });
  });

  describe('shouldEliminatePhase0', () => {
    it('only eliminates if disqualified from ALL horizons (4 bad horizons)', () => {
      // Model fails on all 4 horizons - should be eliminated
      const score: Phase0AggregateScore = {
        meanLogLoss: {
          '15m': RANDOM_BASELINE * 1.2,
          '1h': RANDOM_BASELINE * 1.2,
          '24h': RANDOM_BASELINE * 1.2,
          '7d': RANDOM_BASELINE * 1.2,
        },
        meanBrier: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '7d': 0.3 },
        extremeErrorRate: { '15m': 0, '1h': 0, '24h': 0, '7d': 0 },
        degenerateByHorizon: { '15m': false, '1h': false, '24h': false, '7d': false },
      };

      expect(shouldEliminatePhase0(score)).toBe(true);
    });

    it('does NOT eliminate if only some horizons fail (3 bad, 1 good)', () => {
      // Model fails on 3 horizons but good on 1 - should NOT be eliminated
      const score: Phase0AggregateScore = {
        meanLogLoss: {
          '15m': RANDOM_BASELINE * 1.2,
          '1h': RANDOM_BASELINE * 1.2,
          '24h': RANDOM_BASELINE * 1.2,
          '7d': 0.3, // Good on 7d
        },
        meanBrier: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '7d': 0.15 },
        extremeErrorRate: { '15m': 0, '1h': 0, '24h': 0, '7d': 0 },
        degenerateByHorizon: { '15m': false, '1h': false, '24h': false, '7d': false },
      };

      expect(shouldEliminatePhase0(score)).toBe(false);
    });

    it('eliminates if degenerate on all horizons', () => {
      const score: Phase0AggregateScore = {
        meanLogLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '7d': 0.3 },
        meanBrier: { '15m': 0.15, '1h': 0.15, '24h': 0.15, '7d': 0.15 },
        extremeErrorRate: { '15m': 0, '1h': 0, '24h': 0, '7d': 0 },
        degenerateByHorizon: { '15m': true, '1h': true, '24h': true, '7d': true },
      };

      expect(shouldEliminatePhase0(score)).toBe(true);
    });

    it('does NOT eliminate if degenerate on only some horizons', () => {
      const score: Phase0AggregateScore = {
        meanLogLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '7d': 0.3 },
        meanBrier: { '15m': 0.15, '1h': 0.15, '24h': 0.15, '7d': 0.15 },
        extremeErrorRate: { '15m': 0, '1h': 0, '24h': 0, '7d': 0 },
        // Degenerate on 3 horizons, but good on 7d
        degenerateByHorizon: { '15m': true, '1h': true, '24h': true, '7d': false },
      };

      expect(shouldEliminatePhase0(score)).toBe(false);
    });

    it('eliminates if extreme error rate > 0.2 on all horizons', () => {
      const score: Phase0AggregateScore = {
        meanLogLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '7d': 0.3 },
        meanBrier: { '15m': 0.15, '1h': 0.15, '24h': 0.15, '7d': 0.15 },
        extremeErrorRate: { '15m': 0.25, '1h': 0.25, '24h': 0.25, '7d': 0.25 },
        degenerateByHorizon: { '15m': false, '1h': false, '24h': false, '7d': false },
      };

      expect(shouldEliminatePhase0(score)).toBe(true);
    });

    it('does NOT eliminate if extreme error rate > 0.2 on only some horizons', () => {
      const score: Phase0AggregateScore = {
        meanLogLoss: { '15m': 0.3, '1h': 0.3, '24h': 0.3, '7d': 0.3 },
        meanBrier: { '15m': 0.15, '1h': 0.15, '24h': 0.15, '7d': 0.15 },
        // High extreme error on only 15m, others are fine
        extremeErrorRate: { '15m': 0.25, '1h': 0, '24h': 0, '7d': 0 },
        degenerateByHorizon: { '15m': false, '1h': false, '24h': false, '7d': false },
      };

      expect(shouldEliminatePhase0(score)).toBe(false);
    });

    it('keeps good models', () => {
      const score: Phase0AggregateScore = {
        meanLogLoss: { '15m': 0.4, '1h': 0.5, '24h': 0.5, '7d': 0.6 },
        meanBrier: { '15m': 0.2, '1h': 0.25, '24h': 0.25, '7d': 0.3 },
        extremeErrorRate: { '15m': 0.1, '1h': 0.05, '24h': 0, '7d': 0 },
        degenerateByHorizon: { '15m': false, '1h': false, '24h': false, '7d': false },
      };

      expect(shouldEliminatePhase0(score)).toBe(false);
    });
  });
});
