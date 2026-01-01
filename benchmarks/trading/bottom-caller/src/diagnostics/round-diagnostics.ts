import type { TimeframeId } from '../timeframe-config.js';

/**
 * Per-round diagnostic output for benchmark analysis
 * Emitted as JSON per model per round with integrity, ground truth, scoring, and timing data
 */
export interface RoundDiagnostic {
  roundNumber: number;
  timestamp: string;
  modelId: string;

  outputIntegrity: {
    hasBottomed: Record<TimeframeId, boolean>;
    confidence: Record<TimeframeId, number>;
    candlesBack: Record<TimeframeId, number | undefined>;
    schemaValid: boolean;
    abstained: boolean;
  };

  groundTruth: {
    fractal: Record<TimeframeId, { label: boolean; firstPivotAt?: string }>;
    zigzag: Record<TimeframeId, { label: boolean; firstPivotAt?: string }>;
  };

  scores: {
    logLoss: Record<TimeframeId, number>;
    brier: Record<TimeframeId, number>;
  };

  timing: {
    claimedCandlesBack: Record<TimeframeId, number | undefined>;
    actualTimeToPivotRatio: Record<TimeframeId, number | undefined>;
    timingErrorCandles: Record<TimeframeId, number | undefined>;
  };
}

export interface BuildRoundDiagnosticParams {
  roundNumber: number;
  timestamp: Date;
  modelId: string;
  predictions: Record<
    TimeframeId,
    { hasBottomed: boolean; confidence: number; candlesBack?: number }
  >;
  primaryLabels: Record<
    TimeframeId,
    { hasStructuralBottom: boolean; firstPivotAt?: Date }
  >;
  secondaryLabels: Record<
    TimeframeId,
    { hasStructuralBottom: boolean; firstPivotAt?: Date }
  >;
  logLossByHorizon: Record<TimeframeId, number>;
  brierByHorizon: Record<TimeframeId, number>;
  timeToPivotRatios: Record<TimeframeId, number | undefined>;
  schemaValid: boolean;
  abstained: boolean;
}

const HORIZONS: TimeframeId[] = ['15m', '1h', '4h', '24h'];

/**
 * Get number of output candles per horizon
 * Based on outputCoordinateSystem from timeframe-config
 *
 * @param horizon - The timeframe horizon
 * @returns Number of candles in the horizon window
 */
function getCandlesPerHorizon(horizon: TimeframeId): number {
  switch (horizon) {
    case '15m':
      return 3; // 15m / 5m bars = 3
    case '1h':
      return 4; // 60m / 15m bars = 4
    case '4h':
      return 4; // 240m / 60m bars = 4
    case '24h':
      return 6; // 1440m / 240m bars = 6
  }
}

/**
 * Compute timing error in candles
 * Positive = model claimed bottom earlier than actual
 * Negative = model claimed bottom later than actual
 *
 * @param claimedCandlesBack - Model's claimed candles back to bottom
 * @param actualRatio - Actual time-to-pivot ratio (0-1)
 * @param horizon - Timeframe horizon
 * @returns Timing error in candles
 */
function computeTimingError(
  claimedCandlesBack: number,
  actualRatio: number,
  horizon: TimeframeId
): number {
  const candlesPerHorizon = getCandlesPerHorizon(horizon);

  // actualRatio is time-to-pivot / horizon-duration
  // Convert to candles: actualCandlesBack = (1 - actualRatio) * candlesPerHorizon
  // (1 - ratio) because ratio=0 means pivot at start, ratio=1 means pivot at end
  const actualCandlesBack = (1 - actualRatio) * candlesPerHorizon;

  return claimedCandlesBack - actualCandlesBack;
}

/**
 * Build output integrity section from predictions
 *
 * @param predictions - Model predictions by horizon
 * @returns Output integrity data structure
 */
function buildOutputIntegrity(
  predictions: BuildRoundDiagnosticParams['predictions']
): RoundDiagnostic['outputIntegrity'] {
  const hasBottomed: Record<string, boolean> = {};
  const confidence: Record<string, number> = {};
  const candlesBack: Record<string, number | undefined> = {};

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    const pred = predictions[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    hasBottomed[horizon] = pred.hasBottomed;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    confidence[horizon] = pred.confidence;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    candlesBack[horizon] = pred.candlesBack;
  }

  return {
    hasBottomed: hasBottomed as Record<TimeframeId, boolean>,
    confidence: confidence as Record<TimeframeId, number>,
    candlesBack: candlesBack as Record<TimeframeId, number | undefined>,
    schemaValid: true, // Placeholder, will be overwritten
    abstained: false, // Placeholder, will be overwritten
  };
}

