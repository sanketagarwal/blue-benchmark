import { describe, expect, it } from 'vitest';
import { brierScore, meanBrierScore, brierSkillScore } from '../src/scorers/brier-scorer';
import { logLoss, meanLogLoss } from '../src/scorers/log-loss-scorer';
import { checkMonotonicity, countViolations } from '../src/scorers/monotonicity-scorer';
import { forecastScorer, updateRunningTally, createEmptyRunningTally, CONTRACT_IDS } from '../src/scorers/aggregate-scorer';
import type { ContractId, ForecastScorerInput, FillContractId } from '../src/scorers/types';
import { FILL_MONOTONICITY_RULES } from '../src/scorers/types';

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
  /**
   * Helper to create fill predictions with sensible defaults
   * Default: monotonically increasing probabilities (valid)
   * bid: 1m=0.3, 5m=0.5, 15m=0.7
   * ask: 1m=0.3, 5m=0.5, 15m=0.7
   */
  const createFillPredictions = (overrides: Partial<Record<FillContractId, number>>): Record<FillContractId, number> => {
    return {
      'bid-fill-1m': 0.3,
      'bid-fill-5m': 0.5,
      'bid-fill-15m': 0.7,
      'ask-fill-1m': 0.3,
      'ask-fill-5m': 0.5,
      'ask-fill-15m': 0.7,
      ...overrides,
    };
  };

  describe('checkMonotonicity', () => {
    it('returns empty array for valid fill predictions (longer time = higher probability)', () => {
      const predictions = createFillPredictions({});
      expect(checkMonotonicity(predictions)).toEqual([]);
    });

    it('accepts equal probabilities across horizons (no violation)', () => {
      const predictions = createFillPredictions({
        'bid-fill-1m': 0.5,
        'bid-fill-5m': 0.5,
        'bid-fill-15m': 0.5,
      });
      expect(checkMonotonicity(predictions)).toEqual([]);
    });

    it('detects bid horizon violation (5m < 1m)', () => {
      const predictions = createFillPredictions({
        'bid-fill-1m': 0.6,
        'bid-fill-5m': 0.4, // Violation: 5m should be >= 1m
      });
      const violations = checkMonotonicity(predictions);
      expect(violations.length).toBeGreaterThan(0);
      const violation = violations.find(
        (v) => v.contract1 === 'bid-fill-1m' && v.contract2 === 'bid-fill-5m'
      );
      expect(violation).toBeDefined();
      expect(violation?.type).toBe('horizon');
      expect(violation?.expected).toBe('p1 <= p2');
    });

    it('detects bid horizon violation (15m < 5m)', () => {
      const predictions = createFillPredictions({
        'bid-fill-5m': 0.7,
        'bid-fill-15m': 0.5, // Violation: 15m should be >= 5m
      });
      const violations = checkMonotonicity(predictions);
      expect(violations.length).toBeGreaterThan(0);
      const violation = violations.find(
        (v) => v.contract1 === 'bid-fill-5m' && v.contract2 === 'bid-fill-15m'
      );
      expect(violation).toBeDefined();
      expect(violation?.type).toBe('horizon');
    });

    it('detects ask horizon violation (5m < 1m)', () => {
      const predictions = createFillPredictions({
        'ask-fill-1m': 0.6,
        'ask-fill-5m': 0.4, // Violation: 5m should be >= 1m
      });
      const violations = checkMonotonicity(predictions);
      expect(violations.length).toBeGreaterThan(0);
      const violation = violations.find(
        (v) => v.contract1 === 'ask-fill-1m' && v.contract2 === 'ask-fill-5m'
      );
      expect(violation).toBeDefined();
      expect(violation?.type).toBe('horizon');
    });

    it('detects ask horizon violation (15m < 5m)', () => {
      const predictions = createFillPredictions({
        'ask-fill-5m': 0.8,
        'ask-fill-15m': 0.6, // Violation: 15m should be >= 5m
      });
      const violations = checkMonotonicity(predictions);
      expect(violations.length).toBeGreaterThan(0);
      const violation = violations.find(
        (v) => v.contract1 === 'ask-fill-5m' && v.contract2 === 'ask-fill-15m'
      );
      expect(violation).toBeDefined();
      expect(violation?.type).toBe('horizon');
    });

    it('detects multiple violations across bid and ask', () => {
      const predictions = createFillPredictions({
        'bid-fill-1m': 0.8,
        'bid-fill-5m': 0.5, // Violation
        'bid-fill-15m': 0.3, // Violation
        'ask-fill-1m': 0.9,
        'ask-fill-5m': 0.6, // Violation
      });
      const violations = checkMonotonicity(predictions);
      expect(violations.length).toBe(3);
    });

    it('detects chain violation (15m < 5m < 1m)', () => {
      const predictions = createFillPredictions({
        'bid-fill-1m': 0.9,
        'bid-fill-5m': 0.6,
        'bid-fill-15m': 0.3,
      });
      const violations = checkMonotonicity(predictions);
      // Should detect both: 5m < 1m AND 15m < 5m
      expect(violations.length).toBe(2);
    });
  });

  describe('countViolations', () => {
    it('returns 0 for valid fill predictions', () => {
      const predictions = createFillPredictions({});
      expect(countViolations(predictions)).toBe(0);
    });

    it('counts all violations correctly', () => {
      const predictions = createFillPredictions({
        'bid-fill-1m': 0.8,
        'bid-fill-5m': 0.5, // Violation 1: bid 5m < bid 1m
        'ask-fill-5m': 0.2,
        'ask-fill-15m': 0.1, // Violation 2: ask 15m < ask 5m
        // Note: ask-fill-5m (0.2) < ask-fill-1m (0.3 default) = Violation 3
      });
      expect(countViolations(predictions)).toBe(3);
    });
  });

  describe('FILL_MONOTONICITY_RULES', () => {
    it('has 4 rules (2 bid, 2 ask)', () => {
      expect(FILL_MONOTONICITY_RULES.length).toBe(4);
    });

    it('contains bid fill rules', () => {
      const bidRules = FILL_MONOTONICITY_RULES.filter(([a]) => a.startsWith('bid-'));
      expect(bidRules.length).toBe(2);
    });

    it('contains ask fill rules', () => {
      const askRules = FILL_MONOTONICITY_RULES.filter(([a]) => a.startsWith('ask-'));
      expect(askRules.length).toBe(2);
    });

    it('rules follow shorter-to-longer pattern', () => {
      for (const [shorter, longer] of FILL_MONOTONICITY_RULES) {
        // Extract timeframes
        const shorterTime = shorter.split('-').pop();
        const longerTime = longer.split('-').pop();
        // 1m < 5m < 15m
        const timeOrder = ['1m', '5m', '15m'];
        expect(timeOrder.indexOf(shorterTime!)).toBeLessThan(timeOrder.indexOf(longerTime!));
      }
    });
  });
});

