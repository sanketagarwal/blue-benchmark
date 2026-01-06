/**
 * Calculate Brier score for a single prediction
 * BS = (p - y)^2 where y is 0 or 1
 *
 * @param predicted - Probability between 0 and 1
 * @param actual - Whether the event occurred
 * @returns Brier score (0 is perfect, 1 is worst)
 */
export function brierScore(predicted: number, actual: boolean): number {
  const y = actual ? 1 : 0;
  return (predicted - y) ** 2;
}

/**
 * Calculate mean Brier score across multiple predictions
 *
 * @param predictions - Array of probabilities
 * @param actuals - Array of actual outcomes
 * @returns Mean Brier score
 * @throws Error if array lengths don't match
 */
export function meanBrierScore(predictions: number[], actuals: boolean[]): number {
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
    sum += brierScore(prediction, actual);
  }
  return sum / predictions.length;
}

/**
 * Calculate Brier Skill Score
 * BSS = 1 - (model / baseline)
 *
 * @param modelBrierScore - Brier score of the model
 * @param baselineBrierScore - Brier score of the baseline
 * @returns Skill score (1 is perfect, 0 equals baseline, negative is worse than baseline)
 */
export function brierSkillScore(modelBrierScore: number, baselineBrierScore: number): number {
  if (baselineBrierScore === 0) {
    return modelBrierScore === 0 ? 0 : -Infinity;
  }
  return 1 - modelBrierScore / baselineBrierScore;
}
