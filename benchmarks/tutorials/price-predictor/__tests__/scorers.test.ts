import { describe, expect, it } from 'vitest';
import { brierScore, meanBrierScore, brierSkillScore } from '../src/scorers/brier-scorer';
import { logLoss, meanLogLoss } from '../src/scorers/log-loss-scorer';
import { checkMonotonicity, countViolations } from '../src/scorers/monotonicity-scorer';
import { forecastScorer, updateRunningTally, createEmptyRunningTally, CONTRACT_IDS } from '../src/scorers/aggregate-scorer';
import type { ContractId, ForecastScorerInput } from '../src/scorers/types';

describe('Brier Score', () => {
  describe('brierScore', () => {
    it('returns 0 for perfect prediction (event occurred, predicted 1)', () => {
      expect(brierScore(1, true)).toBe(0);
    });

    it('returns 0 for perfect prediction (event did not occur, predicted 0)', () => {
      expect(brierScore(0, false)).toBe(0);
    });

    it('returns 1 for worst prediction (event occurred, predicted 0)', () => {
      expect(brierScore(0, true)).toBe(1);
    });

    it('returns 1 for worst prediction (event did not occur, predicted 1)', () => {
      expect(brierScore(1, false)).toBe(1);
    });

    it('returns 0.25 for 50% prediction when event occurred', () => {
      expect(brierScore(0.5, true)).toBe(0.25);
    });

    it('returns 0.25 for 50% prediction when event did not occur', () => {
      expect(brierScore(0.5, false)).toBe(0.25);
    });

    it('calculates correct score for partial predictions', () => {
      expect(brierScore(0.7, true)).toBeCloseTo(0.09);
      expect(brierScore(0.3, false)).toBeCloseTo(0.09);
    });
  });

  describe('meanBrierScore', () => {
    it('returns mean of multiple brier scores', () => {
      const predictions = [1, 0, 0.5, 0.7];
      const actuals = [true, false, true, false];
      // Scores: 0, 0, 0.25, 0.49
      const mean = (0 + 0 + 0.25 + 0.49) / 4;
      expect(meanBrierScore(predictions, actuals)).toBeCloseTo(mean);
    });

    it('throws error for mismatched array lengths', () => {
      expect(() => meanBrierScore([0.5], [true, false])).toThrow();
    });

    it('returns 0 for all perfect predictions', () => {
      expect(meanBrierScore([1, 0, 1], [true, false, true])).toBe(0);
    });
  });

  describe('brierSkillScore', () => {
    it('returns 1 for perfect model vs baseline', () => {
      expect(brierSkillScore(0, 0.25)).toBe(1);
    });

    it('returns 0 when model equals baseline', () => {
      expect(brierSkillScore(0.25, 0.25)).toBe(0);
    });

    it('returns negative when model is worse than baseline', () => {
      expect(brierSkillScore(0.5, 0.25)).toBe(-1);
    });

    it('calculates correct skill score', () => {
      expect(brierSkillScore(0.1, 0.25)).toBeCloseTo(0.6);
    });
  });
});

describe('Log Loss', () => {
  describe('logLoss', () => {
    it('returns small value for confident correct prediction', () => {
      expect(logLoss(0.99, true)).toBeLessThan(0.1);
      expect(logLoss(0.01, false)).toBeLessThan(0.1);
    });

    it('returns large value for confident wrong prediction', () => {
      expect(logLoss(0.01, true)).toBeGreaterThan(4);
      expect(logLoss(0.99, false)).toBeGreaterThan(4);
    });

    it('returns log(2) for 50% prediction', () => {
      const log2 = Math.log(2);
      expect(logLoss(0.5, true)).toBeCloseTo(log2);
      expect(logLoss(0.5, false)).toBeCloseTo(log2);
    });

    it('clips predictions to avoid infinity', () => {
      const loss1 = logLoss(0, true);
      const loss2 = logLoss(1, false);
      expect(Number.isFinite(loss1)).toBe(true);
      expect(Number.isFinite(loss2)).toBe(true);
    });

    it('is symmetric for complementary predictions', () => {
      const loss1 = logLoss(0.3, true);
      const loss2 = logLoss(0.7, false);
      expect(loss1).toBeCloseTo(loss2);
    });
  });

  describe('meanLogLoss', () => {
    it('returns mean of multiple log losses', () => {
      const predictions = [0.9, 0.1, 0.5];
      const actuals = [true, false, true];
      const expected = (logLoss(0.9, true) + logLoss(0.1, false) + logLoss(0.5, true)) / 3;
      expect(meanLogLoss(predictions, actuals)).toBeCloseTo(expected);
    });

    it('throws error for mismatched array lengths', () => {
      expect(() => meanLogLoss([0.5], [true, false])).toThrow();
    });
  });
});

