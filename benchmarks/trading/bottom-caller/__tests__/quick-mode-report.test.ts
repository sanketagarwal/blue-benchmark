import { describe, expect, it, vi } from 'vitest';
import {
  generateQuickMarkdown,
  generateQuickDatasetDiagnosticsSection,
  generateQuickPredictionDiversitySection,
  generateExtensionEnsemblePreview,
  generateQuickResultsTable,
  generateSingleClassWarning,
  generateQuickInterpretationNote,
  generateLabelBalanceGate,
  generateLabelByTimestampSection,
  generateScoredModelsSummary,
  persistQuickResults,
} from '../src/quick-mode-report';
import type { ModelState, BenchmarkDiagnostics, LabelByTimestamp } from '../src/persist-results';
import type { QuickRunMetadata, EnsembleDataBundle } from '../src/quick-mode-report';
import type { DatasetDiagnostics } from '../src/diagnostics/dataset-diagnostics';
import type { ModelValidityResult } from '../src/scorers/validity-gates';
import type { ExtensionPlan, ExtensionDecision } from '../src/extension/extension-trigger';
import type { TimeframeId } from '../src/timeframe-config';
import type { ModelParseDiagnostics } from '../src/diagnostics/parse-diagnostics';
import type { EnsemblePerformance } from '../src/ensemble/online-ensemble';

function createMockModelState(modelId: string): ModelState {
  return {
    modelId,
    eliminated: false,
    roundScores: [],
    logLossByHorizon: {
      '15m': [0.5, 0.6],
      '1h': [0.4, 0.5],
      '4h': [0.3, 0.4],
      '24h': [0.2, 0.3],
    },
    timeToPivotRatios: {
      '15m': [],
      '1h': [],
      '4h': [],
      '24h': [],
    },
  };
}

function createMockQuickRunMetadata(): QuickRunMetadata {
  return {
    startTime: new Date().toISOString(),
    symbolId: 'BTC-USD',
    totalRounds: 3,
    modelCount: 2,
  };
}

