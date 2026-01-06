/**
 * Golden B3 Tests: Metric registry completeness per round
 *
 * These tests verify metric completeness:
 * - Log loss and brier are always present per prediction per horizon
 * - Timing fields presence when timing metrics are enabled
 */
import { describe, expect, it } from 'vitest';

import {
  scorePhase0Round,
  type Phase0RoundScore,
} from '../src/scorers/phase-0-scorer.js';

import type { TimeframeId } from '../src/timeframe-config.js';
import type { BottomContractId } from '../src/bottom-caller.js';
import type { RoundScore } from '../src/state/model-state.js';

// ============================================================================
// Helper constants and functions
// ============================================================================

const HORIZONS: TimeframeId[] = ['15m', '1h', '4h', '24h'];

/**
 * Create a Phase0RoundScore fixture with all required fields
 */
function createPhase0RoundScore(
  horizonData: Record<TimeframeId, { logLoss: number; brier: number; prediction: number; extremeError: boolean }>
): Phase0RoundScore {
  const logLossByHorizon: Record<TimeframeId, number> = {} as Record<TimeframeId, number>;
  const brierByHorizon: Record<TimeframeId, number> = {} as Record<TimeframeId, number>;
  const predictions: Record<TimeframeId, number> = {} as Record<TimeframeId, number>;
  const extremeErrors: Record<TimeframeId, boolean> = {} as Record<TimeframeId, boolean>;

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const data = horizonData[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    logLossByHorizon[horizon] = data.logLoss;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    brierByHorizon[horizon] = data.brier;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    predictions[horizon] = data.prediction;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    extremeErrors[horizon] = data.extremeError;
  }

  return {
    logLossByHorizon,
    brierByHorizon,
    predictions,
    extremeErrors,
  };
}

/**
 * Create a RoundScore fixture with timing data
 */
function createRoundScoreWithTiming(
  roundNumber: number,
  horizonData: Record<TimeframeId, {
    prediction: number;
    label: boolean;
    timeToPivotRatio?: number;
    firstPivotAt?: Date;
  }>
): RoundScore {
  const predictions: Record<TimeframeId, number> = {} as Record<TimeframeId, number>;
  const labels: Record<TimeframeId, boolean> = {} as Record<TimeframeId, boolean>;
  const timeToPivotRatio: Record<TimeframeId, number | undefined> = {} as Record<TimeframeId, number | undefined>;
  const firstPivotAt: Record<TimeframeId, Date | undefined> = {} as Record<TimeframeId, Date | undefined>;

  let totalLogLoss = 0;
  const logLossByHorizon: Record<TimeframeId, number> = {} as Record<TimeframeId, number>;

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    const data = horizonData[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    predictions[horizon] = data.prediction;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    labels[horizon] = data.label;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    timeToPivotRatio[horizon] = data.timeToPivotRatio;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    firstPivotAt[horizon] = data.firstPivotAt;

    // Compute log loss for this horizon
    const p = Math.max(1e-15, Math.min(1 - 1e-15, data.prediction));
    const y = data.label ? 1 : 0;
    const ll = -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
    logLossByHorizon[horizon] = ll;
    totalLogLoss += ll;
  }

  return {
    roundNumber,
    logLoss: totalLogLoss / 4,
    logLossByHorizon,
    predictions,
    labels,
    timeToPivotRatio,
    firstPivotAt,
  };
}

/**
 * Validate that timing fields are present when required
 * Throws if label=true but timeToPivotRatio is missing
 */
function validateTimingFields(round: RoundScore, horizon: TimeframeId): void {
  // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
  const label = round.labels?.[horizon];
  // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
  const timeToPivotRatio = round.timeToPivotRatio?.[horizon];

  if (label === true && timeToPivotRatio === undefined) {
    throw new Error(
      `Track B timing validation failed for ${horizon}: ` +
      `label=true but timeToPivotRatio is undefined. ` +
      `Round ${String(round.roundNumber)} has incomplete timing data.`
    );
  }
}

// ============================================================================
// Golden B3: Metric registry completeness per round
// ============================================================================

