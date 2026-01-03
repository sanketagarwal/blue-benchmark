/**
 * Compute functions for benchmark diagnostics
 */

import { createHash } from 'node:crypto';

import type { TimeframeId } from '../timeframe-config.js';
import type {
  HorizonDatasetDiagnostics,
  InputUniquenessRecord,
  LabelInfo,
  PredictionDiversityDiagnostics,
} from './types.js';

/**
 * Clamp probability to avoid log(0)
 * @param p - Probability value to clamp
 * @param eps - Epsilon for clamping bounds
 * @returns Clamped probability value
 */
function clamp(p: number, eps = 1e-15): number {
  return Math.max(eps, Math.min(1 - eps, p));
}

/**
 * Compute binary log loss for a single prediction
 * @param p - Predicted probability
 * @param y - True label
 * @returns Log loss value
 */
function binaryLogLoss(p: number, y: boolean): number {
  const pClamped = clamp(p);
  return y ? -Math.log(pClamped) : -Math.log(1 - pClamped);
}

/**
 * Compute mean of an array
 * @param values - Array of numbers
 * @returns Mean value
 */
function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Compute standard deviation of an array
 * @param values - Array of numbers
 * @returns Standard deviation
 */
function standardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const m = mean(values);
  const squaredDiffs = values.map((v) => (v - m) ** 2);
  return Math.sqrt(mean(squaredDiffs));
}

/**
 * Compute dataset diagnostics for a single horizon from an array of labels
 * @param labels - Array of boolean labels (true = noNewLow)
 * @returns Dataset diagnostics for the horizon
 */
export function computeHorizonDatasetDiagnostics(
  labels: boolean[]
): HorizonDatasetDiagnostics {
  const n = labels.length;
  if (n === 0) {
    return {
      n: 0,
      countTrue: 0,
      countFalse: 0,
      pTrue: 0,
      baselineRandomLL: 0,
      baselinePrevalenceLL: 0,
    };
  }

  const countTrue = labels.filter(Boolean).length;
  const countFalse = n - countTrue;
  const pTrue = countTrue / n;

  const baselineRandomLL = Math.log(2);

  let baselinePrevalenceLL: number;
  if (pTrue === 0 || pTrue === 1) {
    baselinePrevalenceLL = 0;
  } else {
    const losses = labels.map((y) => binaryLogLoss(pTrue, y));
    baselinePrevalenceLL = mean(losses);
  }

  return {
    n,
    countTrue,
    countFalse,
    pTrue,
    baselineRandomLL,
    baselinePrevalenceLL,
  };
}

/**
 * Compute prediction diversity diagnostics from an array of probability predictions
 * @param predictions - Array of probability predictions
 * @param noNewLowPredictions - Optional array of boolean predictions for noNewLow rate
 * @returns Prediction diversity diagnostics
 */
export function computePredictionDiversity(
  predictions: number[],
  noNewLowPredictions?: boolean[]
): PredictionDiversityDiagnostics {
  if (predictions.length === 0) {
    return {
      uniquePCount: 0,
      pMin: 0,
      pMax: 0,
      pStdDev: 0,
      confidenceStdDev: 0,
      noNewLowTrueRate: 0,
    };
  }

  const uniquePs = new Set(predictions);
  const confidences = predictions.map((p) => Math.abs(p - 0.5));

  let noNewLowTrueRate = 0;
  if (noNewLowPredictions !== undefined && noNewLowPredictions.length > 0) {
    const trueCount = noNewLowPredictions.filter(Boolean).length;
    noNewLowTrueRate = trueCount / noNewLowPredictions.length;
  }

  return {
    uniquePCount: uniquePs.size,
    pMin: Math.min(...predictions),
    pMax: Math.max(...predictions),
    pStdDev: standardDeviation(predictions),
    confidenceStdDev: standardDeviation(confidences),
    noNewLowTrueRate,
  };
}

/**
 * Create SHA-256 hash from a string or bytes
 * @param data - String or Uint8Array to hash
 * @returns Hex-encoded SHA-256 hash
 */
function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Create input uniqueness record from prompt, images, and label info
 * @param promptText - The prompt text to hash
 * @param images - Map of timeframe ID to image bytes
 * @param labelInfo - Label information for hashing
 * @param snapTime - Prediction timestamp
 * @returns Input uniqueness record with all hashes
 */
export function createHashFromInputs(
  promptText: string,
  images: Record<TimeframeId, Uint8Array>,
  labelInfo: LabelInfo,
  snapTime: Date
): InputUniquenessRecord {
  const promptHash = sha256(promptText);

  const imageHashes: Record<TimeframeId, string> = {
    '15m': '',
    '1h': '',
    '4h': '',
    '24h': '',
  };

  for (const [tfId, imageBytes] of Object.entries(images)) {
    imageHashes[tfId as TimeframeId] = sha256(imageBytes);
  }

  const labelData = JSON.stringify({
    refLowPrice: labelInfo.refLowPrice,
    candlesBack: labelInfo.candlesBack,
    forwardLowPrice: labelInfo.forwardLowPrice,
    label: labelInfo.label,
  });
  const labelHash = sha256(labelData);

  return {
    snapTime,
    promptHash,
    imageHashes,
    labelHash,
  };
}
