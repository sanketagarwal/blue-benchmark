/**
 * Extension configuration schema for benchmark extension rounds
 *
 * Rule: "If a number or a sentence describes the experiment, it comes from config."
 */

import type { TimeframeId } from './timeframe-config.js';

export interface SamplingConfig {
  strategy: 'proximity' | 'balanced' | 'both';
  proximityThresholds: Record<TimeframeId, number>;
  balancedTargets: {
    minPositive: number;
    maxPositive: number;
    minMinority: number;
  };
  minSeparationMinutes: Record<TimeframeId, number>;
}

export interface RankabilityConfig {
  minEffectiveRounds: number;
  minMinority: number;
  prevalenceBounds: [number, number];
}

export interface ConstantPredictorConfig {
  maxUniqueP: number;
  maxPStdDev: number;
}

export interface ValidityConfig {
  minCoverage: number;
  maxFailureRate: number;
  constantPredictor: ConstantPredictorConfig;
  extremeWrongRate: number;
  extremeThresholds: {
    high: number;
    low: number;
  };
}

export interface SkillSanityConfig {
  softFailThreshold: number;
  hardFailThreshold: number;
}

export interface QualificationConfig {
  mode: 'prevalence_margin' | 'top_percent';
  prevalenceMargin: number;
  topPercent: number;
}

export interface ExtensionEligibilityConfig {
  includeModels: 'qualified' | 'eligible';
}

export interface EnsembleConfig {
  rollingWindowSize: number;
  alpha: number;
  minModels: number;
}

export interface ExtensionConfig {
  nBase: number;
  nExt: number;
  nThreshold: number;

  sampling: SamplingConfig;

  rankability: RankabilityConfig;

  validity: ValidityConfig;

  skillSanity: SkillSanityConfig;

  qualification: QualificationConfig;

  extension: ExtensionEligibilityConfig;

  ensemble: EnsembleConfig;
}

export const DEFAULT_EXTENSION_CONFIG: ExtensionConfig = {
  nBase: 24,
  nExt: 6,
  nThreshold: 5,

  sampling: {
    strategy: 'proximity',
    proximityThresholds: {
      '15m': 0.004,
      '1h': 0.008,
      '4h': 0.015,
      '24h': 0.03,
    },
    balancedTargets: {
      minPositive: 10,
      maxPositive: 14,
      minMinority: 8,
    },
    minSeparationMinutes: {
      '15m': 30,
      '1h': 120,
      '4h': 360,
      '24h': 1440,
    },
  },

  rankability: {
    minEffectiveRounds: 18,
    minMinority: 8,
    prevalenceBounds: [0.2, 0.8],
  },

  validity: {
    minCoverage: 0.8,
    maxFailureRate: 0.1,
    constantPredictor: {
      maxUniqueP: 2,
      maxPStdDev: 0.02,
    },
    extremeWrongRate: 0.2,
    extremeThresholds: {
      high: 0.8,
      low: 0.2,
    },
  },

  skillSanity: {
    softFailThreshold: 0.762,
    hardFailThreshold: 0.9,
  },

  qualification: {
    mode: 'prevalence_margin',
    prevalenceMargin: 0.1,
    topPercent: 0.7,
  },

  extension: {
    includeModels: 'eligible',
  },

  ensemble: {
    rollingWindowSize: 6,
    alpha: 4,
    minModels: 3,
  },
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMergeInternal(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    // eslint-disable-next-line security/detect-object-injection -- iterating own keys
    const sourceValue = source[key];
    // eslint-disable-next-line security/detect-object-injection -- iterating own keys
    const targetValue = target[key];

    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      // eslint-disable-next-line security/detect-object-injection -- iterating own keys
      result[key] = deepMergeInternal(targetValue, sourceValue);
    } else if (sourceValue !== undefined) {
      // eslint-disable-next-line security/detect-object-injection -- iterating own keys
      result[key] = sourceValue;
    }
  }

  return result;
}

/**
 * Get extension configuration with user overrides merged with defaults
 * @param overrides - Partial configuration overrides
 * @returns Complete extension configuration
 */
export function getExtensionConfig(
  overrides?: DeepPartial<ExtensionConfig>
): ExtensionConfig {
  if (overrides === undefined) {
    return DEFAULT_EXTENSION_CONFIG;
  }
  return deepMergeInternal(
    DEFAULT_EXTENSION_CONFIG as unknown as Record<string, unknown>,
    overrides as unknown as Record<string, unknown>
  ) as unknown as ExtensionConfig;
}
