import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

import { brierScore } from '../scorers/brier-scorer.js';
import { logLoss } from '../scorers/log-loss-scorer.js';
import { RANDOM_BASELINE } from '../scorers/phase-0-scorer.js';

import type { TimeframeId } from '../timeframe-config.js';

/**
 * Single audit record - one line per model per horizon per round
 */
export interface AuditRecord {
  /** ISO timestamp of prediction */
  timestamp: string;
  /** Round number (1-indexed) */
  roundNumber: number;
  /** Model identifier */
  modelId: string;
  /** Horizon being predicted */
  horizon: TimeframeId;

  // Prediction fields
  /** Probability of bottom (0-1) */
  prediction: number;
  /** Whether model predicts bottom occurred */
  hasBottomed: boolean;
  /** Model's confidence in prediction */
  confidence: number;
  /** Optional: candles back to claimed bottom */
  candlesBack?: number;

  // Ground truth fields
  /** Actual label (did bottom occur?) */
  label: boolean;
  /** ISO timestamp of first pivot (if any) */
  firstPivotAt?: string;
  /** Time-to-pivot ratio (0-1, if pivot exists) */
  timeToPivotRatio?: number;

  // Score fields
  /** Log loss for this prediction */
  logLoss: number;
  /** Brier score for this prediction */
  brier: number;

  // Baseline comparisons (computed from observed label)
  /** Log loss for random baseline (always 0.5 prediction) */
  baselineRandom: number;
  /** Log loss for trivial baseline (always predict label's base rate) */
  baselineTrivial: number;
  /** Model log loss minus random baseline (negative = better than random) */
  deltaVsRandom: number;
  /** Model log loss minus trivial baseline (negative = better than trivial) */
  deltaVsTrivial: number;
}

const AUDIT_FILE = 'benchmark-audit.jsonl';

/**
 * Initialize audit file (creates empty file, does NOT truncate existing)
 * Call at benchmark start to ensure file exists
 *
 * @param outputPath - Optional custom path (defaults to cwd/benchmark-audit.jsonl)
 */
export function initAuditFile(outputPath?: string): void {
  const filePath = outputPath ?? join(process.cwd(), AUDIT_FILE);
  // Create file if it doesn't exist, but don't truncate
  // We use 'a' flag to append, then immediately close
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from constant or parameter
  appendFileSync(filePath, '', 'utf8');
}

/**
 * Write a single audit record as a JSON line
 *
 * @param record - Audit record to write
 * @param outputPath - Optional custom path (defaults to cwd/benchmark-audit.jsonl)
 */
export function writeAuditRecord(record: AuditRecord, outputPath?: string): void {
  const filePath = outputPath ?? join(process.cwd(), AUDIT_FILE);
  const line = JSON.stringify(record) + '\n';
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from constant or parameter
  appendFileSync(filePath, line, 'utf8');
}

/**
 * Get the default audit file path
 *
 * @returns Absolute path to audit file
 */
export function getAuditFilePath(): string {
  return join(process.cwd(), AUDIT_FILE);
}

/**
 * Parameters for building an audit record
 */
export interface BuildAuditRecordParams {
  timestamp: Date;
  roundNumber: number;
  modelId: string;
  horizon: TimeframeId;
  /** Model's prediction object for this horizon */
  prediction: {
    hasBottomed: boolean;
    confidence: number;
    candlesBack?: number | undefined;
  };
  /** Ground truth for this horizon */
  groundTruth: {
    label: boolean;
    firstPivotAt?: Date | undefined;
    timeToPivotRatio?: number | undefined;
  };
  /** Base rate of positive labels observed so far (for trivial baseline) */
  labelBaseRate: number;
}

/**
 * Convert prediction to probability of bottom occurring
 *
 * @param pred - Prediction object
 * @param pred.hasBottomed - Whether model predicts bottom occurred
 * @param pred.confidence - Model's confidence in its prediction (0-1)
 * @returns Probability (0-1)
 */
function predictionToProbability(pred: { hasBottomed: boolean; confidence: number }): number {
  return pred.hasBottomed ? pred.confidence : (1 - pred.confidence);
}

/**
 * Build an audit record from benchmark data
 *
 * @param params - Parameters containing prediction and ground truth
 * @returns Complete audit record ready for writing
 */
export function buildAuditRecord(params: BuildAuditRecordParams): AuditRecord {
  const { timestamp, roundNumber, modelId, horizon, prediction, groundTruth, labelBaseRate } = params;

  const prob = predictionToProbability(prediction);
  const ll = logLoss(prob, groundTruth.label);
  const brier = brierScore(prob, groundTruth.label);

  // Baselines
  const baselineRandom = RANDOM_BASELINE; // log(2) = 0.693
  const baselineTrivial = logLoss(labelBaseRate, groundTruth.label);

  const record: AuditRecord = {
    timestamp: timestamp.toISOString(),
    roundNumber,
    modelId,
    horizon,
    prediction: prob,
    hasBottomed: prediction.hasBottomed,
    confidence: prediction.confidence,
    label: groundTruth.label,
    logLoss: ll,
    brier,
    baselineRandom,
    baselineTrivial,
    deltaVsRandom: ll - baselineRandom,
    deltaVsTrivial: ll - baselineTrivial,
  };

  // Add optional fields only if defined
  if (prediction.candlesBack !== undefined) {
    record.candlesBack = prediction.candlesBack;
  }
  if (groundTruth.firstPivotAt !== undefined) {
    record.firstPivotAt = groundTruth.firstPivotAt.toISOString();
  }
  if (groundTruth.timeToPivotRatio !== undefined) {
    record.timeToPivotRatio = groundTruth.timeToPivotRatio;
  }

  return record;
}
