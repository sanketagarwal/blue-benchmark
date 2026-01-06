export {
  type SnapTimeCandidate,
  type SamplingConfig,
  type SamplingResult,
  DEFAULT_PROXIMITY_THRESHOLDS,
  DEFAULT_MIN_SEPARATION_MINUTES,
  createDefaultSamplingConfig,
  filterByProximity,
  enforceMinSeparation,
  sampleBalanced,
  selectSnapTimes,
  computeDistanceToRefLow,
  createSnapTimeCandidate,
} from './snap-time-sampling.js';
