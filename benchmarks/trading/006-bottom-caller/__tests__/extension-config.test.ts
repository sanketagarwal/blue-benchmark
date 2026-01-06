import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EXTENSION_CONFIG,
  getExtensionConfig,
} from '../src/extension-config.js';

describe('extension-config', () => {
  describe('DEFAULT_EXTENSION_CONFIG', () => {
    it('has correct top-level values', () => {
      expect(DEFAULT_EXTENSION_CONFIG.nBase).toBe(24);
      expect(DEFAULT_EXTENSION_CONFIG.nExt).toBe(6);
      expect(DEFAULT_EXTENSION_CONFIG.nThreshold).toBe(5);
    });

    it('has correct sampling config', () => {
      expect(DEFAULT_EXTENSION_CONFIG.sampling.strategy).toBe('proximity');
      expect(DEFAULT_EXTENSION_CONFIG.sampling.proximityThresholds).toEqual({
        '15m': 0.004,
        '1h': 0.008,
        '4h': 0.015,
        '24h': 0.03,
      });
      expect(DEFAULT_EXTENSION_CONFIG.sampling.balancedTargets).toEqual({
        minPositive: 10,
        maxPositive: 14,
        minMinority: 8,
      });
      expect(DEFAULT_EXTENSION_CONFIG.sampling.minSeparationMinutes).toEqual({
        '15m': 30,
        '1h': 120,
        '4h': 360,
        '24h': 1440,
      });
    });

    it('has correct rankability config', () => {
      expect(DEFAULT_EXTENSION_CONFIG.rankability).toEqual({
        minEffectiveRounds: 18,
        minMinority: 8,
        prevalenceBounds: [0.2, 0.8],
      });
    });

    it('has correct validity config', () => {
      expect(DEFAULT_EXTENSION_CONFIG.validity.minCoverage).toBe(0.8);
      expect(DEFAULT_EXTENSION_CONFIG.validity.maxFailureRate).toBe(0.1);
      expect(DEFAULT_EXTENSION_CONFIG.validity.constantPredictor).toEqual({
        maxUniqueP: 2,
        maxPStdDev: 0.02,
      });
      expect(DEFAULT_EXTENSION_CONFIG.validity.extremeWrongRate).toBe(0.2);
      expect(DEFAULT_EXTENSION_CONFIG.validity.extremeThresholds).toEqual({
        high: 0.8,
        low: 0.2,
      });
    });

    it('has correct skillSanity config', () => {
      expect(DEFAULT_EXTENSION_CONFIG.skillSanity).toEqual({
        softFailThreshold: 0.762,
        hardFailThreshold: 0.9,
      });
    });

    it('has correct qualification config', () => {
      expect(DEFAULT_EXTENSION_CONFIG.qualification).toEqual({
        mode: 'prevalence_margin',
        prevalenceMargin: 0.1,
        topPercent: 0.7,
      });
    });

    it('has correct extension config', () => {
      expect(DEFAULT_EXTENSION_CONFIG.extension).toEqual({
        includeModels: 'eligible',
      });
    });

    it('has correct ensemble config', () => {
      expect(DEFAULT_EXTENSION_CONFIG.ensemble).toEqual({
        rollingWindowSize: 6,
        alpha: 4,
        minModels: 3,
      });
    });
  });

  describe('getExtensionConfig', () => {
    it('returns defaults when no overrides provided', () => {
      expect(getExtensionConfig()).toBe(DEFAULT_EXTENSION_CONFIG);
    });

    it('returns defaults when undefined override provided', () => {
      expect(getExtensionConfig(undefined)).toBe(DEFAULT_EXTENSION_CONFIG);
    });

    it('returns defaults when empty override provided', () => {
      const config = getExtensionConfig({});
      expect(config).toEqual(DEFAULT_EXTENSION_CONFIG);
    });

    it('merges partial top-level override correctly', () => {
      const config = getExtensionConfig({ nBase: 48 });
      expect(config.nBase).toBe(48);
      expect(config.nExt).toBe(6);
      expect(config.nThreshold).toBe(5);
      expect(config.sampling).toEqual(DEFAULT_EXTENSION_CONFIG.sampling);
    });

    it('merges nested object override correctly', () => {
      const config = getExtensionConfig({
        sampling: {
          strategy: 'balanced',
        },
      });
      expect(config.sampling.strategy).toBe('balanced');
      expect(config.sampling.proximityThresholds).toEqual(
        DEFAULT_EXTENSION_CONFIG.sampling.proximityThresholds
      );
      expect(config.sampling.balancedTargets).toEqual(
        DEFAULT_EXTENSION_CONFIG.sampling.balancedTargets
      );
    });

    it('merges deep nested override (single proximityThreshold)', () => {
      const config = getExtensionConfig({
        sampling: {
          proximityThresholds: {
            '15m': 0.01,
          },
        },
      });
      expect(config.sampling.proximityThresholds['15m']).toBe(0.01);
      expect(config.sampling.proximityThresholds['1h']).toBe(0.008);
      expect(config.sampling.proximityThresholds['4h']).toBe(0.015);
      expect(config.sampling.proximityThresholds['24h']).toBe(0.03);
      expect(config.sampling.strategy).toBe('proximity');
    });

    it('merges multiple nested overrides correctly', () => {
      const config = getExtensionConfig({
        nBase: 12,
        sampling: {
          strategy: 'both',
          balancedTargets: {
            minPositive: 5,
          },
        },
        rankability: {
          minEffectiveRounds: 24,
        },
        validity: {
          minCoverage: 0.9,
          constantPredictor: {
            maxUniqueP: 3,
          },
        },
      });

      expect(config.nBase).toBe(12);
      expect(config.nExt).toBe(6);

      expect(config.sampling.strategy).toBe('both');
      expect(config.sampling.balancedTargets.minPositive).toBe(5);
      expect(config.sampling.balancedTargets.maxPositive).toBe(14);
      expect(config.sampling.proximityThresholds).toEqual(
        DEFAULT_EXTENSION_CONFIG.sampling.proximityThresholds
      );

      expect(config.rankability.minEffectiveRounds).toBe(24);
      expect(config.rankability.minMinority).toBe(8);

      expect(config.validity.minCoverage).toBe(0.9);
      expect(config.validity.maxFailureRate).toBe(0.1);
      expect(config.validity.constantPredictor.maxUniqueP).toBe(3);
      expect(config.validity.constantPredictor.maxPStdDev).toBe(0.02);
    });

    it('does not mutate DEFAULT_EXTENSION_CONFIG', () => {
      const originalNBase = DEFAULT_EXTENSION_CONFIG.nBase;
      const originalStrategy = DEFAULT_EXTENSION_CONFIG.sampling.strategy;

      getExtensionConfig({ nBase: 100, sampling: { strategy: 'balanced' } });

      expect(DEFAULT_EXTENSION_CONFIG.nBase).toBe(originalNBase);
      expect(DEFAULT_EXTENSION_CONFIG.sampling.strategy).toBe(originalStrategy);
    });

    it('overrides qualification mode correctly', () => {
      const config = getExtensionConfig({
        qualification: {
          mode: 'top_percent',
        },
      });
      expect(config.qualification.mode).toBe('top_percent');
      expect(config.qualification.prevalenceMargin).toBe(0.1);
      expect(config.qualification.topPercent).toBe(0.7);
    });

    it('overrides extension includeModels correctly', () => {
      const config = getExtensionConfig({
        extension: {
          includeModels: 'qualified',
        },
      });
      expect(config.extension.includeModels).toBe('qualified');
    });

    it('overrides ensemble config correctly', () => {
      const config = getExtensionConfig({
        ensemble: {
          rollingWindowSize: 12,
          alpha: 2,
        },
      });
      expect(config.ensemble.rollingWindowSize).toBe(12);
      expect(config.ensemble.alpha).toBe(2);
      expect(config.ensemble.minModels).toBe(3);
    });
  });
});
