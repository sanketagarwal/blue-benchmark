import type { TimeframeId } from '../timeframe-config.js';

export type QualificationMode = 'prevalence_margin' | 'top_percent';

export interface QualificationConfig {
  mode: QualificationMode;
  prevalenceMargin: number;
  topPercent: number;
}

export interface ModelQualificationInput {
  modelId: string;
  meanLogLossByHorizon: Record<TimeframeId, number>;
  validHorizons: TimeframeId[];
}

export interface HorizonQualificationResult {
  horizon: TimeframeId;
  qualifiedModels: string[];
  disqualifiedModels: string[];
  threshold: number;
  prevalenceLL: number;
}

export interface QualificationResult {
  byHorizon: Record<TimeframeId, HorizonQualificationResult>;
  qualifiedByModel: Map<string, TimeframeId[]>;
}

const HORIZONS: TimeframeId[] = ['15m', '1h', '4h', '24h'];

export function getDefaultQualificationConfig(): QualificationConfig {
  return {
    mode: 'prevalence_margin',
    prevalenceMargin: 0.1,
    topPercent: 0.7,
  };
}

export function computePrevalenceLogLoss(
  trueCount: number,
  falseCount: number
): number {
  const total = trueCount + falseCount;
  if (total === 0) {
    return Infinity;
  }
  const pTrue = trueCount / total;
  const pFalse = falseCount / total;

  if (pTrue === 0 || pFalse === 0) {
    return Infinity;
  }

  const llTrue = pTrue === 1 ? 0 : -Math.log(pTrue);
  const llFalse = pFalse === 1 ? 0 : -Math.log(pFalse);

  return pTrue * llTrue + pFalse * llFalse;
}

export function qualifyModelsForHorizon(
  models: ModelQualificationInput[],
  horizon: TimeframeId,
  prevalenceLL: number,
  config: QualificationConfig
): HorizonQualificationResult {
  const validModels = models.filter((m) => m.validHorizons.includes(horizon));

  if (validModels.length === 0) {
    return {
      horizon,
      qualifiedModels: [],
      disqualifiedModels: [],
      threshold: prevalenceLL + config.prevalenceMargin,
      prevalenceLL,
    };
  }

  let threshold: number;
  let qualifiedModels: string[];
  let disqualifiedModels: string[];

  if (config.mode === 'prevalence_margin') {
    threshold = prevalenceLL + config.prevalenceMargin;
    qualifiedModels = validModels
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed TimeframeId
      .filter((m) => m.meanLogLossByHorizon[horizon] <= threshold)
      .map((m) => m.modelId);
    disqualifiedModels = validModels
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed TimeframeId
      .filter((m) => m.meanLogLossByHorizon[horizon] > threshold)
      .map((m) => m.modelId);
  } else {
    const sorted = [...validModels].sort((a, b) => {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed TimeframeId
      const aLL = a.meanLogLossByHorizon[horizon];
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed TimeframeId
      const bLL = b.meanLogLossByHorizon[horizon];
      return aLL - bLL;
    });

    const keepCount = Math.ceil(sorted.length * config.topPercent);
    const qualifiedSet = new Set(
      sorted.slice(0, keepCount).map((m) => m.modelId)
    );

    const lastQualified = sorted[keepCount - 1];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed TimeframeId
    threshold = lastQualified?.meanLogLossByHorizon[horizon] ?? prevalenceLL;

    const qualified: string[] = [];
    const disqualified: string[] = [];
    for (const m of validModels) {
      if (qualifiedSet.has(m.modelId)) {
        qualified.push(m.modelId);
      } else {
        disqualified.push(m.modelId);
      }
    }
    qualifiedModels = qualified;
    disqualifiedModels = disqualified;
  }

  return {
    horizon,
    qualifiedModels,
    disqualifiedModels,
    threshold,
    prevalenceLL,
  };
}

export function qualifyModels(
  models: ModelQualificationInput[],
  prevalenceLLByHorizon: Record<TimeframeId, number>,
  config: QualificationConfig
): QualificationResult {
  const byHorizon = {} as Record<TimeframeId, HorizonQualificationResult>;
  const qualifiedByModel = new Map<string, TimeframeId[]>();

  for (const model of models) {
    qualifiedByModel.set(model.modelId, []);
  }

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed HORIZONS array
    const prevalenceLL = prevalenceLLByHorizon[horizon];
    const result = qualifyModelsForHorizon(models, horizon, prevalenceLL, config);
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed HORIZONS array
    byHorizon[horizon] = result;

    for (const modelId of result.qualifiedModels) {
      const horizons = qualifiedByModel.get(modelId);
      if (horizons !== undefined) {
        horizons.push(horizon);
      }
    }
  }

  return { byHorizon, qualifiedByModel };
}
