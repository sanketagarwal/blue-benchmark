/**
 * Golden Scenario E2E Test
 *
 * A deterministic end-to-end test that exercises the entire prediction pipeline
 * without calling any LLM or hitting Replay Lab.
 *
 * Uses synthetic candles, annotations, and model outputs with exact expected scores.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { logLoss } from '../src/scorers/log-loss-scorer.js';
import { brierScore } from '../src/scorers/brier-scorer.js';
import { filterPivotLows } from '../src/replay-lab/annotations.js';

import type { LocalExtremaAnnotation } from '../src/replay-lab/annotations.js';

// ============================================================================
// GOLDEN CONFIG
// ============================================================================

const GOLDEN_CONFIG = {
  chart: { barSizeMinutes: 5, rangeMinutes: 120 },
  task: { forwardWindowMinutes: 60 },
  groundTruth: {
    search: { slackCandles: 2, mode: 'claimed_minus_slack_to_close' as const },
    fractal: { L: 3 },
    zigzag: { deviationPct: 0.025 },
  },
} as const;

const SNAP_TIME = new Date('2025-12-31T15:00:00.000Z');
const CLOSES_AT = new Date('2025-12-31T16:00:00.000Z');
const PIVOT_TIME = new Date('2025-12-31T14:30:00.000Z');
const FRACTAL_AVAILABLE_AT = new Date('2025-12-31T14:45:00.000Z');
const ZIGZAG_AVAILABLE_AT = new Date('2025-12-31T14:30:00.000Z');

// ============================================================================
// SYNTHETIC CANDLES
// ============================================================================

interface OHLCV {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const PAST_CANDLES: OHLCV[] = [
  { timestamp: '2025-12-31T13:00:00.000Z', open: 110.0, high: 110.2, low: 109.8, close: 110.0, volume: 1000 },
  { timestamp: '2025-12-31T13:05:00.000Z', open: 110.0, high: 110.2, low: 109.6, close: 109.8, volume: 980 },
  { timestamp: '2025-12-31T13:10:00.000Z', open: 109.8, high: 110.0, low: 109.4, close: 109.6, volume: 970 },
  { timestamp: '2025-12-31T13:15:00.000Z', open: 109.6, high: 109.8, low: 109.2, close: 109.4, volume: 960 },
  { timestamp: '2025-12-31T13:20:00.000Z', open: 109.4, high: 109.6, low: 109.0, close: 109.2, volume: 950 },
  { timestamp: '2025-12-31T13:25:00.000Z', open: 109.2, high: 109.4, low: 108.8, close: 109.0, volume: 940 },
  { timestamp: '2025-12-31T13:30:00.000Z', open: 109.0, high: 109.2, low: 108.6, close: 108.8, volume: 930 },
  { timestamp: '2025-12-31T13:35:00.000Z', open: 108.8, high: 109.0, low: 108.4, close: 108.6, volume: 920 },
  { timestamp: '2025-12-31T13:40:00.000Z', open: 108.6, high: 108.8, low: 108.2, close: 108.4, volume: 910 },
  { timestamp: '2025-12-31T13:45:00.000Z', open: 108.4, high: 108.6, low: 108.0, close: 108.2, volume: 900 },
  { timestamp: '2025-12-31T13:50:00.000Z', open: 108.2, high: 108.4, low: 107.8, close: 108.0, volume: 890 },
  { timestamp: '2025-12-31T13:55:00.000Z', open: 108.0, high: 108.2, low: 107.6, close: 107.8, volume: 880 },
  { timestamp: '2025-12-31T14:00:00.000Z', open: 107.8, high: 108.0, low: 107.4, close: 107.6, volume: 870 },
  { timestamp: '2025-12-31T14:05:00.000Z', open: 107.6, high: 107.8, low: 107.2, close: 107.4, volume: 860 },
  { timestamp: '2025-12-31T14:10:00.000Z', open: 107.4, high: 107.6, low: 107.0, close: 107.2, volume: 850 },
  { timestamp: '2025-12-31T14:15:00.000Z', open: 107.2, high: 107.4, low: 106.8, close: 107.0, volume: 840 },
  { timestamp: '2025-12-31T14:20:00.000Z', open: 107.0, high: 107.2, low: 106.6, close: 106.8, volume: 830 },
  { timestamp: '2025-12-31T14:25:00.000Z', open: 106.8, high: 107.0, low: 106.4, close: 106.6, volume: 820 },
  // PIVOT LOW AT 14:30
  { timestamp: '2025-12-31T14:30:00.000Z', open: 106.6, high: 106.8, low: 94.5, close: 95.0, volume: 2000 },
  { timestamp: '2025-12-31T14:35:00.000Z', open: 95.0, high: 96.2, low: 94.8, close: 96.0, volume: 1800 },
  { timestamp: '2025-12-31T14:40:00.000Z', open: 96.0, high: 97.2, low: 95.8, close: 97.0, volume: 1600 },
  { timestamp: '2025-12-31T14:45:00.000Z', open: 97.0, high: 99.2, low: 96.8, close: 99.0, volume: 1500 },
  { timestamp: '2025-12-31T14:50:00.000Z', open: 99.0, high: 101.2, low: 98.8, close: 101.0, volume: 1400 },
  { timestamp: '2025-12-31T14:55:00.000Z', open: 101.0, high: 103.2, low: 100.8, close: 103.0, volume: 1300 },
  { timestamp: '2025-12-31T15:00:00.000Z', open: 103.0, high: 105.2, low: 102.8, close: 105.0, volume: 1200 },
];

const FORWARD_CANDLES: OHLCV[] = [
  { timestamp: '2025-12-31T15:05:00.000Z', open: 105.0, high: 105.6, low: 104.8, close: 105.4, volume: 900 },
  { timestamp: '2025-12-31T15:10:00.000Z', open: 105.4, high: 105.7, low: 104.9, close: 105.2, volume: 880 },
  { timestamp: '2025-12-31T15:15:00.000Z', open: 105.2, high: 105.5, low: 104.6, close: 105.0, volume: 870 },
  { timestamp: '2025-12-31T15:20:00.000Z', open: 105.0, high: 105.4, low: 104.7, close: 105.1, volume: 860 },
  { timestamp: '2025-12-31T15:25:00.000Z', open: 105.1, high: 105.6, low: 104.9, close: 105.5, volume: 850 },
  { timestamp: '2025-12-31T15:30:00.000Z', open: 105.5, high: 106.0, low: 105.2, close: 105.9, volume: 840 },
  { timestamp: '2025-12-31T15:35:00.000Z', open: 105.9, high: 106.2, low: 105.4, close: 105.7, volume: 830 },
  { timestamp: '2025-12-31T15:40:00.000Z', open: 105.7, high: 106.1, low: 105.3, close: 105.8, volume: 820 },
  { timestamp: '2025-12-31T15:45:00.000Z', open: 105.8, high: 106.4, low: 105.6, close: 106.2, volume: 810 },
  { timestamp: '2025-12-31T15:50:00.000Z', open: 106.2, high: 106.7, low: 106.0, close: 106.5, volume: 800 },
  { timestamp: '2025-12-31T15:55:00.000Z', open: 106.5, high: 106.9, low: 106.2, close: 106.8, volume: 790 },
  { timestamp: '2025-12-31T16:00:00.000Z', open: 106.8, high: 107.2, low: 106.6, close: 107.0, volume: 780 },
];

// ============================================================================
// SYNTHETIC ANNOTATIONS
// ============================================================================

const FRACTAL_ANNOTATION: LocalExtremaAnnotation = {
  id: '00000000-0000-0000-0000-000000000001',
  time_start: '2025-12-31T14:30:00.000Z',
  time_end: null,
  type: 'local_extrema',
  schema_version: 'golden-v1',
  payload: {
    direction: 'low',
  },
  source: 'golden-fixture',
};

const ZIGZAG_ANNOTATION: LocalExtremaAnnotation = {
  id: '00000000-0000-0000-0000-000000000002',
  time_start: '2025-12-31T14:30:00.000Z',
  time_end: null,
  type: 'local_extrema',
  schema_version: 'golden-v1',
  payload: {
    direction: 'low',
  },
  source: 'golden-fixture',
};

// ============================================================================
// EXPECTED SCORE VALUES
// ============================================================================

// With confidence=0.9:
const LN_0_9 = 0.10536051565782628; // -ln(0.9)
const LN_0_1 = 2.302585092994046; // -ln(0.1)
const BRIER_0_9_TRUE = 0.01; // (0.9 - 1)^2
const BRIER_0_1_TRUE = 0.81; // (0.1 - 1)^2
const BRIER_0_1_FALSE = 0.01; // (0.1 - 0)^2
const BRIER_0_9_FALSE = 0.81; // (0.9 - 0)^2

const EPSILON = 1e-9;

// ============================================================================
// SYNTHETIC MODEL OUTPUTS
// ============================================================================

interface HorizonPrediction {
  hasBottomed: boolean;
  confidence: number;
  candlesBack: number;
}

// Case 1: Bottom exists - good prediction
const PREDICTION_A: HorizonPrediction = { hasBottomed: true, confidence: 0.9, candlesBack: 6 };
// Case 1: Bottom exists - bad prediction
const PREDICTION_B: HorizonPrediction = { hasBottomed: false, confidence: 0.9, candlesBack: 0 };
// Case 2: No bottom - good prediction
const PREDICTION_C: HorizonPrediction = { hasBottomed: false, confidence: 0.9, candlesBack: 0 };
// Case 2: No bottom - bad prediction
const PREDICTION_D: HorizonPrediction = { hasBottomed: true, confidence: 0.9, candlesBack: 6 };

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert prediction to probability for scoring
 * If hasBottomed=true: p = confidence (probability of bottom)
 * If hasBottomed=false: p = 1 - confidence (probability of bottom is low)
 */
