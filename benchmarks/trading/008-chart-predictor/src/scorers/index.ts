/**
 * Scoring logic for Multi-Step Reasoning benchmark.
 * 
 * DETERMINISTIC SCORING: All fields have definite values.
 * Exact match = 1, wrong = 0. Adjacent bias gets 0.5 partial credit.
 */

import type { ChartReadingOutput } from '../output-schema.js';

export interface ChartReadingScore {
  // Individual field scores
  fieldScores: {
    uptrend_pullback_to_vwap: number;
    volatility_direction_combo: number;
    tested_and_held_support: number;
    breakout_with_volume: number;
    potential_reversal_at_support: number;
    overall_bias: number;
  };
  // Summary scores
  exactMatchCount: number;
  totalFields: number;
  accuracy: number;
}

/**
 * Score a boolean field (DETERMINISTIC - no nulls)
 * Returns 1 if exact match, 0 otherwise
 */
function scoreBooleanField(pred: boolean | null | undefined, truth: boolean): number {
  // Handle legacy null predictions gracefully - treat as false
  const predValue = pred === null || pred === undefined ? false : pred;
  return predValue === truth ? 1 : 0;
}

/**
 * Score an enum field
 * Returns 1 if exact match, 0 otherwise
 */
function scoreEnumField(pred: string | undefined, truth: string): number {
  return pred === truth ? 1 : 0;
}

/**
 * Score bias field with partial credit
 * Adjacent biases get 0.5 credit
 */
function scoreBiasField(pred: string | undefined, truth: string): number {
  if (pred === truth) return 1;

  // New simplified bias order (no "strongly" variants)
  const biasOrder = ['bearish', 'mildly_bearish', 'neutral', 'mildly_bullish', 'bullish'];
  const predIdx = biasOrder.indexOf(pred ?? '');
  const truthIdx = biasOrder.indexOf(truth);

  if (predIdx === -1 || truthIdx === -1) return 0;

  // Adjacent gets 0.5 credit
  if (Math.abs(predIdx - truthIdx) === 1) return 0.5;

  return 0;
}

/**
 * Score a chart reading prediction against ground truth
 */
export function scoreChartReading(
  prediction: ChartReadingOutput,
  groundTruth: ChartReadingOutput
): ChartReadingScore {
  const pred = prediction.multi_step;
  const truth = groundTruth.multi_step;

  const fieldScores = {
    uptrend_pullback_to_vwap: scoreBooleanField(pred.uptrend_pullback_to_vwap, truth.uptrend_pullback_to_vwap),
    volatility_direction_combo: scoreEnumField(pred.volatility_direction_combo, truth.volatility_direction_combo),
    tested_and_held_support: scoreBooleanField(pred.tested_and_held_support, truth.tested_and_held_support),
    breakout_with_volume: scoreBooleanField(pred.breakout_with_volume, truth.breakout_with_volume),
    potential_reversal_at_support: scoreBooleanField(pred.potential_reversal_at_support, truth.potential_reversal_at_support),
    overall_bias: scoreBiasField(pred.overall_bias, truth.overall_bias),
  };

  const scores = Object.values(fieldScores);
  const exactMatchCount = scores.filter(s => s === 1).length;
  const totalFields = 6;
  const accuracy = scores.reduce((sum, s) => sum + s, 0) / totalFields;

  return {
    fieldScores,
    exactMatchCount,
    totalFields,
    accuracy,
  };
}
