import type { TimeframeId } from './timeframe-config.js';

/** Worst-case log loss for invalid predictions (ln(1e-6) ≈ 13.8) */
export const INVALID_PREDICTION_LOG_LOSS = -Math.log(1e-6);

/** Confidence value to use when computing log loss for invalid predictions */
export const INVALID_PREDICTION_CONFIDENCE = 1e-6;

export interface ValidationResult {
  valid: boolean;
  invalidReason?: string;
}

export interface HorizonPrediction {
  noNewLow: boolean;
  confidence: number;
}

/**
 * Validate a single horizon prediction
 * @param prediction - The horizon prediction to validate
 * @param _horizon - The timeframe identifier (reserved for future horizon-specific validation)
 * @returns Validation result indicating if prediction is valid
 */
export function validateHorizonPrediction(
  prediction: HorizonPrediction,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for future horizon-specific validation rules
  _horizon: TimeframeId
): ValidationResult {
  if (typeof prediction.noNewLow !== 'boolean') {
    return {
      valid: false,
      invalidReason: `noNewLow must be a boolean, got ${typeof prediction.noNewLow}`,
    };
  }

  if (prediction.confidence < 0.5 || prediction.confidence > 1) {
    return {
      valid: false,
      invalidReason: `confidence ${String(prediction.confidence)} outside valid range [0.5, 1.0]`,
    };
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
