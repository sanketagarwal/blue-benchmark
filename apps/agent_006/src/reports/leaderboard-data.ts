/**
 * Leaderboard data building utilities
 *
 * Extracts and transforms model state data for leaderboard generation.
 * This module handles the data preparation layer between raw benchmark
 * state and the leaderboard rendering.
 */
import { brierScore } from '../scorers/brier-scorer.js';

import type { RoundScore } from '../state/model-state.js';
import type { TimeframeId } from '../timeframe-config.js';
import type { ModelScoreData } from './leaderboards.js';

/**
 * HORIZONS constant - the four timeframe horizons used throughout the benchmark
 */
export const HORIZONS: readonly TimeframeId[] = ['15m', '1h', '4h', '24h'] as const;

/**
 * Extended model score data with qualification status
 */
export interface ModelScoreDataWithQualification extends ModelScoreData {
  isQualified: boolean;
}

/**
 * Model state input for leaderboard data building.
 * This is a subset of the full ModelState interface, containing
 * only the fields needed for leaderboard generation.
 */
export interface LeaderboardModelState {
  modelId: string;
  /** Whether the model was eliminated from the tournament */
  eliminated: boolean;
  /** Full round data for Track B timing metrics */
  trackBRounds: RoundScore[];
  /** Accumulated log losses per horizon */
  logLossByHorizon: Record<TimeframeId, number[]>;
  /** Horizons the model is qualified for */
  qualifiedHorizons: Set<TimeframeId>;
}

/**
 * Extract predictions and labels for a specific horizon from round data
 * @param trackBRounds - Array of round scores with per-horizon data
 * @param horizon - The timeframe to extract data for
 * @returns Object containing predictions and labels arrays
 */
export function extractHorizonPredictionsAndLabels(
  trackBRounds: RoundScore[],
  horizon: TimeframeId
): { predictions: number[]; labels: boolean[] } {
  const predictions: number[] = [];
  const labels: boolean[] = [];
  for (const round of trackBRounds) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const prediction = round.predictions?.[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const label = round.labels?.[horizon];
    if (prediction !== undefined && label !== undefined) {
      predictions.push(prediction);
      labels.push(label);
    }
  }
  return { predictions, labels };
}

/**
 * Calculate Brier scores from paired predictions and labels
 * @param predictionValues - Array of predicted probabilities
 * @param labelValues - Array of actual outcomes
 * @returns Array of Brier scores
 */
export function calculateBrierScores(predictionValues: number[], labelValues: boolean[]): number[] {
  const briers: number[] = [];
  for (const [index, prediction] of predictionValues.entries()) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, security/detect-object-injection -- index bounded by entries()
    const label = labelValues[index]!;
    briers.push(brierScore(prediction, label));
  }
  return briers;
}

/**
 * Build ModelScoreData maps for each horizon from model states.
 *
 * IMPORTANT: This function includes ALL models with data, regardless of
 * elimination status. This ensures leaderboards always show model performance
 * data even when all models have been eliminated during the tournament.
 *
 * The elimination status is a tournament mechanism - it should not prevent
 * historical performance data from being displayed in reports.
 *
 * @param modelStates - Map of model states
 * @returns Record of horizon to map of modelId to ModelScoreDataWithQualification
 */
export function buildLeaderboardScoreData(
  modelStates: Map<string, LeaderboardModelState>
): Record<TimeframeId, Map<string, ModelScoreDataWithQualification>> {
  const result: Record<TimeframeId, Map<string, ModelScoreDataWithQualification>> = {
    '15m': new Map(),
    '1h': new Map(),
    '4h': new Map(),
    '24h': new Map(),
  };

  // Include ALL models with data - do not filter by elimination status
  // Leaderboards should show all model performance regardless of tournament outcome
  for (const state of modelStates.values()) {
    for (const horizon of HORIZONS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      const logLosses = state.logLossByHorizon[horizon];
      if (logLosses.length === 0) {
        continue;
      }
      const { predictions, labels } = extractHorizonPredictionsAndLabels(state.trackBRounds, horizon);
      const briers = calculateBrierScores(predictions, labels);
      const isQualified = state.qualifiedHorizons.has(horizon);
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      result[horizon].set(state.modelId, { logLosses, briers, predictions, labels, isQualified });
    }
  }
  return result;
}

/**
 * Check if any models are qualified for a horizon
 * @param horizonScores - Map of model scores for a horizon
 * @returns Number of qualified models
 */
export function countQualifiedModels(horizonScores: Map<string, ModelScoreDataWithQualification>): number {
  let count = 0;
  for (const data of horizonScores.values()) {
    if (data.isQualified) {
      count++;
    }
  }
  return count;
}

/**
 * Convert extended score data to base format
 * @param horizonScores - Extended model score data
 * @returns Base model score data without isQualified field
 */
export function toBaseScoreData(
  horizonScores: Map<string, ModelScoreDataWithQualification>
): Map<string, ModelScoreData> {
  const baseData = new Map<string, ModelScoreData>();
  for (const [modelId, data] of horizonScores) {
    baseData.set(modelId, {
      logLosses: data.logLosses,
      briers: data.briers,
      predictions: data.predictions,
      labels: data.labels,
    });
  }
  return baseData;
}