/**
 * Build ground truth label entry for a single horizon
 *
 * @param label - Ground truth label data
 * @param label.hasStructuralBottom - Whether a structural bottom was detected
 * @param label.firstPivotAt - Optional timestamp of first pivot
 * @returns Formatted label entry with optional ISO timestamp
 */
function buildLabelEntry(label: {
  hasStructuralBottom: boolean;
  firstPivotAt?: Date;
}): { label: boolean; firstPivotAt?: string } {
  if (label.firstPivotAt !== undefined) {
    return {
      label: label.hasStructuralBottom,
      firstPivotAt: label.firstPivotAt.toISOString(),
    };
  }
  return { label: label.hasStructuralBottom };
}

/**
 * Build ground truth section from primary and secondary labels
 *
 * @param primaryLabels - Primary (fractal) labels by horizon
 * @param secondaryLabels - Secondary (zigzag) labels by horizon
 * @returns Ground truth data structure
 */
function buildGroundTruth(
  primaryLabels: BuildRoundDiagnosticParams['primaryLabels'],
  secondaryLabels: BuildRoundDiagnosticParams['secondaryLabels']
): RoundDiagnostic['groundTruth'] {
  const fractal: Record<string, { label: boolean; firstPivotAt?: string }> = {};
  const zigzag: Record<string, { label: boolean; firstPivotAt?: string }> = {};

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    fractal[horizon] = buildLabelEntry(primaryLabels[horizon]);
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    zigzag[horizon] = buildLabelEntry(secondaryLabels[horizon]);
  }

  return {
    fractal: fractal as Record<TimeframeId, { label: boolean; firstPivotAt?: string }>,
    zigzag: zigzag as Record<TimeframeId, { label: boolean; firstPivotAt?: string }>,
  };
}

/**
 * Build timing section from predictions and ratios
 *
 * @param predictions - Model predictions by horizon
 * @param timeToPivotRatios - Actual time-to-pivot ratios by horizon
 * @returns Timing data structure
 */
function buildTiming(
  predictions: BuildRoundDiagnosticParams['predictions'],
  timeToPivotRatios: BuildRoundDiagnosticParams['timeToPivotRatios']
): RoundDiagnostic['timing'] {
  const claimedCandlesBack: Record<string, number | undefined> = {};
  const actualTimeToPivotRatio: Record<string, number | undefined> = {};
  const timingErrorCandles: Record<string, number | undefined> = {};

  for (const horizon of HORIZONS) {
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    const pred = predictions[horizon];
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    const ratio = timeToPivotRatios[horizon];

    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    claimedCandlesBack[horizon] = pred.candlesBack;
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    actualTimeToPivotRatio[horizon] = ratio;

    // Compute timing error if both claimed and actual are available
    // eslint-disable-next-line security/detect-object-injection -- horizon from typed constant array
    timingErrorCandles[horizon] =
      pred.candlesBack !== undefined && ratio !== undefined
        ? computeTimingError(pred.candlesBack, ratio, horizon)
        : undefined;
  }

  return {
    claimedCandlesBack: claimedCandlesBack as Record<TimeframeId, number | undefined>,
    actualTimeToPivotRatio: actualTimeToPivotRatio as Record<TimeframeId, number | undefined>,
    timingErrorCandles: timingErrorCandles as Record<TimeframeId, number | undefined>,
  };
}

/**
 * Build a round diagnostic record from benchmark data
 *
 * @param params - Input parameters containing predictions, labels, scores, and timing
 * @returns Structured diagnostic record for JSON serialization
 */
export function buildRoundDiagnostic(
  params: BuildRoundDiagnosticParams
): RoundDiagnostic {
  const {
    roundNumber,
    timestamp,
    modelId,
    predictions,
    primaryLabels,
    secondaryLabels,
    logLossByHorizon,
    brierByHorizon,
    timeToPivotRatios,
    schemaValid,
    abstained,
  } = params;

  const outputIntegrity = buildOutputIntegrity(predictions);
  outputIntegrity.schemaValid = schemaValid;
  outputIntegrity.abstained = abstained;

  return {
    roundNumber,
    timestamp: timestamp.toISOString(),
    modelId,
    outputIntegrity,
    groundTruth: buildGroundTruth(primaryLabels, secondaryLabels),
    scores: {
      logLoss: logLossByHorizon,
      brier: brierByHorizon,
    },
    timing: buildTiming(predictions, timeToPivotRatios),
  };
}
