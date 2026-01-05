import { describe, it, expect } from 'vitest';
import {
  checkHorizonRankability,
  decideExtension,
  buildExtensionPlan,
  getDefaultExtensionTriggerConfig,
  type HorizonRankabilityStatus,
  type ExtensionTriggerConfig,
} from '../src/extension/extension-trigger.js';
import type { TimeframeId } from '../src/timeframe-config.js';

describe('extension-trigger', () => {
  describe('getDefaultExtensionTriggerConfig', () => {
    it('returns expected defaults', () => {
      const config = getDefaultExtensionTriggerConfig();
      expect(config).toEqual({
        nBase: 24,
        nExt: 6,
        nThreshold: 5,
        includeModels: 'eligible',
      });
    });
  });

  describe('checkHorizonRankability', () => {
    const minEffectiveRounds = 10;
    const minMinority = 3;
    const prevalenceBounds: [number, number] = [0.2, 0.8];

    it('horizon rankable with adequate minority and pTrue in bounds', () => {
      const result = checkHorizonRankability(
        15,
        7,
        5,
        minEffectiveRounds,
        minMinority,
        prevalenceBounds
      );
      expect(result.isRankable).toBe(true);
      expect(result.minorityCount).toBe(5);
      expect(result.prevalence).toBeCloseTo(7 / 12, 5);
    });

    it('horizon not rankable: insufficient minority', () => {
      const result = checkHorizonRankability(
        15,
        10,
        1,
        minEffectiveRounds,
        minMinority,
        prevalenceBounds
      );
      expect(result.isRankable).toBe(false);
      expect(result.minorityCount).toBe(1);
    });

    it('horizon not rankable: pTrue out of bounds (too low)', () => {
      const result = checkHorizonRankability(
        15,
        1,
        10,
        minEffectiveRounds,
        minMinority,
        prevalenceBounds
      );
      expect(result.isRankable).toBe(false);
      expect(result.prevalence).toBeLessThan(0.2);
    });

    it('horizon not rankable: pTrue out of bounds (too high)', () => {
      const result = checkHorizonRankability(
        15,
        10,
        1,
        minEffectiveRounds,
        minMinority,
        prevalenceBounds
      );
      expect(result.isRankable).toBe(false);
      expect(result.prevalence).toBeGreaterThan(0.8);
    });

    it('horizon not rankable: insufficient rounds', () => {
      const result = checkHorizonRankability(
        5,
        5,
        5,
        minEffectiveRounds,
        minMinority,
        prevalenceBounds
      );
      expect(result.isRankable).toBe(false);
      expect(result.effectiveRounds).toBe(5);
    });

    it('returns zero prevalence when no responses', () => {
      const result = checkHorizonRankability(
        15,
        0,
        0,
        minEffectiveRounds,
        minMinority,
        prevalenceBounds
      );
      expect(result.prevalence).toBe(0);
      expect(result.isRankable).toBe(false);
    });
  });

  describe('decideExtension', () => {
    const horizon: TimeframeId = '15m';
    const config: ExtensionTriggerConfig = {
      nBase: 24,
      nExt: 6,
      nThreshold: 5,
      includeModels: 'eligible',
    };

    const rankableStatus: HorizonRankabilityStatus = {
      horizon: '15m',
      isRankable: true,
      effectiveRounds: 20,
      minorityCount: 5,
      prevalence: 0.5,
    };

    const notRankableStatus: HorizonRankabilityStatus = {
      horizon: '15m',
      isRankable: false,
      effectiveRounds: 20,
      minorityCount: 2,
      prevalence: 0.9,
    };

    it('extension triggered: qualified > threshold', () => {
      const qualified = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
      const eligible = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'];

      const decision = decideExtension(
        horizon,
        rankableStatus,
        qualified,
        eligible,
        config
      );

      expect(decision.shouldExtend).toBe(true);
      expect(decision.qualifiedCount).toBe(6);
      expect(decision.extraRounds).toBe(6);
    });

    it('extension not triggered: qualified <= threshold', () => {
      const qualified = ['m1', 'm2', 'm3', 'm4', 'm5'];
      const eligible = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];

      const decision = decideExtension(
        horizon,
        rankableStatus,
        qualified,
        eligible,
        config
      );

      expect(decision.shouldExtend).toBe(false);
      expect(decision.qualifiedCount).toBe(5);
      expect(decision.extraRounds).toBe(0);
      expect(decision.modelsToInclude).toEqual([]);
      expect(decision.reason).toContain('insufficient competition');
    });

    it('extension includes all eligible models (E2 mode)', () => {
      const qualified = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
      const eligible = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'];

      const e2Config: ExtensionTriggerConfig = { ...config, includeModels: 'eligible' };
      const decision = decideExtension(
        horizon,
        rankableStatus,
        qualified,
        eligible,
        e2Config
      );

      expect(decision.modelsToInclude).toEqual(eligible);
      expect(decision.modelsToInclude.length).toBe(8);
    });

    it('extension includes only qualified models (E1 mode)', () => {
      const qualified = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
      const eligible = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'];

      const e1Config: ExtensionTriggerConfig = { ...config, includeModels: 'qualified' };
      const decision = decideExtension(
        horizon,
        rankableStatus,
        qualified,
        eligible,
        e1Config
      );

      expect(decision.modelsToInclude).toEqual(qualified);
      expect(decision.modelsToInclude.length).toBe(6);
    });

    it('reason indicates "refine rankings" when rankable', () => {
      const qualified = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
      const decision = decideExtension(
        horizon,
        rankableStatus,
        qualified,
        qualified,
        config
      );

      expect(decision.reason).toContain('refine rankings');
    });

    it('reason indicates "achieve rankability" when not rankable', () => {
      const qualified = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
      const decision = decideExtension(
        horizon,
        notRankableStatus,
        qualified,
        qualified,
        config
      );

      expect(decision.reason).toContain('achieve rankability');
    });
  });

  describe('buildExtensionPlan', () => {
    const config = getDefaultExtensionTriggerConfig();

    it('extension plan shows correct total extra rounds', () => {
      const rankabilityByHorizon: Record<TimeframeId, HorizonRankabilityStatus> = {
        '15m': { horizon: '15m', isRankable: true, effectiveRounds: 20, minorityCount: 5, prevalence: 0.5 },
        '1h': { horizon: '1h', isRankable: true, effectiveRounds: 20, minorityCount: 5, prevalence: 0.5 },
        '4h': { horizon: '4h', isRankable: false, effectiveRounds: 10, minorityCount: 2, prevalence: 0.9 },
        '24h': { horizon: '24h', isRankable: true, effectiveRounds: 20, minorityCount: 5, prevalence: 0.5 },
      };

      const qualifiedByHorizon: Record<TimeframeId, string[]> = {
        '15m': ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'],
        '1h': ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'],
        '4h': ['m1', 'm2', 'm3'],
        '24h': ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'],
      };

      const eligibleByHorizon: Record<TimeframeId, string[]> = {
        '15m': ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'],
        '1h': ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'],
        '4h': ['m1', 'm2', 'm3', 'm4'],
        '24h': ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9'],
      };

      const plan = buildExtensionPlan(
        rankabilityByHorizon,
        qualifiedByHorizon,
        eligibleByHorizon,
        config
      );

      expect(plan.anyExtensionTriggered).toBe(true);
      expect(plan.totalExtraRounds).toBe(18);

      expect(plan.byHorizon['15m'].shouldExtend).toBe(true);
      expect(plan.byHorizon['1h'].shouldExtend).toBe(true);
      expect(plan.byHorizon['4h'].shouldExtend).toBe(false);
      expect(plan.byHorizon['24h'].shouldExtend).toBe(true);
    });

    it('no extension triggered when all horizons have insufficient qualified models', () => {
      const rankabilityByHorizon: Record<TimeframeId, HorizonRankabilityStatus> = {
        '15m': { horizon: '15m', isRankable: true, effectiveRounds: 20, minorityCount: 5, prevalence: 0.5 },
        '1h': { horizon: '1h', isRankable: true, effectiveRounds: 20, minorityCount: 5, prevalence: 0.5 },
        '4h': { horizon: '4h', isRankable: true, effectiveRounds: 20, minorityCount: 5, prevalence: 0.5 },
        '24h': { horizon: '24h', isRankable: true, effectiveRounds: 20, minorityCount: 5, prevalence: 0.5 },
      };

      const qualifiedByHorizon: Record<TimeframeId, string[]> = {
        '15m': ['m1', 'm2', 'm3'],
        '1h': ['m1', 'm2'],
        '4h': ['m1'],
        '24h': ['m1', 'm2', 'm3', 'm4', 'm5'],
      };

      const eligibleByHorizon = qualifiedByHorizon;

      const plan = buildExtensionPlan(
        rankabilityByHorizon,
        qualifiedByHorizon,
        eligibleByHorizon,
        config
      );

      expect(plan.anyExtensionTriggered).toBe(false);
      expect(plan.totalExtraRounds).toBe(0);
    });
  });
});
