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
  /** Mean probability */
  pMean: number;
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
  /** Breakdown by failure type */
  failuresByType: {
    /** Network/provider error */
    transport: number;
    /** Request timed out */
    timeout: number;
    /** JSON parse failed */
    parse: number;
    /** Schema validation failed */
    schema: number;
  };
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
  /** Count of labels with missing forward data per horizon */
  missingForwardDataCount: Record<TimeframeId, number>;
}

/**
 * Record of a single scored datapoint with all fields needed for exact re-scoring
 */
export interface ScoredDatapointRecord {
  /** Prediction timestamp */
  snapTime: Date;
  /** Prediction horizon */
  horizonId: TimeframeId;
  /** Candles back to reference low in lookback window */
  refLowCandlesBack: number;
  /** Reference low price in lookback window */
  refLowPrice: number;
  /** Lowest price in forward window */
  forwardLowPrice: number;
  /** Ground truth label: 1 if no new low, 0 otherwise */
  labelNoNewLow: 0 | 1;
  /** Model identifier */
  modelId: string;
  /** Raw text response from model */
  modelOutputRaw: string;
  /** Parsed prediction: whether model predicted no new low */
  predictionNoNewLow: boolean;
  /** Parsed prediction: model confidence (0-1) */
  predictionConfidence: number;
  /** Probability used for scoring after conversion */
  pUsedForScoring: number;
  /** Log loss for this prediction */
  logLoss: number;
  /** Brier score for this prediction */
  brierScore: number;
  /** SHA-256 hash of prompt text */
  promptHash: string;
  /** SHA-256 hash of chart image bytes for this horizon */
  imageHash: string;
}
