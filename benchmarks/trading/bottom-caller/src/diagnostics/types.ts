/**
 * Diagnostics types for benchmark hardening instrumentation
 */

import type { TimeframeId } from '../timeframe-config.js';

/**
 * Dataset diagnostics for a single prediction horizon
 */
export interface HorizonDatasetDiagnostics {
  /** Total examples scored for this horizon */
  n: number;
  /** Count of true labels (noNewLow = true) */
  countTrue: number;
  /** Count of false labels (noNewLow = false) */
  countFalse: number;
  /** Prevalence of true labels: countTrue / n */
  pTrue: number;
  /** Baseline log loss at p=0.5 (random) */
  baselineRandomLL: number;
  /** Baseline log loss at p=pTrue (prevalence predictor) */
  baselinePrevalenceLL: number;
}

/**
 * Prediction diversity diagnostics for a single model and horizon
 */
export interface PredictionDiversityDiagnostics {
  /** Number of unique probability values emitted */
  uniquePCount: number;
  /** Minimum probability predicted */
  pMin: number;
  /** Maximum probability predicted */
  pMax: number;
  /** Standard deviation of probabilities */
  pStdDev: number;
  /** Standard deviation of confidence values */
  confidenceStdDev: number;
  /** Rate of noNewLow=true predictions */
  noNewLowTrueRate: number;
}

/**
 * Parse and fallback diagnostics for a single model
 */
export interface ParseDiagnostics {
  /** Successful parses */
  parseSuccessCount: number;
  /** Failed parses (malformed output) */
  parseFailCount: number;
  /** Schema validation failures */
  schemaFailCount: number;
  /** Missing horizon predictions */
  missingHorizonCount: number;
  /** Round numbers that failed */
  failedRounds: number[];
}

/**
 * Input uniqueness record for a single example
 */
export interface InputUniquenessRecord {
  /** Prediction timestamp */
  snapTime: Date;
  /** Hash of exact prompt text (SHA-256) */
  promptHash: string;
  /** Hash of PNG bytes for each horizon image */
  imageHashes: Record<TimeframeId, string>;
  /** Hash combining refLowPrice, candlesBack, forwardLowPrice, label */
  labelHash: string;
}

/**
 * Label information for hashing
 */
export interface LabelInfo {
  refLowPrice: number;
  candlesBack: number;
  forwardLowPrice: number;
  label: boolean;
}

/**
 * Aggregate diagnostics for an entire benchmark run
 */
export interface RunDiagnostics {
  /** Dataset diagnostics per horizon */
  datasetByHorizon: Record<TimeframeId, HorizonDatasetDiagnostics>;
  /** Prediction diversity per model per horizon */
  diversityByModel: Map<string, Record<TimeframeId, PredictionDiversityDiagnostics>>;
  /** Parse diagnostics per model */
  parseByModel: Map<string, ParseDiagnostics>;
  /** Input uniqueness for each scored example */
  inputRecords: InputUniquenessRecord[];
}
