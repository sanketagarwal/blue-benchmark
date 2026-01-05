import { describe, expect, it } from 'vitest';
import {
  computePrevalenceLogLoss,
  getDefaultQualificationConfig,
  qualifyModels,
  qualifyModelsForHorizon,
  type ModelQualificationInput,
  type QualificationConfig,
} from '../src/scorers/phase-1-qualification.js';
import type { TimeframeId } from '../src/timeframe-config.js';

describe('phase-1-qualification', () => {
  describe('computePrevalenceLogLoss', () => {
    it('returns ~0.693 for balanced labels (pTrue = 0.5)', () => {
      const result = computePrevalenceLogLoss(50, 50);
      expect(result).toBeCloseTo(0.693, 2);
    });

    it('returns higher value for imbalanced labels', () => {
      const balanced = computePrevalenceLogLoss(50, 50);
      const imbalanced = computePrevalenceLogLoss(90, 10);
      expect(imbalanced).toBeLessThan(balanced);
    });

    it('returns Infinity when all labels are true', () => {
      const result = computePrevalenceLogLoss(100, 0);
      expect(result).toBe(Infinity);
    });

    it('returns Infinity when all labels are false', () => {
      const result = computePrevalenceLogLoss(0, 100);
      expect(result).toBe(Infinity);
    });

    it('returns Infinity when total count is zero', () => {
      const result = computePrevalenceLogLoss(0, 0);
      expect(result).toBe(Infinity);
    });

    it('handles asymmetric imbalance correctly', () => {
      const result70_30 = computePrevalenceLogLoss(70, 30);
      const result30_70 = computePrevalenceLogLoss(30, 70);
      expect(result70_30).toBeCloseTo(result30_70, 5);
    });
  });

  describe('getDefaultQualificationConfig', () => {
    it('returns expected defaults', () => {
      const config = getDefaultQualificationConfig();
      expect(config.mode).toBe('prevalence_margin');
      expect(config.prevalenceMargin).toBe(0.1);
      expect(config.topPercent).toBe(0.7);
    });
  });

  describe('qualifyModelsForHorizon', () => {
    const prevalenceLL = 0.693;

    const createModels = (): ModelQualificationInput[] => [
      {
        modelId: 'model-a',
        meanLogLossByHorizon: { '15m': 0.5, '1h': 0.6, '4h': 0.7, '24h': 0.8 },
        validHorizons: ['15m', '1h', '4h', '24h'],
      },
      {
        modelId: 'model-b',
        meanLogLossByHorizon: { '15m': 0.7, '1h': 0.75, '4h': 0.8, '24h': 0.85 },
        validHorizons: ['15m', '1h', '4h', '24h'],
      },
      {
        modelId: 'model-c',
        meanLogLossByHorizon: { '15m': 0.9, '1h': 0.95, '4h': 1.0, '24h': 1.1 },
        validHorizons: ['15m', '1h', '4h', '24h'],
      },
    ];

    describe('prevalence_margin mode', () => {
      const config: QualificationConfig = {
        mode: 'prevalence_margin',
        prevalenceMargin: 0.1,
        topPercent: 0.7,
      };

      it('qualifies models with meanLL <= prevalenceLL + margin', () => {
        const models = createModels();
        const result = qualifyModelsForHorizon(models, '15m', prevalenceLL, config);

        expect(result.threshold).toBeCloseTo(0.793, 2);
        expect(result.qualifiedModels).toContain('model-a');
        expect(result.qualifiedModels).toContain('model-b');
        expect(result.disqualifiedModels).toContain('model-c');
      });

      it('disqualifies models with meanLL > threshold', () => {
        const models = createModels();
        const result = qualifyModelsForHorizon(models, '15m', prevalenceLL, config);

        expect(result.disqualifiedModels).toEqual(['model-c']);
      });

      it('returns empty arrays when no valid models for horizon', () => {
        const models: ModelQualificationInput[] = [
          {
            modelId: 'model-a',
            meanLogLossByHorizon: { '15m': 0.5, '1h': 0.6, '4h': 0.7, '24h': 0.8 },
            validHorizons: ['1h'],
          },
        ];

        const result = qualifyModelsForHorizon(models, '15m', prevalenceLL, config);

        expect(result.qualifiedModels).toEqual([]);
        expect(result.disqualifiedModels).toEqual([]);
      });
    });

    describe('top_percent mode', () => {
      it('qualifies top 70% of models by log loss', () => {
        const models: ModelQualificationInput[] = [
          {
            modelId: 'model-a',
            meanLogLossByHorizon: { '15m': 0.5, '1h': 0.6, '4h': 0.7, '24h': 0.8 },
            validHorizons: ['15m', '1h', '4h', '24h'],
          },
          {
            modelId: 'model-b',
            meanLogLossByHorizon: { '15m': 0.6, '1h': 0.7, '4h': 0.8, '24h': 0.9 },
            validHorizons: ['15m', '1h', '4h', '24h'],
          },
          {
            modelId: 'model-c',
            meanLogLossByHorizon: { '15m': 0.7, '1h': 0.8, '4h': 0.9, '24h': 1.0 },
            validHorizons: ['15m', '1h', '4h', '24h'],
          },
          {
            modelId: 'model-d',
            meanLogLossByHorizon: { '15m': 0.8, '1h': 0.9, '4h': 1.0, '24h': 1.1 },
            validHorizons: ['15m', '1h', '4h', '24h'],
          },
          {
            modelId: 'model-e',
            meanLogLossByHorizon: { '15m': 0.9, '1h': 1.0, '4h': 1.1, '24h': 1.2 },
            validHorizons: ['15m', '1h', '4h', '24h'],
          },
        ];
        const config: QualificationConfig = {
          mode: 'top_percent',
          prevalenceMargin: 0.1,
          topPercent: 0.6,
        };
        const result = qualifyModelsForHorizon(models, '15m', prevalenceLL, config);

        expect(result.qualifiedModels).toContain('model-a');
        expect(result.qualifiedModels).toContain('model-b');
        expect(result.qualifiedModels).toContain('model-c');
        expect(result.disqualifiedModels).toContain('model-d');
        expect(result.disqualifiedModels).toContain('model-e');
      });

      it('sets threshold to last qualified model log loss', () => {
        const models: ModelQualificationInput[] = [
          {
            modelId: 'model-a',
            meanLogLossByHorizon: { '15m': 0.5, '1h': 0.6, '4h': 0.7, '24h': 0.8 },
            validHorizons: ['15m', '1h', '4h', '24h'],
          },
          {
            modelId: 'model-b',
            meanLogLossByHorizon: { '15m': 0.6, '1h': 0.7, '4h': 0.8, '24h': 0.9 },
            validHorizons: ['15m', '1h', '4h', '24h'],
          },
          {
            modelId: 'model-c',
            meanLogLossByHorizon: { '15m': 0.7, '1h': 0.8, '4h': 0.9, '24h': 1.0 },
            validHorizons: ['15m', '1h', '4h', '24h'],
          },
          {
            modelId: 'model-d',
            meanLogLossByHorizon: { '15m': 0.8, '1h': 0.9, '4h': 1.0, '24h': 1.1 },
            validHorizons: ['15m', '1h', '4h', '24h'],
          },
        ];
        const config: QualificationConfig = {
          mode: 'top_percent',
          prevalenceMargin: 0.1,
          topPercent: 0.5,
        };
        const result = qualifyModelsForHorizon(models, '15m', prevalenceLL, config);

        expect(result.threshold).toBe(0.6);
      });

      it('handles single model', () => {
        const models: ModelQualificationInput[] = [
          {
            modelId: 'model-a',
            meanLogLossByHorizon: { '15m': 0.5, '1h': 0.6, '4h': 0.7, '24h': 0.8 },
            validHorizons: ['15m', '1h', '4h', '24h'],
          },
        ];
        const config: QualificationConfig = {
          mode: 'top_percent',
          prevalenceMargin: 0.1,
          topPercent: 0.7,
        };
        const result = qualifyModelsForHorizon(models, '15m', prevalenceLL, config);

        expect(result.qualifiedModels).toEqual(['model-a']);
        expect(result.disqualifiedModels).toEqual([]);
      });
    });

    it('only considers models with valid horizons', () => {
      const models: ModelQualificationInput[] = [
        {
          modelId: 'model-a',
          meanLogLossByHorizon: { '15m': 0.5, '1h': 0.6, '4h': 0.7, '24h': 0.8 },
          validHorizons: ['15m'],
        },
        {
          modelId: 'model-b',
          meanLogLossByHorizon: { '15m': 0.7, '1h': 0.75, '4h': 0.8, '24h': 0.85 },
          validHorizons: ['1h', '4h', '24h'],
        },
      ];
      const config: QualificationConfig = {
        mode: 'prevalence_margin',
        prevalenceMargin: 0.1,
        topPercent: 0.7,
      };

      const result = qualifyModelsForHorizon(models, '15m', prevalenceLL, config);

      expect(result.qualifiedModels).toEqual(['model-a']);
      expect(result.disqualifiedModels).toEqual([]);
    });
  });

  describe('qualifyModels', () => {
    const prevalenceLLByHorizon: Record<TimeframeId, number> = {
      '15m': 0.693,
      '1h': 0.693,
      '4h': 0.693,
      '24h': 0.693,
    };

    const config: QualificationConfig = {
      mode: 'prevalence_margin',
      prevalenceMargin: 0.1,
      topPercent: 0.7,
    };

    it('qualifies models across all horizons', () => {
      const models: ModelQualificationInput[] = [
        {
          modelId: 'model-a',
          meanLogLossByHorizon: { '15m': 0.5, '1h': 0.6, '4h': 0.7, '24h': 0.75 },
          validHorizons: ['15m', '1h', '4h', '24h'],
        },
        {
          modelId: 'model-b',
          meanLogLossByHorizon: { '15m': 0.9, '1h': 0.95, '4h': 1.0, '24h': 1.1 },
          validHorizons: ['15m', '1h', '4h', '24h'],
        },
      ];

      const result = qualifyModels(models, prevalenceLLByHorizon, config);

      expect(result.byHorizon['15m'].qualifiedModels).toContain('model-a');
      expect(result.byHorizon['15m'].disqualifiedModels).toContain('model-b');
      expect(result.byHorizon['1h'].qualifiedModels).toContain('model-a');
      expect(result.byHorizon['4h'].qualifiedModels).toContain('model-a');
      expect(result.byHorizon['24h'].qualifiedModels).toContain('model-a');
    });

    it('populates qualifiedByModel map correctly', () => {
      const models: ModelQualificationInput[] = [
        {
          modelId: 'model-a',
          meanLogLossByHorizon: { '15m': 0.5, '1h': 0.6, '4h': 0.7, '24h': 0.75 },
          validHorizons: ['15m', '1h', '4h', '24h'],
        },
        {
          modelId: 'model-b',
          meanLogLossByHorizon: { '15m': 0.9, '1h': 0.6, '4h': 1.0, '24h': 1.1 },
          validHorizons: ['15m', '1h', '4h', '24h'],
        },
      ];

      const result = qualifyModels(models, prevalenceLLByHorizon, config);

      const modelAHorizons = result.qualifiedByModel.get('model-a');
      expect(modelAHorizons).toContain('15m');
      expect(modelAHorizons).toContain('1h');
      expect(modelAHorizons).toContain('4h');
      expect(modelAHorizons).toContain('24h');

      const modelBHorizons = result.qualifiedByModel.get('model-b');
      expect(modelBHorizons).toContain('1h');
      expect(modelBHorizons).not.toContain('15m');
    });

    it('handles models with limited valid horizons', () => {
      const models: ModelQualificationInput[] = [
        {
          modelId: 'model-a',
          meanLogLossByHorizon: { '15m': 0.5, '1h': 0.6, '4h': 0.7, '24h': 0.75 },
          validHorizons: ['15m', '1h'],
        },
      ];

      const result = qualifyModels(models, prevalenceLLByHorizon, config);

      const modelAHorizons = result.qualifiedByModel.get('model-a');
      expect(modelAHorizons).toContain('15m');
      expect(modelAHorizons).toContain('1h');
      expect(modelAHorizons).not.toContain('4h');
      expect(modelAHorizons).not.toContain('24h');
    });

    it('initializes qualifiedByModel for all models', () => {
      const models: ModelQualificationInput[] = [
        {
          modelId: 'model-a',
          meanLogLossByHorizon: { '15m': 0.5, '1h': 0.6, '4h': 0.7, '24h': 0.75 },
          validHorizons: ['15m', '1h', '4h', '24h'],
        },
        {
          modelId: 'model-b',
          meanLogLossByHorizon: { '15m': 0.9, '1h': 0.95, '4h': 1.0, '24h': 1.1 },
          validHorizons: ['15m', '1h', '4h', '24h'],
        },
      ];

      const result = qualifyModels(models, prevalenceLLByHorizon, config);

      expect(result.qualifiedByModel.has('model-a')).toBe(true);
      expect(result.qualifiedByModel.has('model-b')).toBe(true);
    });
  });
});