function predictionToProbability(prediction: HorizonPrediction): number {
  return prediction.hasBottomed ? prediction.confidence : (1 - prediction.confidence);
}

/**
 * Compute claimed time from prediction
 * claimedTime = snapTime - candlesBack * barSize
 */
function computeClaimedTime(
  snapTime: Date,
  candlesBack: number,
  barSizeMinutes: number
): Date {
  return new Date(snapTime.getTime() - candlesBack * barSizeMinutes * 60_000);
}

/**
 * Check if pivot is in search window
 * For claimed_minus_slack_to_close mode:
 * - searchStart = claimedTime - slackCandles * barSize
 * - searchEnd = closesAt
 */
function isPivotInSearchWindow(
  pivotTime: Date,
  claimedTime: Date,
  closesAt: Date,
  slackCandles: number,
  barSizeMinutes: number
): boolean {
  const slackMs = slackCandles * barSizeMinutes * 60_000;
  const searchStart = new Date(claimedTime.getTime() - slackMs);
  return pivotTime >= searchStart && pivotTime <= closesAt;
}

/**
 * Stub annotation fetch - returns annotation only if query includes pivot and availableAt is satisfied
 */
function stubAnnotationFetch(
  method: 'fractal' | 'zigzag',
  from: Date,
  to: Date,
  availableAt: Date,
  includePivot: boolean
): LocalExtremaAnnotation[] {
  if (!includePivot) {
    return [];
  }

  const annotation = method === 'fractal' ? FRACTAL_ANNOTATION : ZIGZAG_ANNOTATION;
  const annotationAvailableAt = method === 'fractal' ? FRACTAL_AVAILABLE_AT : ZIGZAG_AVAILABLE_AT;

  // Check if pivot is in query window
  if (PIVOT_TIME < from || PIVOT_TIME > to) {
    return [];
  }

  // Check if annotation is available by the requested time
  if (annotationAvailableAt > availableAt) {
    return [];
  }

  return [annotation];
}

