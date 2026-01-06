import { isHorizonRankable } from './persist-results.js';
import {
  qualifyModels,
  getDefaultQualificationConfig,
} from './scorers/phase-1-qualification.js';
import {
  getDefaultValidityConfig,
} from './scorers/validity-gates.js';
import { TIMEFRAME_IDS } from './timeframe-config.js';

import type { DatasetDiagnostics } from './diagnostics/dataset-diagnostics.js';
import type { ModelState } from './persist-results.js';
import type {
  QualificationConfig,
  QualificationResult,
} from './scorers/phase-1-qualification.js';
import type {
  ModelValidityResult,
  ValidityConfig,
} from './scorers/validity-gates.js';
import type { TimeframeId } from './timeframe-config.js';

/**
 * Model-level invariants computed once per model
 */
export interface ModelInvariants {
  modelId: string;

  effectiveNByHorizon: Record<TimeframeId, number>;

  failuresByHorizon: Record<TimeframeId, number>;

  failureRateByHorizon: Record<TimeframeId, number>;

  coverageByHorizon: Record<TimeframeId, number>;

  totalIntendedRounds: number;
  totalEffectiveRounds: number;
  overallCoverage: number;
}

/**
 * Horizon-level invariants computed once per horizon
 */
export interface HorizonInvariants {
  horizon: TimeframeId;

  labelCount: number;
  trueCount: number;
  falseCount: number;
  pTrue: number;
  minorityCount: number;

  isRankable: boolean;
  rankabilityReason: string | undefined;

  randomLL: number;
  prevalenceLL: number;
}

/**
 * Run-level invariants - the single source of truth
 */
export interface RunInvariants {
  intendedRounds: number;
  actualRounds: number;
  modelCount: number;

  byHorizon: Record<TimeframeId, HorizonInvariants>;

  byModel: Map<string, ModelInvariants>;

  rankableHorizons: TimeframeId[];
  nonRankableHorizons: TimeframeId[];

  sets: {
    evaluated: string[];
    effective: string[];
    valid: string[];
    qualified: string[];
    arenaEligible: string[];
  };

  setsByHorizon: Record<
    TimeframeId,
    {
      valid: string[];
      qualified: string[];
      arenaEligible: string[];
    }
  >;
}

/**
 * Configuration for computing invariants
 */
export interface InvariantsConfig {
  minEffectiveRoundsForArena: number;
  minMinorityForRankable: number;
  prevalenceBoundsForRankable: [number, number];
  validity: ValidityConfig;
  qualification: QualificationConfig;
}

const DEFAULT_MIN_EFFECTIVE_ROUNDS_FOR_ARENA = 10;
const DEFAULT_MIN_MINORITY_FOR_RANKABLE = 5;
const DEFAULT_PREVALENCE_BOUNDS: [number, number] = [0.1, 0.9];

/**
 * Get default invariants config
 * @returns Default InvariantsConfig with sensible defaults
 */
export function getDefaultInvariantsConfig(): InvariantsConfig {
  return {
    minEffectiveRoundsForArena: DEFAULT_MIN_EFFECTIVE_ROUNDS_FOR_ARENA,
    minMinorityForRankable: DEFAULT_MIN_MINORITY_FOR_RANKABLE,
    prevalenceBoundsForRankable: DEFAULT_PREVALENCE_BOUNDS,
    validity: getDefaultValidityConfig(),
    qualification: getDefaultQualificationConfig(),
  };
}

/**
 * Compute random log loss (coin flip baseline)
 * @returns log(2) ≈ 0.693
 */
function computeRandomLL(): number {
  return -Math.log(0.5);
}

/**
 * Compute prevalence log loss from label distribution
 * Formula: -(pTrue * log(pTrue) + pFalse * log(pFalse))
 * @param pTrue - Prevalence of true labels
 * @returns Log loss for optimal constant predictor, or Infinity if pTrue is 0 or 1
 */
function computePrevalenceLL(pTrue: number): number {
  if (pTrue <= 0 || pTrue >= 1) {
    return Infinity;
  }
  const pFalse = 1 - pTrue;
  return -(pTrue * Math.log(pTrue) + pFalse * Math.log(pFalse));
}

/**
 * Build non-rankable reason message
 * @param trueCount - Count of true labels
 * @param falseCount - Count of false labels
 * @param total - Total label count
 * @param minMinority - Minimum minority class count for rankability
 * @param bounds - [min, max] prevalence bounds for rankability
 * @returns Human-readable reason, or undefined if rankable
 */
function buildRankabilityReason(
  trueCount: number,
  falseCount: number,
  total: number,
  minMinority: number,
  bounds: [number, number]
): string | undefined {
  const minorityCount = Math.min(trueCount, falseCount);
  const minorityLabel = trueCount < falseCount ? 'positive' : 'negative';
  const pTrue = total > 0 ? trueCount / total : 0;

  if (minorityCount < minMinority) {
    const minorityPct = total > 0 ? ((minorityCount / total) * 100).toFixed(1) : '0';
    return `only ${String(minorityCount)} ${minorityLabel} examples (${minorityPct}%)`;
  }

  if (pTrue < bounds[0] || pTrue > bounds[1]) {
    return `pTrue (${pTrue.toFixed(3)}) outside bounds [${String(bounds[0])}, ${String(bounds[1])}]`;
  }

  return undefined;
}