describe('Quick Mode Report', () => {
  describe('generateQuickMarkdown', () => {
    it('returns non-empty string', () => {
      const models = new Map<string, ModelState>();
      models.set('model-1', createMockModelState('model-1'));
      const meta = createMockQuickRunMetadata();

      const result = generateQuickMarkdown(models, meta);

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('contains expected sections', () => {
      const models = new Map<string, ModelState>();
      models.set('model-1', createMockModelState('model-1'));
      const meta = createMockQuickRunMetadata();

      const result = generateQuickMarkdown(models, meta);

      expect(result).toContain('# agent_006 Benchmark Results (QUICK MODE)');
      expect(result).toContain('**Symbol:** BTC-USD');
      expect(result).toContain('**Rounds:** 3');
      expect(result).toContain('## Results Summary');
      expect(result).toContain('## Scoring Methodology');
      expect(result).toContain('## Ground Truth Methodology');
    });

    it('includes model in results table', () => {
      const models = new Map<string, ModelState>();
      models.set('test-model', createMockModelState('test-model'));
      const meta = createMockQuickRunMetadata();

      const result = generateQuickMarkdown(models, meta);

      expect(result).toContain('test-model');
    });
  });

  describe('generateQuickDatasetDiagnosticsSection', () => {
    it('returns array with header when no diagnostics', () => {
      const result = generateQuickDatasetDiagnosticsSection(undefined);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toContain('Dataset Diagnostics');
      expect(result.some(line => line.includes('No data collected'))).toBe(true);
    });

    it('returns array with header and table when diagnostics provided', () => {
      const diagnostics = {
        totalRounds: 10,
        byHorizon: {
          '15m': {
            horizon: '15m' as const,
            labels: { n: 10, countTrue: 6, countFalse: 4, pTrue: 0.6 },
            baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.673 },
          },
          '1h': {
            horizon: '1h' as const,
            labels: { n: 10, countTrue: 5, countFalse: 5, pTrue: 0.5 },
            baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 },
          },
          '4h': {
            horizon: '4h' as const,
            labels: { n: 10, countTrue: 7, countFalse: 3, pTrue: 0.7 },
            baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.611 },
          },
          '24h': {
            horizon: '24h' as const,
            labels: { n: 10, countTrue: 8, countFalse: 2, pTrue: 0.8 },
            baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.500 },
          },
        },
      };

      const result = generateQuickDatasetDiagnosticsSection(diagnostics);

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toContain('Dataset Diagnostics');
      expect(result.some(line => line.includes('Horizon'))).toBe(true);
      expect(result.some(line => line.includes('15m'))).toBe(true);
    });
  });

  describe('generateQuickPredictionDiversitySection', () => {
    it('returns array with header when no diversities', () => {
      const result = generateQuickPredictionDiversitySection(undefined);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toContain('Prediction Diversity');
    });

    it('returns array with header when empty diversities', () => {
      const result = generateQuickPredictionDiversitySection([]);

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toContain('Prediction Diversity');
      expect(result.some(line => line.includes('No data collected'))).toBe(true);
    });

    it('renders diversity table for models with data', () => {
      const diversities = [
        {
          modelId: 'test-model',
          byHorizon: {
            '15m': { n: 10, uniquePCount: 5, pMin: 0.1, pMax: 0.9, pMean: 0.5, pStdDev: 0.2, confidenceStdDev: 0.1, noNewLowTrueRate: 0.6 },
            '1h': { n: 10, uniquePCount: 4, pMin: 0.2, pMax: 0.8, pMean: 0.5, pStdDev: 0.15, confidenceStdDev: 0.1, noNewLowTrueRate: 0.5 },
            '4h': { n: 10, uniquePCount: 3, pMin: 0.3, pMax: 0.7, pMean: 0.5, pStdDev: 0.1, confidenceStdDev: 0.1, noNewLowTrueRate: 0.4 },
            '24h': { n: 10, uniquePCount: 2, pMin: 0.4, pMax: 0.6, pMean: 0.5, pStdDev: 0.05, confidenceStdDev: 0.1, noNewLowTrueRate: 0.3 },
          },
        },
      ];

      const result = generateQuickPredictionDiversitySection(diversities);

      expect(result.some(line => line.includes('test-model'))).toBe(true);
      expect(result.some(line => line.includes('Unique P'))).toBe(true);
      expect(result.some(line => line.includes('15m'))).toBe(true);
    });
  });

  describe('generateExtensionEnsemblePreview', () => {
    it('returns empty array when no validity, extension, or ensemble data', () => {
      const meta = createMockQuickRunMetadata();

      const result = generateExtensionEnsemblePreview(meta);

      expect(result).toEqual([]);
    });

    it('includes validity section when validity results provided', () => {
      const meta = createMockQuickRunMetadata();
      meta.validityResults = [
        {
          modelId: 'model-1',
          validHorizons: ['15m', '1h', '4h', '24h'] as TimeframeId[],
          invalidHorizons: new Map(),
          isFullyInvalid: false,
        },
      ];

      const result = generateExtensionEnsemblePreview(meta);

      expect(result.some(line => line.includes('Extension & Ensemble Preview'))).toBe(true);
    });

    it('includes extension plan section when extension plan provided', () => {
      const meta = createMockQuickRunMetadata();
      const makeDecision = (horizon: TimeframeId, shouldExtend: boolean): ExtensionDecision => ({
        horizon,
        shouldExtend,
        reason: shouldExtend ? 'Prevalence out of bounds' : 'Rankable',
        qualifiedCount: 2,
        eligibleCount: 2,
        modelsToInclude: ['model-1'],
        extraRounds: shouldExtend ? 6 : 0,
      });
      meta.extensionPlan = {
        byHorizon: {
          '15m': makeDecision('15m', true),
          '1h': makeDecision('1h', false),
          '4h': makeDecision('4h', false),
          '24h': makeDecision('24h', false),
        },
        anyExtensionTriggered: true,
        totalExtraRounds: 6,
      };

      const result = generateExtensionEnsemblePreview(meta);

      expect(result.some(line => line.includes('Extension & Ensemble Preview'))).toBe(true);
    });

    it('includes ensemble section when strict and wide ensemble data provided', () => {
      const meta = createMockQuickRunMetadata();
      const makeEnsemblePerformance = (horizon: TimeframeId): EnsemblePerformance => ({
        horizon,
        meanLogLoss: 0.5,
        bestWindowLogLoss: 0.45,
        stability: 0.95,
        roundResults: [],
      });
      const mockBundle: EnsembleDataBundle = {
        byHorizon: {
          '15m': makeEnsemblePerformance('15m'),
          '1h': makeEnsemblePerformance('1h'),
          '4h': makeEnsemblePerformance('4h'),
          '24h': makeEnsemblePerformance('24h'),
        },
        baselines: {
          '15m': { prevalenceLL: 0.693, bestEligibleSingleLL: 0.5, bestOverallSingleLL: 0.5, equalWeightLL: 0.55 },
          '1h': { prevalenceLL: 0.693, bestEligibleSingleLL: 0.5, bestOverallSingleLL: 0.5, equalWeightLL: 0.55 },
          '4h': { prevalenceLL: 0.693, bestEligibleSingleLL: 0.5, bestOverallSingleLL: 0.5, equalWeightLL: 0.55 },
          '24h': { prevalenceLL: 0.693, bestEligibleSingleLL: 0.5, bestOverallSingleLL: 0.5, equalWeightLL: 0.55 },
        },
        topContributors: {
          '15m': [{ modelId: 'model-1', avgWeight: 1.0 }],
          '1h': [{ modelId: 'model-1', avgWeight: 1.0 }],
          '4h': [{ modelId: 'model-1', avgWeight: 1.0 }],
          '24h': [{ modelId: 'model-1', avgWeight: 1.0 }],
        },
        avgWeightEntropy: 0.5,
      };
      meta.strictEnsemble = mockBundle;
      meta.wideEnsemble = mockBundle;

      const result = generateExtensionEnsemblePreview(meta);

      expect(result.some(line => line.includes('Extension & Ensemble Preview'))).toBe(true);
    });
  });

  describe('generateQuickResultsTable', () => {
    it('sorts models with all rounds failed to end', () => {
      const models = new Map<string, ModelState>();
      const failedModel = createMockModelState('failed-model');
      failedModel.failedRounds = [1, 2, 3];
      failedModel.roundScores = [];
      failedModel.logLossByHorizon = { '15m': [], '1h': [], '4h': [], '24h': [] };

      const goodModel = createMockModelState('good-model');
      goodModel.roundScores = [
        { round: 1, logLoss: 0.5, perHorizonLogLoss: { '15m': 0.5, '1h': 0.5, '4h': 0.5, '24h': 0.5 }, pRankSum: 1, dirAccuracy: 0.8, calibration: 0.9 },
      ];

      models.set('failed-model', failedModel);
      models.set('good-model', goodModel);

      const result = generateQuickResultsTable(models, 3);

      const failedIndex = result.findIndex(line => line.includes('failed-model'));
      const goodIndex = result.findIndex(line => line.includes('good-model'));
      expect(goodIndex).toBeLessThan(failedIndex);
    });

    it('includes failure type breakdown when parse diagnostics provided', () => {
      const models = new Map<string, ModelState>();
      const model = createMockModelState('test-model');
      model.failedRounds = [1];
      models.set('test-model', model);

      const diagnostics: BenchmarkDiagnostics = {
        parseDiagnostics: [
          {
            modelId: 'test-model',
            parseSuccessCount: 2,
            parseFailCount: 1,
            schemaFailCount: 0,
            missingHorizonCount: 0,
            missingByHorizon: { '15m': 0, '1h': 0, '4h': 0, '24h': 0 },
            failuresByType: { transport: 0, timeout: 1, parse: 0, schema: 0, other: 0 },
          },
        ],
      };

      const result = generateQuickResultsTable(models, 3, diagnostics);

      expect(result.some(line => line.includes('timeout'))).toBe(true);
    });

    it('handles model with all rounds failed showing all dashes', () => {
      const models = new Map<string, ModelState>();
      const model = createMockModelState('all-failed');
      model.failedRounds = [1, 2, 3];
      model.roundScores = [];
      model.logLossByHorizon = { '15m': [], '1h': [], '4h': [], '24h': [] };
      models.set('all-failed', model);

      const result = generateQuickResultsTable(models, 3);

      expect(result.some(line => line.includes('all-failed') && line.includes('3/3 failed'))).toBe(true);
    });
  });

  describe('generateSingleClassWarning', () => {
    it('returns empty array when diagnostics undefined', () => {
      const result = generateSingleClassWarning(undefined);

      expect(result).toEqual([]);
    });

    it('returns empty array when not single class', () => {
      const diagnostics: DatasetDiagnostics = {
        totalRounds: 10,
        byHorizon: {
          '15m': { horizon: '15m', labels: { n: 10, countTrue: 6, countFalse: 4, pTrue: 0.6 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.673 } },
          '1h': { horizon: '1h', labels: { n: 10, countTrue: 5, countFalse: 5, pTrue: 0.5 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 } },
          '4h': { horizon: '4h', labels: { n: 10, countTrue: 7, countFalse: 3, pTrue: 0.7 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.611 } },
          '24h': { horizon: '24h', labels: { n: 10, countTrue: 8, countFalse: 2, pTrue: 0.8 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.500 } },
        },
      };

      const result = generateSingleClassWarning(diagnostics);

      expect(result).toEqual([]);
    });

    it('returns warning for single class with pTrue = 1.0 (all positive)', () => {
      const diagnostics: DatasetDiagnostics = {
        totalRounds: 10,
        byHorizon: {
          '15m': { horizon: '15m', labels: { n: 10, countTrue: 10, countFalse: 0, pTrue: 1.0 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0 } },
          '1h': { horizon: '1h', labels: { n: 10, countTrue: 10, countFalse: 0, pTrue: 1.0 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0 } },
          '4h': { horizon: '4h', labels: { n: 10, countTrue: 10, countFalse: 0, pTrue: 1.0 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0 } },
          '24h': { horizon: '24h', labels: { n: 10, countTrue: 10, countFalse: 0, pTrue: 1.0 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0 } },
        },
      };

      const result = generateSingleClassWarning(diagnostics);

      expect(result.some(line => line.includes('Single-class sample'))).toBe(true);
      expect(result.some(line => line.includes('positive'))).toBe(true);
    });

    it('returns warning for single class with pTrue = 0.0 (all negative)', () => {
      const diagnostics: DatasetDiagnostics = {
        totalRounds: 10,
        byHorizon: {
          '15m': { horizon: '15m', labels: { n: 10, countTrue: 0, countFalse: 10, pTrue: 0.0 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0 } },
          '1h': { horizon: '1h', labels: { n: 10, countTrue: 0, countFalse: 10, pTrue: 0.0 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0 } },
          '4h': { horizon: '4h', labels: { n: 10, countTrue: 0, countFalse: 10, pTrue: 0.0 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0 } },
          '24h': { horizon: '24h', labels: { n: 10, countTrue: 0, countFalse: 10, pTrue: 0.0 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0 } },
        },
      };

      const result = generateSingleClassWarning(diagnostics);

      expect(result.some(line => line.includes('Single-class sample'))).toBe(true);
      expect(result.some(line => line.includes('negative'))).toBe(true);
    });
  });

  describe('generateQuickInterpretationNote', () => {
    it('returns interpretation note with expected content', () => {
      const result = generateQuickInterpretationNote();

      expect(Array.isArray(result)).toBe(true);
      expect(result.some(line => line.includes('Quick-run interpretation'))).toBe(true);
      expect(result.some(line => line.includes('N=3 rounds'))).toBe(true);
      expect(result.some(line => line.includes('0.693'))).toBe(true);
    });
  });

  describe('generateLabelBalanceGate', () => {
    it('returns empty array when diagnostics undefined', () => {
      const result = generateLabelBalanceGate(undefined);

      expect(result).toEqual([]);
    });

    it('returns empty array when dataset byHorizon undefined', () => {
      const diagnostics: BenchmarkDiagnostics = {};

      const result = generateLabelBalanceGate(diagnostics);

      expect(result).toEqual([]);
    });

    it('returns PASSED when all horizons have both classes', () => {
      const diagnostics: BenchmarkDiagnostics = {
        dataset: {
          totalRounds: 10,
          byHorizon: {
            '15m': { horizon: '15m', labels: { n: 10, countTrue: 6, countFalse: 4, pTrue: 0.6 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.673 } },
            '1h': { horizon: '1h', labels: { n: 10, countTrue: 5, countFalse: 5, pTrue: 0.5 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 } },
            '4h': { horizon: '4h', labels: { n: 10, countTrue: 7, countFalse: 3, pTrue: 0.7 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.611 } },
            '24h': { horizon: '24h', labels: { n: 10, countTrue: 8, countFalse: 2, pTrue: 0.8 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.500 } },
          },
        },
      };

      const result = generateLabelBalanceGate(diagnostics);

      expect(result.some(line => line.includes('PASSED'))).toBe(true);
    });

    it('returns INFORMATIONAL warning when horizon has only one class', () => {
      const diagnostics: BenchmarkDiagnostics = {
        dataset: {
          totalRounds: 10,
          byHorizon: {
            '15m': { horizon: '15m', labels: { n: 10, countTrue: 10, countFalse: 0, pTrue: 1.0 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0 } },
            '1h': { horizon: '1h', labels: { n: 10, countTrue: 5, countFalse: 5, pTrue: 0.5 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.693 } },
            '4h': { horizon: '4h', labels: { n: 10, countTrue: 7, countFalse: 3, pTrue: 0.7 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.611 } },
            '24h': { horizon: '24h', labels: { n: 10, countTrue: 8, countFalse: 2, pTrue: 0.8 }, baselines: { randomLogLoss: 0.693, prevalenceLogLoss: 0.500 } },
          },
        },
      };

      const result = generateLabelBalanceGate(diagnostics);

      expect(result.some(line => line.includes('INFORMATIONAL'))).toBe(true);
      expect(result.some(line => line.includes('15m'))).toBe(true);
    });
  });

  describe('generateLabelByTimestampSection', () => {
    it('returns empty array when undefined', () => {
      const result = generateLabelByTimestampSection(undefined);

      expect(result).toEqual([]);
    });

    it('returns empty array when empty array', () => {
      const result = generateLabelByTimestampSection([]);

      expect(result).toEqual([]);
    });

    it('renders label table when data provided', () => {
      const labels: LabelByTimestamp[] = [
        {
          snapTime: new Date('2025-01-01T10:00:00Z'),
          labels: { '15m': 1, '1h': 0, '4h': 1, '24h': 0 },
        },
        {
          snapTime: new Date('2025-01-01T11:00:00Z'),
          labels: { '15m': 0, '1h': 1, '4h': 0, '24h': 1 },
        },
      ];

      const result = generateLabelByTimestampSection(labels);

      expect(result.some(line => line.includes('Label by Timestamp'))).toBe(true);
      expect(result.some(line => line.includes('2025-01-01'))).toBe(true);
      expect(result.some(line => line.includes('noNewLow'))).toBe(true);
    });
  });

  describe('generateScoredModelsSummary', () => {
    it('returns summary with correct counts', () => {
      const models = new Map<string, ModelState>();
      const scoredModel = createMockModelState('scored-model');
      scoredModel.roundScores = [
        { round: 1, logLoss: 0.5, perHorizonLogLoss: { '15m': 0.5, '1h': 0.5, '4h': 0.5, '24h': 0.5 }, pRankSum: 1, dirAccuracy: 0.8, calibration: 0.9 },
      ];

      const unscoredModel = createMockModelState('unscored-model');
      unscoredModel.roundScores = [];

      models.set('scored-model', scoredModel);
      models.set('unscored-model', unscoredModel);

      const result = generateScoredModelsSummary(models, 3);

      expect(result.some(line => line.includes('Scored models:'))).toBe(true);
      expect(result.some(line => line.includes('1/2'))).toBe(true);
    });
  });

  describe('persistQuickResults', () => {
    it('does not throw when writing results', () => {
      const models = new Map<string, ModelState>();
      models.set('model-1', createMockModelState('model-1'));
      const meta = createMockQuickRunMetadata();

      vi.mock('node:fs', () => ({
        writeFileSync: vi.fn(),
      }));

      expect(() => persistQuickResults(models, meta)).not.toThrow();
    });
  });
});
