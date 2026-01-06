import { describe, expect, it } from 'vitest';
import {
  computeRunInvariants,
  getDefaultInvariantsConfig,
  type RunInvariants,
} from '../src/run-invariants.js';
import type { ModelState } from '../src/persist-results.js';
import type { TimeframeId } from '../src/timeframe-config.js';
import type { DatasetDiagnostics } from '../src/diagnostics/dataset-diagnostics.js';

function createMockModelState(
  modelId: string,
  options: {
    effectiveRoundsByHorizon?: Partial<Record<TimeframeId, number>>;
    roundCount?: number;
    logLossValues?: Partial<Record<TimeframeId, number[]>>;
  } = {}
): ModelState {
  const defaultEffective = options.effectiveRoundsByHorizon ?? {};
  const roundCount = options.roundCount ?? 10;
  const logLossValues = options.logLossValues ?? {};

  const effectiveRoundsByHorizon: Record<TimeframeId, number> = {
    '15m': defaultEffective['15m'] ?? roundCount,
    '1h': defaultEffective['1h'] ?? roundCount,
    '4h': defaultEffective['4h'] ?? roundCount,
    '24h': defaultEffective['24h'] ?? roundCount,
  };

  const logLossByHorizon: Record<TimeframeId, number[]> = {
    '15m': logLossValues['15m'] ?? Array.from({ length: effectiveRoundsByHorizon['15m'] }, () => 0.5),
    '1h': logLossValues['1h'] ?? Array.from({ length: effectiveRoundsByHorizon['1h'] }, () => 0.5),
    '4h': logLossValues['4h'] ?? Array.from({ length: effectiveRoundsByHorizon['4h'] }, () => 0.5),
    '24h': logLossValues['24h'] ?? Array.from({ length: effectiveRoundsByHorizon['24h'] }, () => 0.5),
  };

  return {
    modelId,
    eliminated: false,
    roundScores: Array.from({ length: roundCount }, () => ({
      logLossByHorizon: { '15m': 0.5, '1h': 0.5, '4h': 0.5, '24h': 0.5 },
      brierByHorizon: { '15m': 0.25, '1h': 0.25, '4h': 0.25, '24h': 0.25 },
      extremeErrors: { '15m': false, '1h': false, '4h': false, '24h': false },
      predictions: { '15m': 0.5, '1h': 0.5, '4h': 0.5, '24h': 0.5 },
    })),
    logLossByHorizon,
    timeToPivotRatios: { '15m': [], '1h': [], '4h': [], '24h': [] },
    effectiveRoundsByHorizon,
  };
}

