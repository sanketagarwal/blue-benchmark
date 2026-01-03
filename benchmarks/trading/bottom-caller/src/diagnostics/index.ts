/**
 * Diagnostics module for benchmark hardening instrumentation
 */

export type {
  HorizonDatasetDiagnostics,
  InputUniquenessRecord,
  LabelInfo,
  ParseDiagnostics,
  PredictionDiversityDiagnostics,
  RunDiagnostics,
} from './types.js';

export {
  computeHorizonDatasetDiagnostics,
  computePredictionDiversity,
  createHashFromInputs,
} from './compute.js';
