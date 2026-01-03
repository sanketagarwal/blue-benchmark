import { getTimeframeDurationMs } from '../timeframe-config.js';

import type { RoundScore } from '../state/model-state.js';
import type { TimeframeId } from '../timeframe-config.js';

export interface TimingMetrics {
  /** Whether actual timing data exists for this horizon */
  hasTimingData: boolean;
  /** Number of correct predictions (true positives) used for timing calculation */
  correctPredictionCount: number;
  /** Earliest correct prediction time relative to pivot (ms) - undefined only when hasTimingData=false */
  earliestCorrectPredictionMs: number | undefined;
  /** Mean detection time as ratio of horizon duration (0-1) - only meaningful when hasTimingData=true */
  meanTimeToDetectionRatio: number | undefined;
  /** Count of correct predictions after first correct */
  redundantConfirmations: number;
}

export interface TrackBMetrics {
  byHorizon: Record<TimeframeId, TimingMetrics>;
  /** Whether ANY horizon has timing data */
  hasAnyTimingData: boolean;
}

const HORIZONS: TimeframeId[] = ['15m', '1h', '4h', '24h'];

/**
 * Validate timing fields for a round (no-op with no-new-low ground truth)
 *
 * With the no-new-low ground truth system, timing data (timeToPivotRatio) is not
 * populated because we no longer track pivot points. Track B metrics will simply
 * return hasTimingData: false when timing data is unavailable.
 *
 * @param _round - Round score (unused)
 * @param _horizon - Horizon (unused)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- function signature preserved for future use
function validateTimingFields(_round: RoundScore, _horizon: TimeframeId): void {
  // No-op: with no-new-low ground truth, timing data is not populated.
  // Track B metrics will return hasTimingData: false when no timing data exists.
}

/**
 * Filter rounds to those with correct predictions for a horizon
 * @param rounds - All round scores
 * @param horizon - The horizon to check
 * @returns Rounds where label=true AND prediction>0.5
 */
function getCorrectRounds(rounds: RoundScore[], horizon: TimeframeId): RoundScore[] {
  return rounds.filter(r => {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const hasLabel = r.labels?.[horizon] !== undefined;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const labelTrue = r.labels?.[horizon] === true;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const predictionCorrect = (r.predictions?.[horizon] ?? 0) > 0.5;
    return hasLabel && labelTrue && predictionCorrect;
  });
}

/**
 * Compute timing metrics for a single horizon
 * @param rounds - All round scores
 * @param horizon - The horizon to compute metrics for
 * @returns Timing metrics for the horizon
 */
function computeHorizonTimingMetrics(rounds: RoundScore[], horizon: TimeframeId): TimingMetrics {
  const horizonDuration = getTimeframeDurationMs(horizon);
  const correctRounds = getCorrectRounds(rounds, horizon);

  // Validate timing fields for correct rounds (will throw if data is incomplete)
  for (const round of correctRounds) {
    validateTimingFields(round, horizon);
  }

  // Get time-to-pivot ratios for correct predictions
  const timeToPivotRatios = correctRounds
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    .map(r => r.timeToPivotRatio?.[horizon])
    .filter((v): v is number => v !== undefined);

  const hasTimingData = timeToPivotRatios.length > 0;

  // Earliest correct prediction (only computed when we have data)
  const earliestRatio = hasTimingData ? Math.min(...timeToPivotRatios) : undefined;
  const earliestCorrectPredictionMs = earliestRatio === undefined
    ? undefined
    : earliestRatio * horizonDuration;

  // Mean detection time - undefined when no data (NOT defaulting to 1)
  const meanTimeToDetectionRatio = hasTimingData
    ? timeToPivotRatios.reduce((a, b) => a + b, 0) / timeToPivotRatios.length
    : undefined;

  return {
    hasTimingData,
    correctPredictionCount: correctRounds.length,
    earliestCorrectPredictionMs,
    meanTimeToDetectionRatio,
    redundantConfirmations: Math.max(0, correctRounds.length - 1),
  };
}

/**
 * Compute Track B timing metrics for a model
 * These metrics are for analysis only, NOT for elimination
 *
 * @param rounds - Array of round scores containing predictions and labels
 * @returns Track B metrics per horizon with hasTimingData indicator
 */
export function computeTrackBMetrics(rounds: RoundScore[]): TrackBMetrics {
  const byHorizon: Record<TimeframeId, TimingMetrics> = {} as Record<TimeframeId, TimingMetrics>;
  let hasAnyTimingData = false;

  for (const horizon of HORIZONS) {
    const metrics = computeHorizonTimingMetrics(rounds, horizon);
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    byHorizon[horizon] = metrics;
    if (metrics.hasTimingData) {
      hasAnyTimingData = true;
    }
  }

  return { byHorizon, hasAnyTimingData };
}
