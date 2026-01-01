/**
 * Small epsilon to prevent log(0)
 */
const EPSILON = 1e-15;

/**
 * Calculate log loss for a single prediction
 * LL = -(y*log(p) + (1-y)*log(1-p))
 * Predictions are clipped to [EPSILON, 1-EPSILON] to avoid infinity
 *
 * @param predicted - Probability between 0 and 1
 * @param actual - Whether the event occurred
 * @returns Log loss value
 */
export function logLoss(predicted: number, actual: boolean): number {
  // Clip prediction to prevent log(0)
  const p = Math.max(EPSILON, Math.min(1 - EPSILON, predicted));

  if (actual) {
    return -Math.log(p);
  }
  return -Math.log(1 - p);
}

/**
 * Calculate mean log loss across multiple predictions
 *
 * @param predictions - Array of probabilities
 * @param actuals - Array of actual outcomes
 * @returns Mean log loss
 * @throws Error if array lengths don't match
 */
export function meanLogLoss(predictions: number[], actuals: boolean[]): number {
  if (predictions.length !== actuals.length) {
    throw new Error(
      `Array length mismatch: predictions (${String(predictions.length)}) vs actuals (${String(actuals.length)})`
    );
  }

  let sum = 0;
  for (const [index, prediction] of predictions.entries()) {
    // eslint-disable-next-line security/detect-object-injection -- Array access with validated index
    const actual = actuals[index];
    if (typeof actual !== 'boolean' || typeof prediction !== 'number') {
      throw new TypeError(`Invalid value at index ${String(index)}`);
    }
    sum += logLoss(prediction, actual);
  }
  return sum / predictions.length;
}