describe('Monotonicity Checker', () => {
  const createPredictions = (overrides: Partial<Record<ContractId, number>>): Record<ContractId, number> => {
    return {
      'dump-simple-15m-1pct': 0.15,
      'dump-simple-15m-3pct': 0.25,
      'dump-simple-15m-5pct': 0.35,
      'dump-simple-1h-0.5pct': 0.1,
      'dump-simple-1h-1pct': 0.2,
      'dump-vol-adjusted-15m-z2': 0.25,
      'dump-vol-adjusted-1h-z2': 0.3,
      'dump-drawdown-1pct': 0.1,
      'dump-drawdown-3pct': 0.2,
      ...overrides,
    };
  };

  describe('checkMonotonicity', () => {
    it('returns empty array for valid predictions', () => {
      const predictions = createPredictions({});
      expect(checkMonotonicity(predictions)).toEqual([]);
    });

    it('detects threshold violation (5% < 3%)', () => {
      const predictions = createPredictions({
        'dump-simple-15m-5pct': 0.15,
        'dump-simple-15m-3pct': 0.2,
      });
      const violations = checkMonotonicity(predictions);
      expect(violations.length).toBeGreaterThan(0);
      const violation = violations.find(
        (v) => v.contract1 === 'dump-simple-15m-5pct' && v.contract2 === 'dump-simple-15m-3pct'
      );
      expect(violation).toBeDefined();
      expect(violation?.type).toBe('threshold');
      expect(violation?.expected).toBe('p1 >= p2');
    });

    it('detects threshold violation (3% < 1%)', () => {
      const predictions = createPredictions({
        'dump-simple-15m-3pct': 0.05,
        'dump-simple-15m-1pct': 0.1,
      });
      const violations = checkMonotonicity(predictions);
      expect(violations.length).toBeGreaterThan(0);
      const violation = violations.find(
        (v) => v.contract1 === 'dump-simple-15m-3pct' && v.contract2 === 'dump-simple-15m-1pct'
      );
      expect(violation).toBeDefined();
      expect(violation?.type).toBe('threshold');
    });

    it('detects horizon violation (1h < 15m)', () => {
      const predictions = createPredictions({
        'dump-simple-15m-1pct': 0.3,
        'dump-simple-1h-1pct': 0.15,
      });
      const violations = checkMonotonicity(predictions);
      expect(violations.length).toBeGreaterThan(0);
      const violation = violations.find(
        (v) => v.contract1 === 'dump-simple-15m-1pct' && v.contract2 === 'dump-simple-1h-1pct'
      );
      expect(violation).toBeDefined();
      expect(violation?.type).toBe('horizon');
      expect(violation?.expected).toBe('p1 <= p2');
    });

    it('detects multiple violations', () => {
      const predictions = createPredictions({
        'dump-simple-15m-5pct': 0.1,
        'dump-simple-15m-3pct': 0.2,
        'dump-simple-15m-1pct': 0.3,
        'dump-simple-1h-1pct': 0.05,
      });
      const violations = checkMonotonicity(predictions);
      expect(violations.length).toBeGreaterThan(1);
    });
  });

  describe('countViolations', () => {
    it('returns 0 for valid predictions', () => {
      const predictions = createPredictions({});
      expect(countViolations(predictions)).toBe(0);
    });

    it('counts violations correctly', () => {
      const predictions = createPredictions({
        'dump-simple-15m-5pct': 0.1,
        'dump-simple-15m-3pct': 0.2,
        'dump-simple-1h-1pct': 0.05,
      });
      expect(countViolations(predictions)).toBeGreaterThan(0);
    });
  });
});

