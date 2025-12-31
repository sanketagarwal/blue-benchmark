import { HORIZON_CONFIG } from '../horizon-config.js';

import type { Horizon } from '../horizon-config.js';
import type { RoundScore } from '../state/model-state.js';

export interface TimingMetrics {
  /** Earliest correct prediction time relative to pivot (ms) */
  earliestCorrectPredictionMs: number | undefined;
  /** Mean detection time as ratio of horizon duration (0-1) */
  meanTimeToDetectionRatio: number;
  /** Count of correct predictions after first correct */
  redundantConfirmations: number;
}

export interface TrackBMetrics {
  byHorizon: Record<Horizon, TimingMetrics>;
}

const HORIZONS: Horizon[] = ['15m', '1h', '24h', '7d'];

/**
 * Compute Track B timing metrics for a model
 * These metrics are for analysis only, NOT for elimination
 *
 * @param rounds - Array of round scores containing predictions and labels
 * @returns Track B metrics per horizon
 */
export function computeTrackBMetrics(rounds: RoundScore[]): TrackBMetrics {
  const byHorizon: Record<Horizon, TimingMetrics> = {} as Record<Horizon, TimingMetrics>;

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const horizonDuration = HORIZON_CONFIG[horizon].duration;

    // Find rounds with ground truth for this horizon
    const horizonRounds = rounds.filter(r => {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      return r.labels?.[horizon] !== undefined;
    });

    // Find correct predictions (label=true, prediction confidence > 0.5)
    const correctRounds = horizonRounds.filter(r =>
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      r.labels?.[horizon] === true &&
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      (r.predictions?.[horizon] ?? 0) > 0.5
    );

    // Get time-to-pivot ratios for correct predictions
    const timeToPivotRatios = correctRounds
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      .map(r => r.timeToPivotRatio?.[horizon])
      .filter((v): v is number => v !== undefined);

    // Earliest correct prediction
    const earliestRatio = timeToPivotRatios.length > 0
      ? Math.min(...timeToPivotRatios)
      : undefined;

    const earliestCorrectPredictionMs = earliestRatio === undefined
      ? undefined
      : earliestRatio * horizonDuration;

    // Mean detection time (default to 1 = late if no correct predictions)
    const meanTimeToDetectionRatio = timeToPivotRatios.length > 0
      ? timeToPivotRatios.reduce((a, b) => a + b, 0) / timeToPivotRatios.length
      : 1;

    // Redundant confirmations: correct predictions after the first
    const redundantConfirmations = Math.max(0, correctRounds.length - 1);

    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    byHorizon[horizon] = {
      earliestCorrectPredictionMs,
      meanTimeToDetectionRatio,
      redundantConfirmations,
    };
  }

  return { byHorizon };
}