describe('run-invariants', () => {
  describe('getDefaultInvariantsConfig', () => {
    it('returns expected default values', () => {
      const config = getDefaultInvariantsConfig();

      expect(config.minEffectiveRoundsForArena).toBe(10);
      expect(config.minMinorityForRankable).toBe(5);
      expect(config.prevalenceBoundsForRankable).toEqual([0.1, 0.9]);
    });

    it('includes validity and qualification sub-configs', () => {
      const config = getDefaultInvariantsConfig();

      expect(config.validity).toBeDefined();
      expect(config.qualification).toBeDefined();
    });
  });

  describe('computeRunInvariants', () => {
    describe('empty models map', () => {
      it('returns empty sets for empty models map', () => {
        const models = new Map<string, ModelState>();
        const result = computeRunInvariants(models, 10);

        expect(result.sets.evaluated).toEqual([]);
        expect(result.sets.effective).toEqual([]);
        expect(result.sets.valid).toEqual([]);
        expect(result.sets.qualified).toEqual([]);
        expect(result.sets.arenaEligible).toEqual([]);
        expect(result.modelCount).toBe(0);
      });

      it('still computes horizon invariants with no diagnostics', () => {
        const models = new Map<string, ModelState>();
        const result = computeRunInvariants(models, 10);

        expect(result.byHorizon['15m'].isRankable).toBe(false);
        expect(result.byHorizon['15m'].rankabilityReason).toBe('no data');
        expect(result.byHorizon['15m'].randomLL).toBeCloseTo(0.693, 3);
      });
    });

    describe('single model with full coverage', () => {
      it('computes model invariants correctly', () => {
        const models = new Map<string, ModelState>();
        models.set('model-a', createMockModelState('model-a', { roundCount: 20 }));

        const result = computeRunInvariants(models, 20);

        expect(result.sets.evaluated).toContain('model-a');
        expect(result.sets.effective).toContain('model-a');
        expect(result.modelCount).toBe(1);
      });

      it('computes coverage correctly for full coverage', () => {
        const models = new Map<string, ModelState>();
        models.set('model-a', createMockModelState('model-a', { roundCount: 10 }));

        const result = computeRunInvariants(models, 10);

        const modelInvariants = result.byModel.get('model-a');
        expect(modelInvariants).toBeDefined();
        expect(modelInvariants?.overallCoverage).toBe(1);
        expect(modelInvariants?.coverageByHorizon['15m']).toBe(1);
      });
    });

    describe('multiple models with varying coverage', () => {
      it('correctly classifies models by effective rounds', () => {
        const models = new Map<string, ModelState>();
        models.set('full-coverage', createMockModelState('full-coverage', { roundCount: 20 }));
        models.set('partial-coverage', createMockModelState('partial-coverage', {
          roundCount: 10,
          effectiveRoundsByHorizon: { '15m': 5, '1h': 10, '4h': 10, '24h': 10 },
        }));
        models.set('no-coverage', createMockModelState('no-coverage', {
          roundCount: 0,
          effectiveRoundsByHorizon: { '15m': 0, '1h': 0, '4h': 0, '24h': 0 },
        }));

        const result = computeRunInvariants(models, 20);

        expect(result.sets.evaluated).toHaveLength(3);
        expect(result.sets.effective).toContain('full-coverage');
        expect(result.sets.effective).toContain('partial-coverage');
        expect(result.sets.effective).not.toContain('no-coverage');
      });

      it('computes failure rates correctly', () => {
        const models = new Map<string, ModelState>();
        models.set('model-a', createMockModelState('model-a', {
          roundCount: 10,
          effectiveRoundsByHorizon: { '15m': 8, '1h': 10, '4h': 10, '24h': 10 },
        }));

        const result = computeRunInvariants(models, 10);

        const modelInvariants = result.byModel.get('model-a');
        expect(modelInvariants?.failuresByHorizon['15m']).toBe(2);
        expect(modelInvariants?.failureRateByHorizon['15m']).toBe(0.2);
        expect(modelInvariants?.failuresByHorizon['1h']).toBe(0);
      });
    });

    describe('horizon rankability', () => {
      it('marks horizons as non-rankable without diagnostics', () => {
        const models = new Map<string, ModelState>();
        models.set('model-a', createMockModelState('model-a'));

        const result = computeRunInvariants(models, 10);

        expect(result.nonRankableHorizons).toContain('15m');
        expect(result.nonRankableHorizons).toContain('1h');
        expect(result.nonRankableHorizons).toContain('4h');
        expect(result.nonRankableHorizons).toContain('24h');
        expect(result.rankableHorizons).toHaveLength(0);
      });

      it('computes random and prevalence log loss', () => {
        const models = new Map<string, ModelState>();
        const result = computeRunInvariants(models, 10);

        expect(result.byHorizon['15m'].randomLL).toBeCloseTo(Math.log(2), 5);
        expect(result.byHorizon['15m'].prevalenceLL).toBe(Infinity);
      });
    });

    describe('model sets computation', () => {
      it('computes qualified models correctly', () => {
        const models = new Map<string, ModelState>();
        models.set('model-a', createMockModelState('model-a', {
          roundCount: 15,
          logLossValues: {
            '15m': Array.from({ length: 15 }, () => 0.3),
            '1h': Array.from({ length: 15 }, () => 0.3),
            '4h': Array.from({ length: 15 }, () => 0.3),
            '24h': Array.from({ length: 15 }, () => 0.3),
          },
        }));

        const result = computeRunInvariants(models, 15);

        expect(result.sets.evaluated).toContain('model-a');
        expect(result.sets.effective).toContain('model-a');
        expect(result.sets.valid).toContain('model-a');
      });

      it('respects minEffectiveRoundsForArena config', () => {
        const models = new Map<string, ModelState>();
        models.set('below-threshold', createMockModelState('below-threshold', {
          roundCount: 5,
          effectiveRoundsByHorizon: { '15m': 5, '1h': 5, '4h': 5, '24h': 5 },
        }));
        models.set('above-threshold', createMockModelState('above-threshold', {
          roundCount: 15,
          effectiveRoundsByHorizon: { '15m': 15, '1h': 15, '4h': 15, '24h': 15 },
        }));

        const result = computeRunInvariants(models, 15, undefined, undefined, {
          minEffectiveRoundsForArena: 10,
        });

        expect(result.sets.arenaEligible).not.toContain('below-threshold');
      });

      it('tracks setsByHorizon correctly', () => {
        const models = new Map<string, ModelState>();
        models.set('model-a', createMockModelState('model-a', { roundCount: 10 }));

        const result = computeRunInvariants(models, 10);

        expect(result.setsByHorizon['15m']).toBeDefined();
        expect(result.setsByHorizon['15m'].valid).toBeDefined();
        expect(result.setsByHorizon['15m'].qualified).toBeDefined();
        expect(result.setsByHorizon['15m'].arenaEligible).toBeDefined();
      });
    });

    describe('run-level metrics', () => {
      it('computes actualRounds from model roundScores', () => {
        const models = new Map<string, ModelState>();
        models.set('model-a', createMockModelState('model-a', { roundCount: 8 }));
        models.set('model-b', createMockModelState('model-b', { roundCount: 12 }));

        const result = computeRunInvariants(models, 15);

        expect(result.actualRounds).toBe(12);
        expect(result.intendedRounds).toBe(15);
      });

      it('returns 0 actualRounds for empty models', () => {
        const models = new Map<string, ModelState>();
        const result = computeRunInvariants(models, 10);

        expect(result.actualRounds).toBe(0);
      });
    });

    describe('with validity results', () => {
      it('filters valid models based on validity results', () => {
        const models = new Map<string, ModelState>();
        models.set('valid-model', createMockModelState('valid-model'));
        models.set('invalid-model', createMockModelState('invalid-model'));

        const validityResults = new Map([
          ['valid-model', { isFullyInvalid: false, validHorizons: ['15m', '1h', '4h', '24h'] as TimeframeId[], invalidHorizons: [] as TimeframeId[], failuresByHorizon: new Map() }],
          ['invalid-model', { isFullyInvalid: true, validHorizons: [] as TimeframeId[], invalidHorizons: ['15m', '1h', '4h', '24h'] as TimeframeId[], failuresByHorizon: new Map() }],
        ]);

        const result = computeRunInvariants(models, 10, validityResults);

        expect(result.sets.valid).toContain('valid-model');
        expect(result.sets.valid).not.toContain('invalid-model');
      });

      it('filters setsByHorizon.valid by per-horizon validity', () => {
        const models = new Map<string, ModelState>();
        models.set('partial-valid', createMockModelState('partial-valid'));

        const validityResults = new Map([
          ['partial-valid', {
            isFullyInvalid: false,
            validHorizons: ['15m', '1h'] as TimeframeId[],
            invalidHorizons: ['4h', '24h'] as TimeframeId[],
            failuresByHorizon: new Map(),
          }],
        ]);

        const result = computeRunInvariants(models, 10, validityResults);

        expect(result.setsByHorizon['15m'].valid).toContain('partial-valid');
        expect(result.setsByHorizon['1h'].valid).toContain('partial-valid');
        expect(result.setsByHorizon['4h'].valid).not.toContain('partial-valid');
        expect(result.setsByHorizon['24h'].valid).not.toContain('partial-valid');
      });

      it('returns empty valid array when validityResults has no matching model', () => {
        const models = new Map<string, ModelState>();
        models.set('model-a', createMockModelState('model-a'));

        const validityResults = new Map([
          ['other-model', {
            isFullyInvalid: false,
            validHorizons: ['15m'] as TimeframeId[],
            invalidHorizons: [] as TimeframeId[],
            failuresByHorizon: new Map(),
          }],
        ]);

        const result = computeRunInvariants(models, 10, validityResults);

        expect(result.setsByHorizon['15m'].valid).toEqual([]);
      });
    });

    describe('with dataset diagnostics', () => {
      function createMockDiagnostics(
        horizonData: Partial<Record<TimeframeId, { n: number; countTrue: number; countFalse: number; pTrue: number }>>
      ): DatasetDiagnostics {
        const defaultData = { n: 0, countTrue: 0, countFalse: 0, pTrue: 0 };
        return {
          totalRounds: 100,
          byHorizon: {
            '15m': {
              horizon: '15m',
              labels: horizonData['15m'] ?? defaultData,
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '1h': {
              horizon: '1h',
              labels: horizonData['1h'] ?? defaultData,
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '4h': {
              horizon: '4h',
              labels: horizonData['4h'] ?? defaultData,
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '24h': {
              horizon: '24h',
              labels: horizonData['24h'] ?? defaultData,
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
          },
        };
      }

      it('computes horizon invariants from diagnostics with balanced labels', () => {
        const diagnostics = createMockDiagnostics({
          '15m': { n: 100, countTrue: 50, countFalse: 50, pTrue: 0.5 },
        });

        const models = new Map<string, ModelState>();
        const result = computeRunInvariants(models, 10, undefined, diagnostics);

        expect(result.byHorizon['15m'].labelCount).toBe(100);
        expect(result.byHorizon['15m'].trueCount).toBe(50);
        expect(result.byHorizon['15m'].falseCount).toBe(50);
        expect(result.byHorizon['15m'].pTrue).toBe(0.5);
        expect(result.byHorizon['15m'].minorityCount).toBe(50);
        expect(result.byHorizon['15m'].isRankable).toBe(true);
        expect(result.byHorizon['15m'].rankabilityReason).toBeUndefined();
      });

      it('marks horizon non-rankable with insufficient minority class', () => {
        const diagnostics = createMockDiagnostics({
          '15m': { n: 100, countTrue: 3, countFalse: 97, pTrue: 0.03 },
        });

        const models = new Map<string, ModelState>();
        const result = computeRunInvariants(models, 10, undefined, diagnostics);

        expect(result.byHorizon['15m'].isRankable).toBe(false);
        expect(result.byHorizon['15m'].rankabilityReason).toContain('only 3 positive examples');
      });

      it('marks horizon non-rankable with pTrue outside bounds (too low)', () => {
        const diagnostics = createMockDiagnostics({
          '15m': { n: 100, countTrue: 5, countFalse: 95, pTrue: 0.05 },
        });

        const models = new Map<string, ModelState>();
        const result = computeRunInvariants(models, 10, undefined, diagnostics);

        expect(result.byHorizon['15m'].isRankable).toBe(false);
        expect(result.byHorizon['15m'].rankabilityReason).toContain('pTrue');
        expect(result.byHorizon['15m'].rankabilityReason).toContain('outside bounds');
      });

      it('marks horizon non-rankable with pTrue outside bounds (too high)', () => {
        const diagnostics = createMockDiagnostics({
          '15m': { n: 100, countTrue: 95, countFalse: 5, pTrue: 0.95 },
        });

        const models = new Map<string, ModelState>();
        const result = computeRunInvariants(models, 10, undefined, diagnostics);

        expect(result.byHorizon['15m'].isRankable).toBe(false);
        expect(result.byHorizon['15m'].rankabilityReason).toContain('pTrue');
        expect(result.byHorizon['15m'].rankabilityReason).toContain('outside bounds');
      });

      it('computes prevalenceLL correctly for non-extreme pTrue', () => {
        const diagnostics = createMockDiagnostics({
          '15m': { n: 100, countTrue: 40, countFalse: 60, pTrue: 0.4 },
        });

        const models = new Map<string, ModelState>();
        const result = computeRunInvariants(models, 10, undefined, diagnostics);

        expect(result.byHorizon['15m'].prevalenceLL).toBeLessThan(Infinity);
        expect(result.byHorizon['15m'].prevalenceLL).toBeGreaterThan(0);
      });

      it('returns Infinity prevalenceLL when pTrue is 0', () => {
        const diagnostics = createMockDiagnostics({
          '15m': { n: 100, countTrue: 0, countFalse: 100, pTrue: 0 },
        });

        const models = new Map<string, ModelState>();
        const result = computeRunInvariants(models, 10, undefined, diagnostics);

        expect(result.byHorizon['15m'].prevalenceLL).toBe(Infinity);
      });

      it('returns Infinity prevalenceLL when pTrue is 1', () => {
        const diagnostics = createMockDiagnostics({
          '15m': { n: 100, countTrue: 100, countFalse: 0, pTrue: 1 },
        });

        const models = new Map<string, ModelState>();
        const result = computeRunInvariants(models, 10, undefined, diagnostics);

        expect(result.byHorizon['15m'].prevalenceLL).toBe(Infinity);
      });

      it('populates rankableHorizons array when diagnostics allow', () => {
        const diagnostics = createMockDiagnostics({
          '15m': { n: 100, countTrue: 40, countFalse: 60, pTrue: 0.4 },
          '1h': { n: 100, countTrue: 50, countFalse: 50, pTrue: 0.5 },
        });

        const models = new Map<string, ModelState>();
        const result = computeRunInvariants(models, 10, undefined, diagnostics);

        expect(result.rankableHorizons).toContain('15m');
        expect(result.rankableHorizons).toContain('1h');
        expect(result.nonRankableHorizons).toContain('4h');
        expect(result.nonRankableHorizons).toContain('24h');
      });
    });

    describe('computeModelInvariants edge cases', () => {
      it('handles model with missing effectiveRoundsByHorizon (uses logLossByHorizon length)', () => {
        const modelState: ModelState = {
          modelId: 'fallback-model',
          eliminated: false,
          roundScores: [],
          logLossByHorizon: {
            '15m': [0.5, 0.6],
            '1h': [0.4],
            '4h': [],
            '24h': [0.3, 0.3, 0.3],
          },
          timeToPivotRatios: { '15m': [], '1h': [], '4h': [], '24h': [] },
          effectiveRoundsByHorizon: undefined as unknown as Record<TimeframeId, number>,
        };

        const models = new Map<string, ModelState>();
        models.set('fallback-model', modelState);

        const result = computeRunInvariants(models, 5);
        const invariants = result.byModel.get('fallback-model');

        expect(invariants?.effectiveNByHorizon['15m']).toBe(2);
        expect(invariants?.effectiveNByHorizon['1h']).toBe(1);
        expect(invariants?.effectiveNByHorizon['4h']).toBe(0);
        expect(invariants?.effectiveNByHorizon['24h']).toBe(3);
      });

      it('handles zero intendedRounds (coverage and failure rate = 0)', () => {
        const models = new Map<string, ModelState>();
        models.set('model-a', createMockModelState('model-a', { roundCount: 0 }));

        const result = computeRunInvariants(models, 0);
        const invariants = result.byModel.get('model-a');

        expect(invariants?.coverageByHorizon['15m']).toBe(0);
        expect(invariants?.failureRateByHorizon['15m']).toBe(0);
        expect(invariants?.overallCoverage).toBe(0);
      });

      it('computes correct totalEffectiveRounds across all horizons', () => {
        const models = new Map<string, ModelState>();
        models.set('model-a', createMockModelState('model-a', {
          roundCount: 10,
          effectiveRoundsByHorizon: { '15m': 8, '1h': 7, '4h': 9, '24h': 6 },
        }));

        const result = computeRunInvariants(models, 10);
        const invariants = result.byModel.get('model-a');

        expect(invariants?.totalEffectiveRounds).toBe(8 + 7 + 9 + 6);
      });
    });

    describe('computeMeanLogLossByHorizon edge cases', () => {
      it('returns Infinity for horizons with empty logLoss arrays', () => {
        const modelState: ModelState = {
          modelId: 'empty-ll',
          eliminated: false,
          roundScores: [],
          logLossByHorizon: {
            '15m': [],
            '1h': [0.5],
            '4h': [],
            '24h': [],
          },
          timeToPivotRatios: { '15m': [], '1h': [], '4h': [], '24h': [] },
          effectiveRoundsByHorizon: { '15m': 0, '1h': 1, '4h': 0, '24h': 0 },
        };

        const models = new Map<string, ModelState>();
        models.set('empty-ll', modelState);

        const result = computeRunInvariants(models, 10);

        expect(result.sets.effective).toContain('empty-ll');
      });
    });

    describe('qualifiedByModel population', () => {
      it('correctly builds qualified set from models beating prevalence threshold', () => {
        const diagnostics: DatasetDiagnostics = {
          totalRounds: 100,
          byHorizon: {
            '15m': {
              horizon: '15m',
              labels: { n: 100, countTrue: 50, countFalse: 50, pTrue: 0.5 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '1h': {
              horizon: '1h',
              labels: { n: 100, countTrue: 50, countFalse: 50, pTrue: 0.5 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '4h': {
              horizon: '4h',
              labels: { n: 100, countTrue: 50, countFalse: 50, pTrue: 0.5 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '24h': {
              horizon: '24h',
              labels: { n: 100, countTrue: 50, countFalse: 50, pTrue: 0.5 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
          },
        };

        const models = new Map<string, ModelState>();
        models.set('good-model', createMockModelState('good-model', {
          roundCount: 20,
          logLossValues: {
            '15m': Array.from({ length: 20 }, () => 0.3),
            '1h': Array.from({ length: 20 }, () => 0.3),
            '4h': Array.from({ length: 20 }, () => 0.3),
            '24h': Array.from({ length: 20 }, () => 0.3),
          },
        }));
        models.set('bad-model', createMockModelState('bad-model', {
          roundCount: 20,
          logLossValues: {
            '15m': Array.from({ length: 20 }, () => 2.0),
            '1h': Array.from({ length: 20 }, () => 2.0),
            '4h': Array.from({ length: 20 }, () => 2.0),
            '24h': Array.from({ length: 20 }, () => 2.0),
          },
        }));

        const result = computeRunInvariants(models, 20, undefined, diagnostics);

        expect(result.sets.qualified).toContain('good-model');
        expect(result.sets.qualified).not.toContain('bad-model');
      });

      it('populates setsByHorizon.qualified correctly', () => {
        const diagnostics: DatasetDiagnostics = {
          totalRounds: 100,
          byHorizon: {
            '15m': {
              horizon: '15m',
              labels: { n: 100, countTrue: 50, countFalse: 50, pTrue: 0.5 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '1h': {
              horizon: '1h',
              labels: { n: 100, countTrue: 50, countFalse: 50, pTrue: 0.5 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '4h': {
              horizon: '4h',
              labels: { n: 100, countTrue: 50, countFalse: 50, pTrue: 0.5 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '24h': {
              horizon: '24h',
              labels: { n: 100, countTrue: 50, countFalse: 50, pTrue: 0.5 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
          },
        };

        const models = new Map<string, ModelState>();
        models.set('good-model', createMockModelState('good-model', {
          roundCount: 20,
          logLossValues: {
            '15m': Array.from({ length: 20 }, () => 0.3),
            '1h': Array.from({ length: 20 }, () => 0.3),
            '4h': Array.from({ length: 20 }, () => 0.3),
            '24h': Array.from({ length: 20 }, () => 0.3),
          },
        }));

        const result = computeRunInvariants(models, 20, undefined, diagnostics);

        expect(result.setsByHorizon['15m'].qualified).toContain('good-model');
        expect(result.setsByHorizon['1h'].qualified).toContain('good-model');
      });

      it('handles arenaEligible filtering by horizon effective rounds', () => {
        const diagnostics: DatasetDiagnostics = {
          totalRounds: 100,
          byHorizon: {
            '15m': {
              horizon: '15m',
              labels: { n: 100, countTrue: 50, countFalse: 50, pTrue: 0.5 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '1h': {
              horizon: '1h',
              labels: { n: 100, countTrue: 50, countFalse: 50, pTrue: 0.5 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '4h': {
              horizon: '4h',
              labels: { n: 100, countTrue: 50, countFalse: 50, pTrue: 0.5 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '24h': {
              horizon: '24h',
              labels: { n: 100, countTrue: 50, countFalse: 50, pTrue: 0.5 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
          },
        };

        const models = new Map<string, ModelState>();
        models.set('partial-arena', createMockModelState('partial-arena', {
          roundCount: 15,
          effectiveRoundsByHorizon: { '15m': 15, '1h': 15, '4h': 15, '24h': 5 },
          logLossValues: {
            '15m': Array.from({ length: 15 }, () => 0.3),
            '1h': Array.from({ length: 15 }, () => 0.3),
            '4h': Array.from({ length: 15 }, () => 0.3),
            '24h': Array.from({ length: 5 }, () => 0.3),
          },
        }));

        const result = computeRunInvariants(models, 15, undefined, diagnostics, {
          minEffectiveRoundsForArena: 10,
        });

        expect(result.setsByHorizon['15m'].arenaEligible).toContain('partial-arena');
        expect(result.setsByHorizon['24h'].arenaEligible).not.toContain('partial-arena');
      });
    });

    describe('buildRankabilityReason edge cases', () => {
      it('reports negative minority when falseCount < trueCount', () => {
        const diagnostics: DatasetDiagnostics = {
          totalRounds: 100,
          byHorizon: {
            '15m': {
              horizon: '15m',
              labels: { n: 100, countTrue: 97, countFalse: 3, pTrue: 0.97 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '1h': {
              horizon: '1h',
              labels: { n: 0, countTrue: 0, countFalse: 0, pTrue: 0 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '4h': {
              horizon: '4h',
              labels: { n: 0, countTrue: 0, countFalse: 0, pTrue: 0 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '24h': {
              horizon: '24h',
              labels: { n: 0, countTrue: 0, countFalse: 0, pTrue: 0 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
          },
        };

        const models = new Map<string, ModelState>();
        const result = computeRunInvariants(models, 10, undefined, diagnostics);

        expect(result.byHorizon['15m'].rankabilityReason).toContain('negative');
        expect(result.byHorizon['15m'].rankabilityReason).toContain('3');
      });

      it('handles total = 0 in rankability reason (0% minority)', () => {
        const diagnostics: DatasetDiagnostics = {
          totalRounds: 0,
          byHorizon: {
            '15m': {
              horizon: '15m',
              labels: { n: 0, countTrue: 0, countFalse: 0, pTrue: 0 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '1h': {
              horizon: '1h',
              labels: { n: 0, countTrue: 0, countFalse: 0, pTrue: 0 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '4h': {
              horizon: '4h',
              labels: { n: 0, countTrue: 0, countFalse: 0, pTrue: 0 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
            '24h': {
              horizon: '24h',
              labels: { n: 0, countTrue: 0, countFalse: 0, pTrue: 0 },
              baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
            },
          },
        };

        const models = new Map<string, ModelState>();
        const result = computeRunInvariants(models, 10, undefined, diagnostics);

        expect(result.byHorizon['15m'].rankabilityReason).toContain('0');
      });
    });
  });
});
