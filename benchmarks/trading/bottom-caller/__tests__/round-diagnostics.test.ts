import { describe, it, expect } from 'vitest';

import { buildRoundDiagnostic } from '../src/diagnostics/round-diagnostics.js';

import type { BuildRoundDiagnosticParams } from '../src/diagnostics/round-diagnostics.js';
import type { TimeframeId } from '../src/timeframe-config.js';

const HORIZONS: TimeframeId[] = ['15m', '1h', '4h', '24h'];

function createDefaultPredictions(): BuildRoundDiagnosticParams['predictions'] {
  return {
    '15m': { hasBottomed: true, confidence: 0.75, candlesBack: 2 },
    '1h': { hasBottomed: false, confidence: 0.3, candlesBack: undefined },
    '4h': { hasBottomed: true, confidence: 0.9, candlesBack: 1 },
    '24h': { hasBottomed: false, confidence: 0.2, candlesBack: undefined },
  };
}

function createDefaultPrimaryLabels(): BuildRoundDiagnosticParams['primaryLabels'] {
  return {
    '15m': { hasStructuralBottom: true, firstPivotAt: new Date('2024-01-15T10:05:00Z') },
    '1h': { hasStructuralBottom: false, firstPivotAt: undefined },
    '4h': { hasStructuralBottom: true, firstPivotAt: new Date('2024-01-15T12:00:00Z') },
    '24h': { hasStructuralBottom: false, firstPivotAt: undefined },
  };
}

function createDefaultSecondaryLabels(): BuildRoundDiagnosticParams['secondaryLabels'] {
  return {
    '15m': { hasStructuralBottom: true, firstPivotAt: new Date('2024-01-15T10:07:00Z') },
    '1h': { hasStructuralBottom: true, firstPivotAt: new Date('2024-01-15T10:30:00Z') },
    '4h': { hasStructuralBottom: false, firstPivotAt: undefined },
    '24h': { hasStructuralBottom: false, firstPivotAt: undefined },
  };
}

function createDefaultScores(): {
  logLossByHorizon: Record<TimeframeId, number>;
  brierByHorizon: Record<TimeframeId, number>;
} {
  return {
    logLossByHorizon: { '15m': 0.287, '1h': 0.356, '4h': 0.105, '24h': 0.223 },
    brierByHorizon: { '15m': 0.0625, '1h': 0.09, '4h': 0.01, '24h': 0.04 },
  };
}

function createDefaultTimeToPivotRatios(): Record<TimeframeId, number | undefined> {
  return {
    '15m': 0.5, // Pivot at midpoint of 15m window
    '1h': undefined, // No pivot
    '4h': 0.25, // Pivot at 25% into 4h window
    '24h': undefined, // No pivot
  };
}