/**
 * Compute horizon invariants from dataset diagnostics
 * @param horizon - The timeframe ID
 * @param diagnostics - Dataset diagnostics with label distribution
 * @param config - Invariants configuration
 * @returns HorizonInvariants for this horizon
 */
function computeHorizonInvariantsFromDiagnostics(
  horizon: TimeframeId,
  diagnostics: DatasetDiagnostics | undefined,
  config: InvariantsConfig
): HorizonInvariants {
  if (diagnostics?.byHorizon === undefined) {
    return {
      horizon,
      labelCount: 0,
      trueCount: 0,
      falseCount: 0,
      pTrue: 0,
      minorityCount: 0,
      isRankable: false,
      rankabilityReason: 'no data',
      randomLL: computeRandomLL(),
      prevalenceLL: Infinity,
    };
  }

  // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
  const d = diagnostics.byHorizon[horizon];
  const { n: labelCount, countTrue: trueCount, countFalse: falseCount, pTrue } = d.labels;
  const minorityCount = Math.min(trueCount, falseCount);

  const isRankable =
    isHorizonRankable(
      trueCount,
      falseCount,
      config.minMinorityForRankable,
      config.prevalenceBoundsForRankable[0]
    ) &&
    pTrue >= config.prevalenceBoundsForRankable[0] &&
    pTrue <= config.prevalenceBoundsForRankable[1];

  const rankabilityReason = isRankable
    ? undefined
    : buildRankabilityReason(
        trueCount,
        falseCount,
        labelCount,
        config.minMinorityForRankable,
        config.prevalenceBoundsForRankable
      );

  return {
    horizon,
    labelCount,
    trueCount,
    falseCount,
    pTrue,
    minorityCount,
    isRankable,
    rankabilityReason,
    randomLL: computeRandomLL(),
    prevalenceLL: computePrevalenceLL(pTrue),
  };
}

/**
 * Compute model invariants from model state
 * @param state - The model state to compute invariants from
 * @param intendedRounds - Total intended rounds for the run
 * @returns ModelInvariants for this model
 */
