import { getLookbackBars, type TimeframeId } from './timeframe-config.js';

/** Worst-case log loss for invalid predictions (ln(1e-6) ≈ 13.8) */
export const INVALID_PREDICTION_LOG_LOSS = -Math.log(1e-6);

/** Confidence value to use when computing log loss for invalid predictions */
export const INVALID_PREDICTION_CONFIDENCE = 1e-6;

export interface ValidationResult {
  valid: boolean;
  invalidReason?: string;
}

export interface HorizonPrediction {
  hasBottomed: boolean;
  confidence: number;
  candlesBack?: number;
}

/**
 * Validate a single horizon prediction
 * @param prediction - The horizon prediction to validate
 * @param horizon - The timeframe identifier
 * @returns Validation result indicating if prediction is valid
 */
export function validateHorizonPrediction(
  prediction: HorizonPrediction,
  horizon: TimeframeId
): ValidationResult {
  const lookbackBars = getLookbackBars(horizon);
  const maxCandlesBack = lookbackBars - 1;

  // confidence must be in [0.5, 1.0]
  if (prediction.confidence < 0.5 || prediction.confidence > 1) {
    return {
      valid: false,
      invalidReason: `confidence ${String(prediction.confidence)} outside valid range [0.5, 1.0]`,
    };
  }

  // candlesBack required when hasBottomed=true
  if (prediction.hasBottomed && prediction.candlesBack === undefined) {
    return {
      valid: false,
      invalidReason: 'candlesBack required when hasBottomed=true',
    };
  }

  // candlesBack must be in valid range when provided
  if (prediction.candlesBack !== undefined) {
    if (!Number.isInteger(prediction.candlesBack)) {
      return {
        valid: false,
        invalidReason: `candlesBack must be integer, got ${String(prediction.candlesBack)}`,
      };
    }
    if (prediction.candlesBack < 0) {
      return {
        valid: false,
        invalidReason: `candlesBack ${String(prediction.candlesBack)} < 0`,
      };
    }
    if (prediction.candlesBack > maxCandlesBack) {
      return {
        valid: false,
        invalidReason: `candlesBack ${String(prediction.candlesBack)} > max ${String(maxCandlesBack)} for ${horizon}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate all horizon predictions
 * @param predictions - Record of predictions keyed by timeframe
 * @returns Record of validation results keyed by timeframe
 */
export function validateAllPredictions(
  predictions: Record<TimeframeId, HorizonPrediction>
): Record<TimeframeId, ValidationResult> {
  const results: Record<string, ValidationResult> = {};
  for (const horizon of ['15m', '1h', '4h', '24h'] as TimeframeId[]) {
    // eslint-disable-next-line security/detect-object-injection -- horizon is a typed literal from the array
    results[horizon] = validateHorizonPrediction(predictions[horizon], horizon);
  }
  return results as Record<TimeframeId, ValidationResult>;
}