describe('buildRoundDiagnostic', () => {
  const baseParams: BuildRoundDiagnosticParams = {
    roundNumber: 42,
    timestamp: new Date('2024-01-15T10:00:00Z'),
    modelId: 'gpt-4-turbo',
    predictions: createDefaultPredictions(),
    primaryLabels: createDefaultPrimaryLabels(),
    secondaryLabels: createDefaultSecondaryLabels(),
    ...createDefaultScores(),
    timeToPivotRatios: createDefaultTimeToPivotRatios(),
    schemaValid: true,
    abstained: false,
  };

  it('should build diagnostic with correct metadata', () => {
    const result = buildRoundDiagnostic(baseParams);

    expect(result.roundNumber).toBe(42);
    expect(result.timestamp).toBe('2024-01-15T10:00:00.000Z');
    expect(result.modelId).toBe('gpt-4-turbo');
  });

  it('should map output integrity fields correctly', () => {
    const result = buildRoundDiagnostic(baseParams);

    expect(result.outputIntegrity.hasBottomed).toEqual({
      '15m': true,
      '1h': false,
      '4h': true,
      '24h': false,
    });

    expect(result.outputIntegrity.confidence).toEqual({
      '15m': 0.75,
      '1h': 0.3,
      '4h': 0.9,
      '24h': 0.2,
    });

    expect(result.outputIntegrity.candlesBack).toEqual({
      '15m': 2,
      '1h': undefined,
      '4h': 1,
      '24h': undefined,
    });

    expect(result.outputIntegrity.schemaValid).toBe(true);
    expect(result.outputIntegrity.abstained).toBe(false);
  });

  it('should map ground truth labels with ISO timestamps', () => {
    const result = buildRoundDiagnostic(baseParams);

    // Fractal (primary) labels
    expect(result.groundTruth.fractal['15m'].label).toBe(true);
    expect(result.groundTruth.fractal['15m'].firstPivotAt).toBe('2024-01-15T10:05:00.000Z');

    expect(result.groundTruth.fractal['1h'].label).toBe(false);
    expect(result.groundTruth.fractal['1h'].firstPivotAt).toBeUndefined();

    expect(result.groundTruth.fractal['4h'].label).toBe(true);
    expect(result.groundTruth.fractal['4h'].firstPivotAt).toBe('2024-01-15T12:00:00.000Z');

    // Zigzag (secondary) labels
    expect(result.groundTruth.zigzag['15m'].label).toBe(true);
    expect(result.groundTruth.zigzag['15m'].firstPivotAt).toBe('2024-01-15T10:07:00.000Z');

    expect(result.groundTruth.zigzag['1h'].label).toBe(true);
    expect(result.groundTruth.zigzag['1h'].firstPivotAt).toBe('2024-01-15T10:30:00.000Z');

    expect(result.groundTruth.zigzag['4h'].label).toBe(false);
    expect(result.groundTruth.zigzag['4h'].firstPivotAt).toBeUndefined();
  });

  it('should pass through scores unchanged', () => {
    const result = buildRoundDiagnostic(baseParams);

    expect(result.scores.logLoss).toEqual({
      '15m': 0.287,
      '1h': 0.356,
      '4h': 0.105,
      '24h': 0.223,
    });

    expect(result.scores.brier).toEqual({
      '15m': 0.0625,
      '1h': 0.09,
      '4h': 0.01,
      '24h': 0.04,
    });
  });

  it('should compute timing metrics correctly', () => {
    const result = buildRoundDiagnostic(baseParams);

    // claimedCandlesBack should match predictions
    expect(result.timing.claimedCandlesBack).toEqual({
      '15m': 2,
      '1h': undefined,
      '4h': 1,
      '24h': undefined,
    });

    // actualTimeToPivotRatio should match input
    expect(result.timing.actualTimeToPivotRatio).toEqual({
      '15m': 0.5,
      '1h': undefined,
      '4h': 0.25,
      '24h': undefined,
    });

    // timingErrorCandles: only computed when both claimed and actual available
    // 15m: candlesBack=2, ratio=0.5, candlesPerHorizon=3
    //   actualCandlesBack = (1 - 0.5) * 3 = 1.5
    //   error = 2 - 1.5 = 0.5
    expect(result.timing.timingErrorCandles['15m']).toBeCloseTo(0.5, 5);

    // 1h: no candlesBack, so undefined
    expect(result.timing.timingErrorCandles['1h']).toBeUndefined();

    // 4h: candlesBack=1, ratio=0.25, candlesPerHorizon=4
    //   actualCandlesBack = (1 - 0.25) * 4 = 3
    //   error = 1 - 3 = -2
    expect(result.timing.timingErrorCandles['4h']).toBeCloseTo(-2, 5);

    // 24h: no ratio, so undefined
    expect(result.timing.timingErrorCandles['24h']).toBeUndefined();
  });

  it('should handle abstained predictions', () => {
    const params: BuildRoundDiagnosticParams = {
      ...baseParams,
      abstained: true,
      schemaValid: false,
    };

    const result = buildRoundDiagnostic(params);

    expect(result.outputIntegrity.abstained).toBe(true);
    expect(result.outputIntegrity.schemaValid).toBe(false);
  });

  it('should handle all undefined candlesBack', () => {
    const params: BuildRoundDiagnosticParams = {
      ...baseParams,
      predictions: {
        '15m': { hasBottomed: false, confidence: 0.3, candlesBack: undefined },
        '1h': { hasBottomed: false, confidence: 0.2, candlesBack: undefined },
        '4h': { hasBottomed: false, confidence: 0.1, candlesBack: undefined },
        '24h': { hasBottomed: false, confidence: 0.05, candlesBack: undefined },
      },
    };

    const result = buildRoundDiagnostic(params);

    for (const horizon of HORIZONS) {
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant
      expect(result.timing.claimedCandlesBack[horizon]).toBeUndefined();
      // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant
      expect(result.timing.timingErrorCandles[horizon]).toBeUndefined();
    }
  });

  it('should handle zero candlesBack correctly', () => {
    const params: BuildRoundDiagnosticParams = {
      ...baseParams,
      predictions: {
        '15m': { hasBottomed: true, confidence: 0.95, candlesBack: 0 },
        '1h': { hasBottomed: false, confidence: 0.3, candlesBack: undefined },
        '4h': { hasBottomed: false, confidence: 0.2, candlesBack: undefined },
        '24h': { hasBottomed: false, confidence: 0.1, candlesBack: undefined },
      },
      timeToPivotRatios: {
        '15m': 1.0, // Pivot at end of window
        '1h': undefined,
        '4h': undefined,
        '24h': undefined,
      },
    };

    const result = buildRoundDiagnostic(params);

    // candlesBack=0, ratio=1.0, candlesPerHorizon=3
    // actualCandlesBack = (1 - 1.0) * 3 = 0
    // error = 0 - 0 = 0
    expect(result.timing.claimedCandlesBack['15m']).toBe(0);
    expect(result.timing.timingErrorCandles['15m']).toBeCloseTo(0, 5);
  });

  it('should produce valid JSON when serialized', () => {
    const result = buildRoundDiagnostic(baseParams);

    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);

    expect(parsed.roundNumber).toBe(42);
    expect(parsed.timestamp).toBe('2024-01-15T10:00:00.000Z');
    expect(parsed.modelId).toBe('gpt-4-turbo');
    expect(parsed.outputIntegrity.hasBottomed['15m']).toBe(true);
    expect(parsed.groundTruth.fractal['15m'].label).toBe(true);
    expect(parsed.scores.logLoss['15m']).toBe(0.287);
  });

  it('should compute timing error for all horizons correctly', () => {
    // Test each horizon's candle count
    const params: BuildRoundDiagnosticParams = {
      ...baseParams,
      predictions: {
        '15m': { hasBottomed: true, confidence: 0.9, candlesBack: 1 },
        '1h': { hasBottomed: true, confidence: 0.9, candlesBack: 2 },
        '4h': { hasBottomed: true, confidence: 0.9, candlesBack: 2 },
        '24h': { hasBottomed: true, confidence: 0.9, candlesBack: 3 },
      },
      timeToPivotRatios: {
        '15m': 0.5, // actualCandlesBack = 0.5 * 3 = 1.5
        '1h': 0.5, // actualCandlesBack = 0.5 * 4 = 2
        '4h': 0.5, // actualCandlesBack = 0.5 * 4 = 2
        '24h': 0.5, // actualCandlesBack = 0.5 * 6 = 3
      },
    };

    const result = buildRoundDiagnostic(params);

    // 15m: error = 1 - 1.5 = -0.5
    expect(result.timing.timingErrorCandles['15m']).toBeCloseTo(-0.5, 5);

    // 1h: error = 2 - 2 = 0
    expect(result.timing.timingErrorCandles['1h']).toBeCloseTo(0, 5);

    // 4h: error = 2 - 2 = 0
    expect(result.timing.timingErrorCandles['4h']).toBeCloseTo(0, 5);

    // 24h: error = 3 - 3 = 0
    expect(result.timing.timingErrorCandles['24h']).toBeCloseTo(0, 5);
  });
});