describe('Aggregate Scorer', () => {
  const createTestInput = (
    predictions: Partial<Record<ContractId, number>>,
    actuals: Partial<Record<ContractId, boolean>>
  ): ForecastScorerInput => {
    const defaultPredictions: Record<ContractId, number> = {
      'dump-simple-15m-1pct': 0.15,
      'dump-simple-15m-3pct': 0.25,
      'dump-simple-15m-5pct': 0.35,
      'dump-simple-1h-0.5pct': 0.1,
      'dump-simple-1h-1pct': 0.2,
      'dump-vol-adjusted-15m-z2': 0.25,
      'dump-vol-adjusted-1h-z2': 0.3,
      'dump-drawdown-1pct': 0.1,
      'dump-drawdown-3pct': 0.2,
    };
    const defaultActuals: Record<ContractId, boolean> = {
      'dump-simple-15m-1pct': false,
      'dump-simple-15m-3pct': false,
      'dump-simple-15m-5pct': false,
      'dump-simple-1h-0.5pct': false,
      'dump-simple-1h-1pct': false,
      'dump-vol-adjusted-15m-z2': false,
      'dump-vol-adjusted-1h-z2': false,
      'dump-drawdown-1pct': false,
      'dump-drawdown-3pct': false,
    };
    return {
      predictions: { ...defaultPredictions, ...predictions },
      actuals: { ...defaultActuals, ...actuals },
      predictionTime: new Date('2025-01-01T00:00:00Z'),
      symbolId: 'BTC-USD',
    };
  };

  describe('forecastScorer.score', () => {
    it('calculates correct mean Brier score', async () => {
      const input = createTestInput({}, {});
      const result = await forecastScorer.score(input);
      // All predictions are low, all actuals are false
      // Mean brier should be low (good predictions)
      expect(result.aggregates.meanBrierScore).toBeGreaterThan(0);
      expect(result.aggregates.meanBrierScore).toBeLessThan(0.2);
    });

    it('calculates correct mean log loss', async () => {
      const input = createTestInput({}, {});
      const result = await forecastScorer.score(input);
      expect(result.aggregates.meanLogLoss).toBeGreaterThan(0);
      expect(Number.isFinite(result.aggregates.meanLogLoss)).toBe(true);
    });

    it('calculates accuracy at 0.5 threshold', async () => {
      const input = createTestInput(
        {
          'dump-simple-15m-1pct': 0.1, // < 0.5, actual false -> correct
          'dump-simple-15m-3pct': 0.6, // >= 0.5, actual true -> correct
          'dump-simple-15m-5pct': 0.7, // >= 0.5, actual false -> incorrect
        },
        {
          'dump-simple-15m-1pct': false,
          'dump-simple-15m-3pct': true,
          'dump-simple-15m-5pct': false,
        }
      );
      const result = await forecastScorer.score(input);
      // 9 total contracts, 8 correct (all defaults except 15m-5pct)
      expect(result.aggregates.accuracy).toBeCloseTo(8 / 9);
    });

    it('counts events that occurred', async () => {
      const input = createTestInput(
        {},
        {
          'dump-simple-15m-1pct': true,
          'dump-simple-15m-3pct': true,
          'dump-simple-1h-1pct': true,
        }
      );
      const result = await forecastScorer.score(input);
      expect(result.aggregates.eventsOccurred).toBe(3);
    });

    it('includes monotonicity violations', async () => {
      const input = createTestInput(
        {
          'dump-simple-15m-5pct': 0.1,
          'dump-simple-15m-3pct': 0.2,
          'dump-simple-15m-1pct': 0.3,
        },
        {}
      );
      const result = await forecastScorer.score(input);
      expect(result.aggregates.monotonicityViolations).toBeGreaterThan(0);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('returns per-contract scores', async () => {
      const input = createTestInput({}, {});
      const result = await forecastScorer.score(input);
      expect(result.perContract.length).toBe(9);
      for (const contractScore of result.perContract) {
        expect(CONTRACT_IDS).toContain(contractScore.contractId);
        expect(typeof contractScore.predicted).toBe('number');
        expect(typeof contractScore.actual).toBe('boolean');
        expect(typeof contractScore.brierScore).toBe('number');
        expect(typeof contractScore.logLoss).toBe('number');
      }
    });

    it('uses meanBrierScore as the score value', async () => {
      const input = createTestInput({}, {});
      const result = await forecastScorer.score(input);
      expect(result.score).toBe(result.aggregates.meanBrierScore);
    });
  });
});

describe('Running Tally', () => {
  describe('createEmptyRunningTally', () => {
    it('creates tally with all contracts', () => {
      const tally = createEmptyRunningTally();
      expect(Object.keys(tally.perContract).length).toBe(9);
      for (const contractId of CONTRACT_IDS) {
        expect(tally.perContract[contractId]).toBeDefined();
      }
    });

    it('initializes all values to zero', () => {
      const tally = createEmptyRunningTally();
      expect(tally.roundsCompleted).toBe(0);
      expect(tally.cumulativeBrierScore).toBe(0);
      expect(tally.cumulativeLogLoss).toBe(0);
      expect(tally.cumulativeAccuracy).toBe(0);
      expect(tally.totalEventsOccurred).toBe(0);
      expect(tally.totalViolations).toBe(0);
      for (const contractId of CONTRACT_IDS) {
        const stats = tally.perContract[contractId];
        expect(stats?.totalPredictions).toBe(0);
        expect(stats?.totalBrierScore).toBe(0);
        expect(stats?.totalLogLoss).toBe(0);
        expect(stats?.timesEventOccurred).toBe(0);
      }
    });
  });

  describe('updateRunningTally', () => {
    const createMockScoreResult = () => {
      return {
        score: 0.1,
        aggregates: {
          meanBrierScore: 0.1,
          meanLogLoss: 0.5,
          accuracy: 0.8,
          eventsOccurred: 2,
          monotonicityViolations: 1,
        },
        perContract: CONTRACT_IDS.map((id) => ({
          contractId: id,
          predicted: 0.2,
          actual: false,
          brierScore: 0.04,
          logLoss: 0.3,
        })),
        violations: [],
      };
    };

    const createMockPredictions = (): Record<ContractId, number> => {
      return CONTRACT_IDS.reduce(
        (acc, id) => {
          acc[id] = 0.2;
          return acc;
        },
        {} as Record<ContractId, number>
      );
    };

    const createMockActuals = (): Record<ContractId, boolean> => {
      return CONTRACT_IDS.reduce(
        (acc, id) => {
          acc[id] = false;
          return acc;
        },
        {} as Record<ContractId, boolean>
      );
    };

    it('increments roundsCompleted', () => {
      const tally = createEmptyRunningTally();
      const scoreResult = createMockScoreResult();
      const predictions = createMockPredictions();
      const actuals = createMockActuals();

      const updated = updateRunningTally(tally, scoreResult, predictions, actuals);
      expect(updated.roundsCompleted).toBe(1);

      const updated2 = updateRunningTally(updated, scoreResult, predictions, actuals);
      expect(updated2.roundsCompleted).toBe(2);
    });

    it('accumulates Brier scores', () => {
      const tally = createEmptyRunningTally();
      const scoreResult = createMockScoreResult();
      const predictions = createMockPredictions();
      const actuals = createMockActuals();

      const updated = updateRunningTally(tally, scoreResult, predictions, actuals);
      expect(updated.cumulativeBrierScore).toBe(0.1);

      const updated2 = updateRunningTally(updated, scoreResult, predictions, actuals);
      expect(updated2.cumulativeBrierScore).toBeCloseTo(0.2);
    });

    it('accumulates log loss', () => {
      const tally = createEmptyRunningTally();
      const scoreResult = createMockScoreResult();
      const predictions = createMockPredictions();
      const actuals = createMockActuals();

      const updated = updateRunningTally(tally, scoreResult, predictions, actuals);
      expect(updated.cumulativeLogLoss).toBe(0.5);
    });

    it('tracks per-contract stats', () => {
      const tally = createEmptyRunningTally();
      const scoreResult = createMockScoreResult();
      const predictions = createMockPredictions();
      const actuals = createMockActuals();
      actuals['dump-simple-15m-1pct'] = true;

      const updated = updateRunningTally(tally, scoreResult, predictions, actuals);
      const contract1Stats = updated.perContract['dump-simple-15m-1pct'];
      expect(contract1Stats?.totalPredictions).toBe(1);
      expect(contract1Stats?.timesEventOccurred).toBe(1);
      expect(contract1Stats?.totalBrierScore).toBeGreaterThan(0);
      expect(contract1Stats?.totalLogLoss).toBeGreaterThan(0);
    });

    it('handles undefined initial tally', () => {
      const scoreResult = createMockScoreResult();
      const predictions = createMockPredictions();
      const actuals = createMockActuals();

      const updated = updateRunningTally(undefined, scoreResult, predictions, actuals);
      expect(updated.roundsCompleted).toBe(1);
      expect(updated.cumulativeBrierScore).toBe(0.1);
    });
  });
});