describe('Aggregate Scorer', () => {
  const createTestInput = (
    predictions: Partial<Record<ContractId, number>>,
    actuals: Partial<Record<ContractId, boolean>>
  ): ForecastScorerInput => {
    // Default fill predictions: monotonically increasing (valid)
    const defaultPredictions: Record<ContractId, number> = {
      'bid-fill-1m': 0.3,
      'bid-fill-5m': 0.5,
      'bid-fill-15m': 0.7,
      'ask-fill-1m': 0.3,
      'ask-fill-5m': 0.5,
      'ask-fill-15m': 0.7,
    };
    const defaultActuals: Record<ContractId, boolean> = {
      'bid-fill-1m': false,
      'bid-fill-5m': false,
      'bid-fill-15m': false,
      'ask-fill-1m': false,
      'ask-fill-5m': false,
      'ask-fill-15m': false,
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
      // Predictions vary (0.3-0.7), all actuals are false
      // Mean brier should be moderate
      expect(result.aggregates.meanBrierScore).toBeGreaterThan(0);
      expect(result.aggregates.meanBrierScore).toBeLessThan(0.5);
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
          'bid-fill-1m': 0.1, // < 0.5, actual false -> correct
          'bid-fill-5m': 0.6, // >= 0.5, actual true -> correct
          'bid-fill-15m': 0.7, // >= 0.5, actual false -> incorrect
          'ask-fill-1m': 0.2, // < 0.5, actual false -> correct
          'ask-fill-5m': 0.3, // < 0.5, actual false -> correct
          'ask-fill-15m': 0.4, // < 0.5, actual false -> correct
        },
        {
          'bid-fill-1m': false,
          'bid-fill-5m': true,
          'bid-fill-15m': false,
          'ask-fill-1m': false,
          'ask-fill-5m': false,
          'ask-fill-15m': false,
        }
      );
      const result = await forecastScorer.score(input);
      // 6 total contracts, 5 correct (bid-fill-15m incorrect)
      expect(result.aggregates.accuracy).toBeCloseTo(5 / 6);
    });

    it('counts events that occurred', async () => {
      const input = createTestInput(
        {},
        {
          'bid-fill-1m': true,
          'bid-fill-5m': true,
          'ask-fill-15m': true,
        }
      );
      const result = await forecastScorer.score(input);
      expect(result.aggregates.eventsOccurred).toBe(3);
    });

    it('includes monotonicity violations for fill predictions', async () => {
      const input = createTestInput(
        {
          'bid-fill-1m': 0.8,
          'bid-fill-5m': 0.5, // Violation: should be >= 1m
          'bid-fill-15m': 0.3, // Violation: should be >= 5m
        },
        {}
      );
      const result = await forecastScorer.score(input);
      expect(result.aggregates.monotonicityViolations).toBe(2);
      expect(result.violations.length).toBe(2);
    });

    it('returns per-contract scores for all 6 fill contracts', async () => {
      const input = createTestInput({}, {});
      const result = await forecastScorer.score(input);
      expect(result.perContract.length).toBe(6);
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
    it('creates tally with all 6 fill contracts', () => {
      const tally = createEmptyRunningTally();
      expect(Object.keys(tally.perContract).length).toBe(6);
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

    it('tracks per-contract stats for fill contracts', () => {
      const tally = createEmptyRunningTally();
      const scoreResult = createMockScoreResult();
      const predictions = createMockPredictions();
      const actuals = createMockActuals();
      actuals['bid-fill-1m'] = true;

      const updated = updateRunningTally(tally, scoreResult, predictions, actuals);
      const contract1Stats = updated.perContract['bid-fill-1m'];
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

describe('Aggregate Scorer - Extended Integration', () => {
  const createExtendedTestInput = (options: {
    predictions?: Partial<Record<ContractId, number>>;
    actuals?: Partial<Record<ContractId, boolean>>;
    deltaMidPredictions?: Record<string, number>;
    deltaMidActuals?: Record<string, number | undefined>;
    fillDetails?: Record<string, { filled: boolean; fillPrice?: number }>;
    exitMids?: Record<string, number | undefined>;
    fillPrices?: { bestBid: number; bestAsk: number };
  }): ForecastScorerInput => {
    // Default fill predictions: monotonically increasing (valid)
    const defaultPredictions: Record<ContractId, number> = {
      'bid-fill-1m': 0.3,
      'bid-fill-5m': 0.5,
      'bid-fill-15m': 0.7,
      'ask-fill-1m': 0.3,
      'ask-fill-5m': 0.5,
      'ask-fill-15m': 0.7,
    };
    const defaultActuals: Record<ContractId, boolean> = {
      'bid-fill-1m': false,
      'bid-fill-5m': false,
      'bid-fill-15m': false,
      'ask-fill-1m': false,
      'ask-fill-5m': false,
      'ask-fill-15m': false,
    };
    return {
      predictions: { ...defaultPredictions, ...options.predictions },
      actuals: { ...defaultActuals, ...options.actuals },
      predictionTime: new Date('2025-01-01T00:00:00Z'),
      symbolId: 'BTC-USD',
      deltaMidPredictions: options.deltaMidPredictions,
      deltaMidActuals: options.deltaMidActuals,
      fillDetails: options.fillDetails,
      exitMids: options.exitMids,
      fillPrices: options.fillPrices,
    };
  };

  describe('delta-mid scoring integration', () => {
    it('returns deltaMidScores when deltaMidPredictions and deltaMidActuals are provided', async () => {
      const input = createExtendedTestInput({
        deltaMidPredictions: {
          'bid-delta-mid-1m': 5,
          'bid-delta-mid-5m': 10,
          'bid-delta-mid-15m': 15,
          'ask-delta-mid-1m': -3,
          'ask-delta-mid-5m': -6,
          'ask-delta-mid-15m': -9,
        },
        deltaMidActuals: {
          'bid-delta-mid-1m': 4,
          'bid-delta-mid-5m': 12,
          'bid-delta-mid-15m': undefined, // no fill
          'ask-delta-mid-1m': -2,
          'ask-delta-mid-5m': undefined, // no fill
          'ask-delta-mid-15m': -10,
        },
      });
      const result = await forecastScorer.score(input);

      expect(result.deltaMidScores).toBeDefined();
      expect(result.deltaMidScores?.scores.length).toBe(4); // 4 contracts had fills
      expect(result.deltaMidScores?.aggregates.sampleCount).toBe(4);
      expect(typeof result.deltaMidScores?.aggregates.meanMAE).toBe('number');
      expect(typeof result.deltaMidScores?.aggregates.meanMSE).toBe('number');
      expect(typeof result.deltaMidScores?.aggregates.meanBias).toBe('number');
    });

    it('returns undefined deltaMidScores when deltaMidPredictions not provided', async () => {
      const input = createExtendedTestInput({});
      const result = await forecastScorer.score(input);

      expect(result.deltaMidScores).toBeUndefined();
    });

    it('returns undefined deltaMidScores when deltaMidActuals not provided', async () => {
      const input = createExtendedTestInput({
        deltaMidPredictions: {
          'bid-delta-mid-1m': 5,
          'bid-delta-mid-5m': 10,
          'bid-delta-mid-15m': 15,
          'ask-delta-mid-1m': -3,
          'ask-delta-mid-5m': -6,
          'ask-delta-mid-15m': -9,
        },
      });
      const result = await forecastScorer.score(input);

      expect(result.deltaMidScores).toBeUndefined();
    });
  });

  describe('PnL calculation integration', () => {
    it('returns pnlResults when fillDetails and exitMids are provided', async () => {
      const input = createExtendedTestInput({
        fillDetails: {
          'bid-fill-1m': { filled: true, fillPrice: 100 },
          'bid-fill-5m': { filled: true, fillPrice: 100 },
          'bid-fill-15m': { filled: false },
          'ask-fill-1m': { filled: true, fillPrice: 101 },
          'ask-fill-5m': { filled: false },
          'ask-fill-15m': { filled: false },
        },
        exitMids: {
          'bid-fill-1m': 101,
          'bid-fill-5m': 102,
          'bid-fill-15m': undefined,
          'ask-fill-1m': 100,
          'ask-fill-5m': undefined,
          'ask-fill-15m': undefined,
        },
      });
      const result = await forecastScorer.score(input);

      expect(result.pnlResults).toBeDefined();
      expect(typeof result.pnlResults?.meanPnL).toBe('number');
      expect(typeof result.pnlResults?.totalPnL).toBe('number');
      expect(result.pnlResults?.filledCount).toBe(3);
      expect(result.pnlResults?.pnlBySide).toBeDefined();
      expect(result.pnlResults?.pnlByHorizon).toBeDefined();
    });

    it('returns undefined pnlResults when fillDetails not provided', async () => {
      const input = createExtendedTestInput({
        exitMids: {
          'bid-fill-1m': 101,
        },
      });
      const result = await forecastScorer.score(input);

      expect(result.pnlResults).toBeUndefined();
    });

    it('returns undefined pnlResults when exitMids not provided', async () => {
      const input = createExtendedTestInput({
        fillDetails: {
          'bid-fill-1m': { filled: true, fillPrice: 100 },
        },
      });
      const result = await forecastScorer.score(input);

      expect(result.pnlResults).toBeUndefined();
    });
  });

  describe('EV calculation integration', () => {
    it('returns evResults when fill predictions, delta-mid predictions, and fill prices are provided', async () => {
      const input = createExtendedTestInput({
        deltaMidPredictions: {
          'bid-delta-mid-1m': 5,
          'bid-delta-mid-5m': 10,
          'bid-delta-mid-15m': 15,
          'ask-delta-mid-1m': -3,
          'ask-delta-mid-5m': -6,
          'ask-delta-mid-15m': -9,
        },
        fillPrices: { bestBid: 100, bestAsk: 101 },
      });
      const result = await forecastScorer.score(input);

      expect(result.evResults).toBeDefined();
      expect(typeof result.evResults?.meanEV).toBe('number');
      expect(typeof result.evResults?.totalEV).toBe('number');
      expect(result.evResults?.evBySide).toBeDefined();
      expect(result.evResults?.evByHorizon).toBeDefined();
    });

    it('returns undefined evResults when deltaMidPredictions not provided', async () => {
      const input = createExtendedTestInput({
        fillPrices: { bestBid: 100, bestAsk: 101 },
      });
      const result = await forecastScorer.score(input);

      expect(result.evResults).toBeUndefined();
    });

    it('returns undefined evResults when fillPrices not provided', async () => {
      const input = createExtendedTestInput({
        deltaMidPredictions: {
          'bid-delta-mid-1m': 5,
          'bid-delta-mid-5m': 10,
          'bid-delta-mid-15m': 15,
          'ask-delta-mid-1m': -3,
          'ask-delta-mid-5m': -6,
          'ask-delta-mid-15m': -9,
        },
      });
      const result = await forecastScorer.score(input);

      expect(result.evResults).toBeUndefined();
    });
  });

  describe('EV-PnL gap calculation integration', () => {
    it('returns evPnlGap when both EV and PnL are computed', async () => {
      const input = createExtendedTestInput({
        deltaMidPredictions: {
          'bid-delta-mid-1m': 5,
          'bid-delta-mid-5m': 10,
          'bid-delta-mid-15m': 15,
          'ask-delta-mid-1m': -3,
          'ask-delta-mid-5m': -6,
          'ask-delta-mid-15m': -9,
        },
        fillPrices: { bestBid: 100, bestAsk: 101 },
        fillDetails: {
          'bid-fill-1m': { filled: true, fillPrice: 100 },
          'bid-fill-5m': { filled: true, fillPrice: 100 },
          'bid-fill-15m': { filled: false },
          'ask-fill-1m': { filled: true, fillPrice: 101 },
          'ask-fill-5m': { filled: false },
          'ask-fill-15m': { filled: false },
        },
        exitMids: {
          'bid-fill-1m': 101,
          'bid-fill-5m': 102,
          'bid-fill-15m': undefined,
          'ask-fill-1m': 100,
          'ask-fill-5m': undefined,
          'ask-fill-15m': undefined,
        },
      });
      const result = await forecastScorer.score(input);

      expect(result.evPnlGap).toBeDefined();
      expect(typeof result.evPnlGap?.gap).toBe('number');
      expect(typeof result.evPnlGap?.gapVariance).toBe('number');
      expect(typeof result.evPnlGap?.systematicOverestimation).toBe('boolean');
    });

    it('returns undefined evPnlGap when only EV is computed (no PnL)', async () => {
      const input = createExtendedTestInput({
        deltaMidPredictions: {
          'bid-delta-mid-1m': 5,
          'bid-delta-mid-5m': 10,
          'bid-delta-mid-15m': 15,
          'ask-delta-mid-1m': -3,
          'ask-delta-mid-5m': -6,
          'ask-delta-mid-15m': -9,
        },
        fillPrices: { bestBid: 100, bestAsk: 101 },
      });
      const result = await forecastScorer.score(input);

      expect(result.evResults).toBeDefined(); // EV is computed
      expect(result.pnlResults).toBeUndefined(); // PnL is not
      expect(result.evPnlGap).toBeUndefined();
    });

    it('returns undefined evPnlGap when only PnL is computed (no EV)', async () => {
      const input = createExtendedTestInput({
        fillDetails: {
          'bid-fill-1m': { filled: true, fillPrice: 100 },
          'bid-fill-5m': { filled: false },
          'bid-fill-15m': { filled: false },
          'ask-fill-1m': { filled: false },
          'ask-fill-5m': { filled: false },
          'ask-fill-15m': { filled: false },
        },
        exitMids: {
          'bid-fill-1m': 101,
          'bid-fill-5m': undefined,
          'bid-fill-15m': undefined,
          'ask-fill-1m': undefined,
          'ask-fill-5m': undefined,
          'ask-fill-15m': undefined,
        },
      });
      const result = await forecastScorer.score(input);

      expect(result.pnlResults).toBeDefined(); // PnL is computed
      expect(result.evResults).toBeUndefined(); // EV is not
      expect(result.evPnlGap).toBeUndefined();
    });
  });
});