// ============================================================================
// TESTS
// ============================================================================

describe('Golden Scenario E2E', () => {
  describe('Config validation', () => {
    it('should have correct config values', () => {
      expect(GOLDEN_CONFIG.chart.barSizeMinutes).toBe(5);
      expect(GOLDEN_CONFIG.chart.rangeMinutes).toBe(120);
      expect(GOLDEN_CONFIG.task.forwardWindowMinutes).toBe(60);
      expect(GOLDEN_CONFIG.groundTruth.search.slackCandles).toBe(2);
    });
  });

  describe('Candle fixtures', () => {
    it('should have 25 past candles (2h of 5m bars)', () => {
      expect(PAST_CANDLES).toHaveLength(25);
    });

    it('should have 12 forward candles (1h of 5m bars)', () => {
      expect(FORWARD_CANDLES).toHaveLength(12);
    });

    it('should have pivot low at 14:30', () => {
      const pivotCandle = PAST_CANDLES.find(c => c.timestamp === '2025-12-31T14:30:00.000Z');
      expect(pivotCandle).toBeDefined();
      expect(pivotCandle?.low).toBe(94.5);
    });

    it('should have rightmost candle at snapTime (15:00)', () => {
      const lastCandle = PAST_CANDLES[PAST_CANDLES.length - 1];
      expect(lastCandle?.timestamp).toBe('2025-12-31T15:00:00.000Z');
    });

    it('should compute correct drawdown in forward window', () => {
      const closingPrice = 105.0;
      const lowestLow = Math.min(...FORWARD_CANDLES.map(c => c.low));
      const drawdown = (closingPrice - lowestLow) / closingPrice;
      expect(lowestLow).toBe(104.6);
      expect(drawdown).toBeCloseTo(0.00381, 4); // 0.381%
    });
  });

  describe('Claimed time computation', () => {
    it('should compute claimedTime = snapTime - candlesBack * barSize', () => {
      // Prediction A: candlesBack = 6
      const claimedTime = computeClaimedTime(SNAP_TIME, 6, GOLDEN_CONFIG.chart.barSizeMinutes);
      expect(claimedTime.toISOString()).toBe('2025-12-31T14:30:00.000Z');
    });

    it('should compute candlesBack = 0 as snapTime', () => {
      const claimedTime = computeClaimedTime(SNAP_TIME, 0, GOLDEN_CONFIG.chart.barSizeMinutes);
      expect(claimedTime.toISOString()).toBe('2025-12-31T15:00:00.000Z');
    });
  });

  describe('Search window validation', () => {
    it('should include pivot when candlesBack=6 with slack=2', () => {
      // claimedTime = 14:30
      // searchStart = 14:30 - 2*5min = 14:20
      // searchEnd = 16:00
      // pivotTime = 14:30 is in [14:20, 16:00]
      const claimedTime = computeClaimedTime(SNAP_TIME, 6, GOLDEN_CONFIG.chart.barSizeMinutes);
      const inWindow = isPivotInSearchWindow(
        PIVOT_TIME,
        claimedTime,
        CLOSES_AT,
        GOLDEN_CONFIG.groundTruth.search.slackCandles,
        GOLDEN_CONFIG.chart.barSizeMinutes
      );
      expect(inWindow).toBe(true);
    });

    it('should exclude pivot when candlesBack=0 with slack=2', () => {
      // claimedTime = 15:00
      // searchStart = 15:00 - 2*5min = 14:50
      // searchEnd = 16:00
      // pivotTime = 14:30 is NOT in [14:50, 16:00]
      const claimedTime = computeClaimedTime(SNAP_TIME, 0, GOLDEN_CONFIG.chart.barSizeMinutes);
      const inWindow = isPivotInSearchWindow(
        PIVOT_TIME,
        claimedTime,
        CLOSES_AT,
        GOLDEN_CONFIG.groundTruth.search.slackCandles,
        GOLDEN_CONFIG.chart.barSizeMinutes
      );
      expect(inWindow).toBe(false);
    });
  });

  describe('Annotation stub behavior', () => {
    it('should return fractal annotation when pivot is in window and available', () => {
      const from = new Date('2025-12-31T14:20:00.000Z');
      const to = CLOSES_AT;
      const annotations = stubAnnotationFetch('fractal', from, to, CLOSES_AT, true);
      expect(annotations).toHaveLength(1);
      expect(annotations[0]?.id).toBe(FRACTAL_ANNOTATION.id);
    });

    it('should return zigzag annotation when pivot is in window and available', () => {
      const from = new Date('2025-12-31T14:20:00.000Z');
      const to = CLOSES_AT;
      const annotations = stubAnnotationFetch('zigzag', from, to, CLOSES_AT, true);
      expect(annotations).toHaveLength(1);
      expect(annotations[0]?.id).toBe(ZIGZAG_ANNOTATION.id);
    });

    it('should return empty when pivot is not in window', () => {
      const from = new Date('2025-12-31T14:50:00.000Z');
      const to = CLOSES_AT;
      const annotations = stubAnnotationFetch('fractal', from, to, CLOSES_AT, true);
      expect(annotations).toHaveLength(0);
    });

    it('should return empty when includePivot is false', () => {
      const from = new Date('2025-12-31T14:20:00.000Z');
      const to = CLOSES_AT;
      const annotations = stubAnnotationFetch('fractal', from, to, CLOSES_AT, false);
      expect(annotations).toHaveLength(0);
    });

    it('should return empty when availableAt is before annotation availability', () => {
      const from = new Date('2025-12-31T14:20:00.000Z');
      const to = CLOSES_AT;
      // Fractal is available at 14:45, so querying at 14:40 should return empty
      const earlyAvailableAt = new Date('2025-12-31T14:40:00.000Z');
      const annotations = stubAnnotationFetch('fractal', from, to, earlyAvailableAt, true);
      expect(annotations).toHaveLength(0);
    });
  });

  describe('filterPivotLows', () => {
    it('should filter to only LOW direction annotations', () => {
      const highAnnotation: LocalExtremaAnnotation = {
        ...FRACTAL_ANNOTATION,
        id: 'high-1',
        payload: { direction: 'high' },
      };
      const mixed = [FRACTAL_ANNOTATION, highAnnotation, ZIGZAG_ANNOTATION];
      const lows = filterPivotLows(mixed);
      expect(lows).toHaveLength(2);
      expect(lows.every(a => a.payload.direction === 'low')).toBe(true);
    });
  });

  describe('Prediction to probability conversion', () => {
    it('should return confidence when hasBottomed=true', () => {
      expect(predictionToProbability(PREDICTION_A)).toBe(0.9);
    });

    it('should return 1-confidence when hasBottomed=false', () => {
      expect(predictionToProbability(PREDICTION_B)).toBeCloseTo(0.1, 9);
    });
  });

  describe('Log Loss scoring', () => {
    describe('Case 1: actualBottomed = true', () => {
      const actual = true;

      it('Prediction A (hasBottomed=true, conf=0.9): loss = -ln(0.9)', () => {
        const p = predictionToProbability(PREDICTION_A); // 0.9
        const loss = logLoss(p, actual);
        expect(loss).toBeCloseTo(LN_0_9, 9);
      });

      it('Prediction B (hasBottomed=false, conf=0.9): loss = -ln(0.1)', () => {
        const p = predictionToProbability(PREDICTION_B); // 0.1
        const loss = logLoss(p, actual);
        expect(loss).toBeCloseTo(LN_0_1, 9);
      });
    });

    describe('Case 2: actualBottomed = false', () => {
      const actual = false;

      it('Prediction C (hasBottomed=false, conf=0.9): loss = -ln(0.9)', () => {
        const p = predictionToProbability(PREDICTION_C); // 0.1
        const loss = logLoss(p, actual);
        expect(loss).toBeCloseTo(LN_0_9, 9);
      });

      it('Prediction D (hasBottomed=true, conf=0.9): loss = -ln(0.1)', () => {
        const p = predictionToProbability(PREDICTION_D); // 0.9
        const loss = logLoss(p, actual);
        expect(loss).toBeCloseTo(LN_0_1, 9);
      });
    });
  });

  describe('Brier scoring', () => {
    describe('Case 1: actualBottomed = true', () => {
      const actual = true;

      it('Prediction A (p=0.9): brier = 0.01', () => {
        const p = predictionToProbability(PREDICTION_A); // 0.9
        const score = brierScore(p, actual);
        expect(score).toBeCloseTo(BRIER_0_9_TRUE, 9);
      });

      it('Prediction B (p=0.1): brier = 0.81', () => {
        const p = predictionToProbability(PREDICTION_B); // 0.1
        const score = brierScore(p, actual);
        expect(score).toBeCloseTo(BRIER_0_1_TRUE, 9);
      });
    });

    describe('Case 2: actualBottomed = false', () => {
      const actual = false;

      it('Prediction C (p=0.1): brier = 0.01', () => {
        const p = predictionToProbability(PREDICTION_C); // 0.1
        const score = brierScore(p, actual);
        expect(score).toBeCloseTo(BRIER_0_1_FALSE, 9);
      });

      it('Prediction D (p=0.9): brier = 0.81', () => {
        const p = predictionToProbability(PREDICTION_D); // 0.9
        const score = brierScore(p, actual);
        expect(score).toBeCloseTo(BRIER_0_9_FALSE, 9);
      });
    });
  });

  describe('Timing error computation', () => {
    it('should have timingError = 0 when prediction matches actual pivot', () => {
      // Prediction A claims candlesBack=6, which is 14:30
      // Actual pivot is at 14:30
      // timingError = |6 - 6| = 0
      const predictedCandlesBack = PREDICTION_A.candlesBack;
      const actualCandlesBack = 6; // Pivot at 14:30 = snapTime - 6*5min
      const timingError = Math.abs(predictedCandlesBack - actualCandlesBack);
      expect(timingError).toBe(0);
    });

    it('should compute correct timing error when prediction is off', () => {
      // If prediction claims candlesBack=4 (14:40), but actual is 6 (14:30)
      // timingError = |4 - 6| = 2
      const predictedCandlesBack = 4;
      const actualCandlesBack = 6;
      const timingError = Math.abs(predictedCandlesBack - actualCandlesBack);
      expect(timingError).toBe(2);
    });
  });

  describe('Full E2E scoring pipeline', () => {
    interface ScoringResult {
      label: boolean;
      logLoss: number;
      brierScore: number;
      claimedTime: Date;
      timingError: number | null;
    }

    /**
     * Full scoring pipeline for a single prediction
     */
    function scorePrediction(
      prediction: HorizonPrediction,
      actualBottomed: boolean,
      actualCandlesBack: number | null
    ): ScoringResult {
      const claimedTime = computeClaimedTime(
        SNAP_TIME,
        prediction.candlesBack,
        GOLDEN_CONFIG.chart.barSizeMinutes
      );

      const p = predictionToProbability(prediction);
      const ll = logLoss(p, actualBottomed);
      const bs = brierScore(p, actualBottomed);

      const timingError =
        prediction.hasBottomed && actualBottomed && actualCandlesBack !== null
          ? Math.abs(prediction.candlesBack - actualCandlesBack)
          : null;

      return {
        label: actualBottomed,
        logLoss: ll,
        brierScore: bs,
        claimedTime,
        timingError,
      };
    }

    describe('Case 1: Bottom exists (actualBottomed = true)', () => {
      const actualBottomed = true;
      const actualCandlesBack = 6; // Pivot at 14:30

      it('Prediction A (good): exact values', () => {
        const result = scorePrediction(PREDICTION_A, actualBottomed, actualCandlesBack);

        expect(result.label).toBe(true);
        expect(result.claimedTime.toISOString()).toBe('2025-12-31T14:30:00.000Z');
        expect(result.logLoss).toBeCloseTo(LN_0_9, 9);
        expect(result.brierScore).toBeCloseTo(0.01, 9);
        expect(result.timingError).toBe(0);
      });

      it('Prediction B (bad): exact values', () => {
        const result = scorePrediction(PREDICTION_B, actualBottomed, actualCandlesBack);

        expect(result.label).toBe(true);
        expect(result.claimedTime.toISOString()).toBe('2025-12-31T15:00:00.000Z');
        expect(result.logLoss).toBeCloseTo(LN_0_1, 9);
        expect(result.brierScore).toBeCloseTo(0.81, 9);
        expect(result.timingError).toBeNull(); // hasBottomed=false, no timing comparison
      });
    });

    describe('Case 2: No bottom (actualBottomed = false)', () => {
      const actualBottomed = false;
      const actualCandlesBack = null;

      it('Prediction C (good): exact values', () => {
        const result = scorePrediction(PREDICTION_C, actualBottomed, actualCandlesBack);

        expect(result.label).toBe(false);
        expect(result.logLoss).toBeCloseTo(LN_0_9, 9);
        expect(result.brierScore).toBeCloseTo(0.01, 9);
        expect(result.timingError).toBeNull();
      });

      it('Prediction D (bad): exact values', () => {
        const result = scorePrediction(PREDICTION_D, actualBottomed, actualCandlesBack);

        expect(result.label).toBe(false);
        expect(result.logLoss).toBeCloseTo(LN_0_1, 9);
        expect(result.brierScore).toBeCloseTo(0.81, 9);
        expect(result.timingError).toBeNull();
      });
    });
  });

  describe('Acceptance criteria', () => {
    it('should compute exact log loss values (within epsilon)', () => {
      // Verify the exact expected values match our computed values
      expect(Math.abs(-Math.log(0.9) - LN_0_9)).toBeLessThan(EPSILON);
      expect(Math.abs(-Math.log(0.1) - LN_0_1)).toBeLessThan(EPSILON);
    });

    it('should compute exact brier score values (within epsilon)', () => {
      expect(Math.abs(Math.pow(0.9 - 1, 2) - BRIER_0_9_TRUE)).toBeLessThan(EPSILON);
      expect(Math.abs(Math.pow(0.1 - 1, 2) - BRIER_0_1_TRUE)).toBeLessThan(EPSILON);
      expect(Math.abs(Math.pow(0.1 - 0, 2) - BRIER_0_1_FALSE)).toBeLessThan(EPSILON);
      expect(Math.abs(Math.pow(0.9 - 0, 2) - BRIER_0_9_FALSE)).toBeLessThan(EPSILON);
    });

    it('should correctly identify pivot at candlesBack=6 from snapTime', () => {
      const candlesBack = 6;
      const barSizeMinutes = 5;
      const claimedTime = new Date(SNAP_TIME.getTime() - candlesBack * barSizeMinutes * 60_000);
      expect(claimedTime.getTime()).toBe(PIVOT_TIME.getTime());
    });
  });
});
