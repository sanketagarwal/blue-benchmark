/**
 * Extension trigger logic for bottom-caller benchmark
 *
 * Extends horizon H by N_ext rounds if:
 * 1. Horizon H is rankable after Stage A (base run)
 * 2. count(qualifiedModels(H)) > N_threshold
 *
 * Two modes for who plays extension rounds:
 * - E1 (focused): Only qualified models for that horizon
 * - E2 (wide): All eligible (valid) models for that horizon
 */

import type { TimeframeId } from '../timeframe-config.js';

export interface ExtensionTriggerConfig {
  nBase: number;
  nExt: number;
  nThreshold: number;
  includeModels: 'qualified' | 'eligible';
}

export interface HorizonRankabilityStatus {
  horizon: TimeframeId;
  isRankable: boolean;
  effectiveRounds: number;
  minorityCount: number;
  prevalence: number;
}

export interface ExtensionDecision {
  horizon: TimeframeId;
  shouldExtend: boolean;
  reason: string;
  qualifiedCount: number;
  eligibleCount: number;
  modelsToInclude: string[];
  extraRounds: number;
}

export interface ExtensionPlan {
  byHorizon: Record<TimeframeId, ExtensionDecision>;
  anyExtensionTriggered: boolean;
  totalExtraRounds: number;
}

export function getDefaultExtensionTriggerConfig(): ExtensionTriggerConfig {
  return {
    nBase: 24,
    nExt: 6,
    nThreshold: 5,
    includeModels: 'eligible',
  };
}

export function checkHorizonRankability(
  effectiveRounds: number,
  trueCount: number,
  falseCount: number,
  minEffectiveRounds: number,
  minMinority: number,
  prevalenceBounds: [number, number]
): HorizonRankabilityStatus {
  const totalResponses = trueCount + falseCount;
  const minorityCount = Math.min(trueCount, falseCount);
  const prevalence = totalResponses > 0 ? trueCount / totalResponses : 0;

  const meetsRoundThreshold = effectiveRounds >= minEffectiveRounds;
  const meetsMinorityThreshold = minorityCount >= minMinority;
  const meetsPrevalenceBounds =
    prevalence >= prevalenceBounds[0] && prevalence <= prevalenceBounds[1];

  const isRankable =
    meetsRoundThreshold && meetsMinorityThreshold && meetsPrevalenceBounds;

  return {
    horizon: '15m' as TimeframeId,
    isRankable,
    effectiveRounds,
    minorityCount,
    prevalence,
  };
}

export function decideExtension(
  horizon: TimeframeId,
  rankability: HorizonRankabilityStatus,
  qualifiedModels: string[],
  eligibleModels: string[],
  config: ExtensionTriggerConfig
): ExtensionDecision {
  const qualifiedCount = qualifiedModels.length;
  const eligibleCount = eligibleModels.length;

  if (!rankability.isRankable) {
    return {
      horizon,
      shouldExtend: false,
      reason: `Horizon not rankable (effective=${String(rankability.effectiveRounds)}, minority=${String(rankability.minorityCount)}, prevalence=${rankability.prevalence.toFixed(3)})`,
      qualifiedCount,
      eligibleCount,
      modelsToInclude: [],
      extraRounds: 0,
    };
  }

  if (qualifiedCount <= config.nThreshold) {
    return {
      horizon,
      shouldExtend: false,
      reason: `Qualified count (${String(qualifiedCount)}) <= threshold (${String(config.nThreshold)})`,
      qualifiedCount,
      eligibleCount,
      modelsToInclude: [],
      extraRounds: 0,
    };
  }

  const modelsToInclude =
    config.includeModels === 'qualified' ? qualifiedModels : eligibleModels;

  return {
    horizon,
    shouldExtend: true,
    reason: `Rankable with ${String(qualifiedCount)} qualified models > threshold (${String(config.nThreshold)})`,
    qualifiedCount,
    eligibleCount,
    modelsToInclude,
    extraRounds: config.nExt,
  };
}

export function buildExtensionPlan(
  rankabilityByHorizon: Record<TimeframeId, HorizonRankabilityStatus>,
  qualifiedByHorizon: Record<TimeframeId, string[]>,
  eligibleByHorizon: Record<TimeframeId, string[]>,
  config: ExtensionTriggerConfig
): ExtensionPlan {
  const horizons = Object.keys(rankabilityByHorizon) as TimeframeId[];
  const byHorizon: Record<TimeframeId, ExtensionDecision> = {} as Record<
    TimeframeId,
    ExtensionDecision
  >;

  let anyExtensionTriggered = false;
  let totalExtraRounds = 0;

  for (const horizon of horizons) {
    // eslint-disable-next-line security/detect-object-injection -- horizon is from typed TimeframeId keys extracted from rankabilityByHorizon
    const rankability = rankabilityByHorizon[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon is from typed TimeframeId keys extracted from rankabilityByHorizon
    const qualified = qualifiedByHorizon[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon is from typed TimeframeId keys extracted from rankabilityByHorizon
    const eligible = eligibleByHorizon[horizon];

    const decision = decideExtension(
      horizon,
      rankability,
      qualified,
      eligible,
      config
    );

    // eslint-disable-next-line security/detect-object-injection -- horizon is from typed TimeframeId keys extracted from rankabilityByHorizon
    byHorizon[horizon] = decision;

    if (decision.shouldExtend) {
      anyExtensionTriggered = true;
      totalExtraRounds += decision.extraRounds;
    }
  }

  return {
    byHorizon,
    anyExtensionTriggered,
    totalExtraRounds,
  };
}