function computeModelInvariants(
  state: ModelState,
  intendedRounds: number
): ModelInvariants {
  const effectiveNByHorizon: Record<TimeframeId, number> = {
    '15m': 0,
    '1h': 0,
    '4h': 0,
    '24h': 0,
  };
  const failuresByHorizon: Record<TimeframeId, number> = {
    '15m': 0,
    '1h': 0,
    '4h': 0,
    '24h': 0,
  };
  const failureRateByHorizon: Record<TimeframeId, number> = {
    '15m': 0,
    '1h': 0,
    '4h': 0,
    '24h': 0,
  };
  const coverageByHorizon: Record<TimeframeId, number> = {
    '15m': 0,
    '1h': 0,
    '4h': 0,
    '24h': 0,
  };

  for (const horizon of TIMEFRAME_IDS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const llArray = state.logLossByHorizon[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const effectiveN = state.effectiveRoundsByHorizon?.[horizon] ?? llArray.length;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    effectiveNByHorizon[horizon] = effectiveN;

    const failures = intendedRounds - effectiveN;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    failuresByHorizon[horizon] = failures;

    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    failureRateByHorizon[horizon] = intendedRounds > 0 ? failures / intendedRounds : 0;

    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    coverageByHorizon[horizon] = intendedRounds > 0 ? effectiveN / intendedRounds : 0;
  }

  const totalEffectiveRounds = Object.values(effectiveNByHorizon).reduce(
    (sum, n) => sum + n,
    0
  );
  const totalIntended = intendedRounds * TIMEFRAME_IDS.length;

  return {
    modelId: state.modelId,
    effectiveNByHorizon,
    failuresByHorizon,
    failureRateByHorizon,
    coverageByHorizon,
    totalIntendedRounds: intendedRounds,
    totalEffectiveRounds,
    overallCoverage: totalIntended > 0 ? totalEffectiveRounds / totalIntended : 0,
  };
}

/**
 * Compute mean log loss by horizon for qualification
 * @param state - The model state with log losses
 * @returns Mean log loss per horizon (Infinity if no data)
 */
function computeMeanLogLossByHorizon(
  state: ModelState
): Record<TimeframeId, number> {
  const result: Record<TimeframeId, number> = {
    '15m': Infinity,
    '1h': Infinity,
    '4h': Infinity,
    '24h': Infinity,
  };

  for (const horizon of TIMEFRAME_IDS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const losses = state.logLossByHorizon[horizon];
    if (losses.length > 0) {
      const sum = losses.reduce((a, b) => a + b, 0);
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      result[horizon] = sum / losses.length;
    }
  }

  return result;
}

/**
 * Compute all run invariants from model states
 * This is the SINGLE function that computes all derived values
 * 
 * @param models - Map of model ID to ModelState
 * @param intendedRounds - Total intended rounds for the run
 * @param validityResults - Optional pre-computed validity results from Phase 0A
 * @param diagnostics - Optional dataset diagnostics with label distribution
 * @param config - Optional configuration overrides
 * @returns Complete RunInvariants with all derived values computed once
 */
export function computeRunInvariants(
  models: Map<string, ModelState>,
  intendedRounds: number,
  validityResults?: Map<string, ModelValidityResult>,
  diagnostics?: DatasetDiagnostics,
  config?: Partial<InvariantsConfig>
): RunInvariants {
  const fullConfig: InvariantsConfig = {
    ...getDefaultInvariantsConfig(),
    ...config,
  };

  const byHorizon: Record<TimeframeId, HorizonInvariants> = {
    '15m': computeHorizonInvariantsFromDiagnostics('15m', diagnostics, fullConfig),
    '1h': computeHorizonInvariantsFromDiagnostics('1h', diagnostics, fullConfig),
    '4h': computeHorizonInvariantsFromDiagnostics('4h', diagnostics, fullConfig),
    '24h': computeHorizonInvariantsFromDiagnostics('24h', diagnostics, fullConfig),
  };

  const byModel = new Map<string, ModelInvariants>();
  for (const [modelId, state] of models) {
    byModel.set(modelId, computeModelInvariants(state, intendedRounds));
  }

  const rankableHorizons = TIMEFRAME_IDS.filter(
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    (h) => byHorizon[h].isRankable
  );
  const nonRankableHorizons = TIMEFRAME_IDS.filter(
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    (h) => !byHorizon[h].isRankable
  );

  const evaluated = [...models.keys()];

  const effective = evaluated.filter((modelId) => {
    const invariants = byModel.get(modelId);
    return invariants !== undefined && invariants.totalEffectiveRounds > 0;
  });

  const valid = validityResults === undefined
    ? effective
    : evaluated.filter((modelId) => {
        const result = validityResults.get(modelId);
        return result !== undefined && !result.isFullyInvalid;
      });

  const prevalenceLLByHorizon: Record<TimeframeId, number> = {
    '15m': byHorizon['15m'].prevalenceLL,
    '1h': byHorizon['1h'].prevalenceLL,
    '4h': byHorizon['4h'].prevalenceLL,
    '24h': byHorizon['24h'].prevalenceLL,
  };

  const qualificationInputs = valid.map((modelId) => {
    const state = models.get(modelId);
    if (state === undefined) {
      throw new Error(`Model ${modelId} not found in models map`);
    }
    const validityResult = validityResults?.get(modelId);
    return {
      modelId,
      meanLogLossByHorizon: computeMeanLogLossByHorizon(state),
      validHorizons: validityResult?.validHorizons ?? TIMEFRAME_IDS,
    };
  });

  const qualificationResult: QualificationResult = qualifyModels(
    qualificationInputs,
    prevalenceLLByHorizon,
    fullConfig.qualification
  );

  const qualified = [...qualificationResult.qualifiedByModel.entries()]
    .filter(([, horizons]) => horizons.length > 0)
    .map(([modelId]) => modelId);

  const arenaEligible = qualified.filter((modelId) => {
    const invariants = byModel.get(modelId);
    if (invariants === undefined) {
      return false;
    }
    return TIMEFRAME_IDS.every((horizon) => {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      return invariants.effectiveNByHorizon[horizon] >= fullConfig.minEffectiveRoundsForArena;
    });
  });

  const setsByHorizon: Record<
    TimeframeId,
    { valid: string[]; qualified: string[]; arenaEligible: string[] }
  > = {
    '15m': { valid: [], qualified: [], arenaEligible: [] },
    '1h': { valid: [], qualified: [], arenaEligible: [] },
    '4h': { valid: [], qualified: [], arenaEligible: [] },
    '24h': { valid: [], qualified: [], arenaEligible: [] },
  };

  for (const horizon of TIMEFRAME_IDS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const horizonSets = setsByHorizon[horizon];

    horizonSets.valid = validityResults === undefined
      ? effective
      : valid.filter((modelId) => {
          const result = validityResults.get(modelId);
          return result?.validHorizons.includes(horizon) ?? false;
        });

    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    horizonSets.qualified = qualificationResult.byHorizon[horizon].qualifiedModels;

    horizonSets.arenaEligible = horizonSets.qualified.filter((modelId) => {
      const invariants = byModel.get(modelId);
      if (invariants === undefined) {
        return false;
      }
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      return invariants.effectiveNByHorizon[horizon] >= fullConfig.minEffectiveRoundsForArena;
    });
  }

  const actualRounds = Math.max(
    ...evaluated.map((modelId) => {
      const state = models.get(modelId);
      return state?.roundScores.length ?? 0;
    }),
    0
  );

  return {
    intendedRounds,
    actualRounds,
    modelCount: models.size,
    byHorizon,
    byModel,
    rankableHorizons,
    nonRankableHorizons,
    sets: {
      evaluated,
      effective,
      valid,
      qualified,
      arenaEligible,
    },
    setsByHorizon,
  };
}