describe('Golden B3: Metric registry completeness', () => {
  it('log loss and brier are always present per prediction per horizon', () => {
    // Setup: Create predictions and labels for all 4 horizons
    const predictions: Record<BottomContractId, number> = {
      'bottom-15m': 0.8,
      'bottom-1h': 0.6,
      'bottom-4h': 0.4,
      'bottom-24h': 0.3,
    };
    const labels: Record<TimeframeId, boolean> = {
      '15m': true,
      '1h': false,
      '4h': true,
      '24h': false,
    };

    // Score the round
    const roundScore = scorePhase0Round(predictions, labels);

    // All 4 horizons must have logLossByHorizon and brierByHorizon
    for (const horizon of HORIZONS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(roundScore.logLossByHorizon[horizon]).toBeDefined();
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(typeof roundScore.logLossByHorizon[horizon]).toBe('number');
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(Number.isNaN(roundScore.logLossByHorizon[horizon])).toBe(false);

      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(roundScore.brierByHorizon[horizon]).toBeDefined();
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(typeof roundScore.brierByHorizon[horizon]).toBe('number');
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(Number.isNaN(roundScore.brierByHorizon[horizon])).toBe(false);
    }
  });

  it('timing fields present when timing metrics enabled', () => {
    // Setup: RoundScore with timing data
    const pivotTime = new Date('2025-01-01T00:05:00Z');
    const round = createRoundScoreWithTiming(1, {
      '15m': { prediction: 0.8, label: true, timeToPivotRatio: 0.3, firstPivotAt: pivotTime },
      '1h': { prediction: 0.6, label: true, timeToPivotRatio: 0.5, firstPivotAt: pivotTime },
      '4h': { prediction: 0.4, label: false },
      '24h': { prediction: 0.3, label: false },
    });

    // Must have: timeToPivotRatio per horizon when label=true
    for (const horizon of HORIZONS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      const label = round.labels?.[horizon];
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      const ratio = round.timeToPivotRatio?.[horizon];

      if (label === true) {
        expect(ratio).toBeDefined();
        expect(typeof ratio).toBe('number');
      }
    }
  });

  it('fails loudly if timing fields missing on correct prediction', () => {
    // Setup: label=true but no timeToPivotRatio
    const round = createRoundScoreWithTiming(1, {
      '15m': { prediction: 0.8, label: true }, // Missing timeToPivotRatio when label=true
      '1h': { prediction: 0.6, label: false },
      '4h': { prediction: 0.4, label: false },
      '24h': { prediction: 0.3, label: false },
    });

    // validateTimingFields should throw when label=true but timeToPivotRatio missing
    expect(() => validateTimingFields(round, '15m')).toThrow(
      'Track B timing validation failed for 15m'
    );
  });

  it('validates timing fields pass when label=false regardless of timeToPivotRatio', () => {
    // Setup: label=false, no timeToPivotRatio needed
    const round = createRoundScoreWithTiming(1, {
      '15m': { prediction: 0.2, label: false },
      '1h': { prediction: 0.3, label: false },
      '4h': { prediction: 0.4, label: false },
      '24h': { prediction: 0.5, label: false },
    });

    // validateTimingFields should NOT throw when label=false
    for (const horizon of HORIZONS) {
      expect(() => validateTimingFields(round, horizon)).not.toThrow();
    }
  });

  it('Phase0RoundScore has all metric fields defined for each horizon', () => {
    // Create a complete Phase0RoundScore
    const roundScore = createPhase0RoundScore({
      '15m': { logLoss: 0.2, brier: 0.1, prediction: 0.8, extremeError: false },
      '1h': { logLoss: 0.3, brier: 0.15, prediction: 0.7, extremeError: false },
      '4h': { logLoss: 0.4, brier: 0.2, prediction: 0.6, extremeError: false },
      '24h': { logLoss: 0.5, brier: 0.25, prediction: 0.5, extremeError: false },
    });

    // Verify all fields are present and valid numbers
    for (const horizon of HORIZONS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(roundScore.logLossByHorizon[horizon]).toBeDefined();
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(Number.isFinite(roundScore.logLossByHorizon[horizon])).toBe(true);

      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(roundScore.brierByHorizon[horizon]).toBeDefined();
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(Number.isFinite(roundScore.brierByHorizon[horizon])).toBe(true);

      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(roundScore.predictions[horizon]).toBeDefined();
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(Number.isFinite(roundScore.predictions[horizon])).toBe(true);

      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(roundScore.extremeErrors[horizon]).toBeDefined();
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed array
      expect(typeof roundScore.extremeErrors[horizon]).toBe('boolean');
    }
  });
});
