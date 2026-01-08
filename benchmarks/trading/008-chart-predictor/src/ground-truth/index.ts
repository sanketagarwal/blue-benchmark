/**
 * Ground truth computation for Multi-Step Reasoning benchmark.
 * 
 * HYBRID APPROACH:
 * - Uses Replay Labs annotations where available (local_extrema for support/resistance)
 * - Computes remaining values from raw OHLCV data (VWAP, BB, trend, volatility)
 * 
 * All computed values are unit-tested in computed.test.ts
 */

import type { ChartReadingOutput } from '../output-schema.js';
import type { Candle } from '../replay-lab/ohlcv.js';
import type { LocalExtremaAnnotation } from '../replay-lab/annotations.js';

export type { Candle } from '../replay-lab/ohlcv.js';

export interface ChartMeta {
  base_quote: string;
  venue: string;
  timeframe: string;
}

export interface IndicatorValues {
  vwap: number | null;
  bb_upper: number | null;
  bb_lower: number | null;
  bb_mid: number | null;
  sma20: number | null;
  ema20: number | null;
}

export interface GroundTruthInput {
  candles: Candle[];
  meta: ChartMeta;
  indicators: IndicatorValues;
  timeframeMinutes: number;
  /** Optional: Replay Labs annotations for support/resistance */
  localExtrema?: LocalExtremaAnnotation[];
}

// ============================================================================
// COMPUTED VALUES (unit-tested in computed.test.ts)
// ============================================================================

/**
 * Compute VWAP from raw candle data.
 * Formula: Σ(Typical Price × Volume) / Σ(Volume)
 * where Typical Price = (High + Low + Close) / 3
 * 
 * @tested computed.test.ts - testVWAP()
 */
export function computeVWAP(candles: Candle[]): number {
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeTPV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
  }
  
  if (cumulativeVolume === 0) {
    return candles[candles.length - 1]?.close ?? 0;
  }
  
  return cumulativeTPV / cumulativeVolume;
}

/**
 * Compute Bollinger Bands from raw candle data.
 * - Middle: 20-period SMA of close prices
 * - Upper: Middle + (2 × standard deviation)
 * - Lower: Middle - (2 × standard deviation)
 * 
 * @tested computed.test.ts - testBollingerBands()
 */
export function computeBollingerBands(
  candles: Candle[], 
  period = 20, 
  stdDevMultiplier = 2
): { upper: number; lower: number; mid: number } {
  if (candles.length < period) {
    // Fallback for insufficient data
    const closes = candles.map(c => c.close);
    const mid = closes.reduce((a, b) => a + b, 0) / closes.length;
    const range = Math.max(...candles.map(c => c.high)) - Math.min(...candles.map(c => c.low));
    return { upper: mid + range * 0.5, lower: mid - range * 0.5, mid };
  }

  const relevantCandles = candles.slice(-period);
  const closes = relevantCandles.map(c => c.close);
  
  // SMA
  const sma = closes.reduce((a, b) => a + b, 0) / period;
  
  // Standard deviation (population)
  const squaredDiffs = closes.map(c => Math.pow(c - sma, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(variance);
  
  return {
    upper: sma + (stdDev * stdDevMultiplier),
    lower: sma - (stdDev * stdDevMultiplier),
    mid: sma,
  };
}

/**
 * Compute trend direction from price change.
 * 
 * @tested computed.test.ts - testTrendDirection()
 * @returns 'up' if >0.5% gain, 'down' if >0.5% loss, 'flat' otherwise
 */
export function computeTrendDirection(
  candles: Candle[],
  lookback = 10,
  threshold = 0.005
): 'up' | 'down' | 'flat' {
  if (candles.length < 2) return 'flat';
  
  const relevantCandles = candles.slice(-lookback);
  const firstClose = relevantCandles[0]?.close ?? candles[0]!.close;
  const lastClose = candles[candles.length - 1]!.close;
  
  const priceChange = (lastClose - firstClose) / firstClose;
  
  if (priceChange > threshold) return 'up';
  if (priceChange < -threshold) return 'down';
  return 'flat';
}

/**
 * Compute volatility level from average range.
 * 
 * @tested computed.test.ts - testVolatilityLevel()
 * @returns 'high' if avg range >1.5% of price, 'low' if <0.8%, 'medium' otherwise
 */
export function computeVolatilityLevel(
  candles: Candle[],
  lookback = 10
): 'high' | 'medium' | 'low' {
  if (candles.length === 0) return 'medium';
  
  const relevantCandles = candles.slice(-lookback);
  const avgRange = relevantCandles.reduce((sum, c) => sum + (c.high - c.low), 0) / relevantCandles.length;
  const avgPrice = relevantCandles.reduce((sum, c) => sum + c.close, 0) / relevantCandles.length;
  
  const volatilityPct = avgRange / avgPrice;
  
  if (volatilityPct > 0.015) return 'high';
  if (volatilityPct < 0.008) return 'low';
  return 'medium';
}

// ============================================================================
// REPLAY LABS ANNOTATIONS (from API)
// ============================================================================

/**
 * Find recent support level from Replay Labs local_extrema annotations.
 * Uses 'bottom' annotations as support levels.
 */
export function findSupportFromAnnotations(
  extrema: LocalExtremaAnnotation[],
  currentPrice: number,
  maxDistancePct = 0.03
): { price: number; timestamp: Date } | null {
  const bottoms = extrema
    .filter(e => e.payload.kind === 'bottom')
    .filter(e => {
      const priceDiff = Math.abs(e.payload.price - currentPrice) / currentPrice;
      return priceDiff < maxDistancePct;
    })
    .sort((a, b) => new Date(b.time_start).getTime() - new Date(a.time_start).getTime());
  
  const recent = bottoms[0];
  if (!recent) return null;
  
  return {
    price: recent.payload.price,
    timestamp: new Date(recent.time_start),
  };
}

/**
 * Find recent resistance level from Replay Labs local_extrema annotations.
 * Uses 'top' annotations as resistance levels.
 */
export function findResistanceFromAnnotations(
  extrema: LocalExtremaAnnotation[],
  currentPrice: number,
  maxDistancePct = 0.03
): { price: number; timestamp: Date } | null {
  const tops = extrema
    .filter(e => e.payload.kind === 'top')
    .filter(e => {
      const priceDiff = Math.abs(e.payload.price - currentPrice) / currentPrice;
      return priceDiff < maxDistancePct;
    })
    .sort((a, b) => new Date(b.time_start).getTime() - new Date(a.time_start).getTime());
  
  const recent = tops[0];
  if (!recent) return null;
  
  return {
    price: recent.payload.price,
    timestamp: new Date(recent.time_start),
  };
}

// ============================================================================
// MAIN GROUND TRUTH COMPUTATION
// ============================================================================

/**
 * Compute ground truth for multi-step reasoning benchmark.
 * 
 * Uses:
 * - Replay Labs: local_extrema for support/resistance (when provided)
 * - Computed: VWAP, BB, trend direction, volatility (unit-tested)
 */
export function computeGroundTruth(input: GroundTruthInput): ChartReadingOutput {
  const { candles, meta, indicators, localExtrema } = input;

  if (candles.length === 0) {
    throw new Error('No candles provided');
  }

  // Get last candle for active readout
  const lastCandle = candles[candles.length - 1]!;
  const last10 = candles.slice(-10);
  const currentPrice = lastCandle.close;

  // -------------------------------------------------------------------------
  // COMPUTED VALUES (unit-tested)
  // -------------------------------------------------------------------------
  
  // Compute or use provided Bollinger Bands
  const bb = indicators.bb_upper !== null && indicators.bb_lower !== null
    ? { 
        upper: indicators.bb_upper, 
        lower: indicators.bb_lower, 
        mid: indicators.bb_mid ?? (indicators.bb_upper + indicators.bb_lower) / 2 
      }
    : computeBollingerBands(candles);
  
  // Compute or use provided VWAP
  const vwap = indicators.vwap ?? computeVWAP(candles);

  // Compute trend and volatility
  const trendDir = computeTrendDirection(candles);
  const volLevel = computeVolatilityLevel(candles);
  
  const isUptrend = trendDir === 'up';
  const isDowntrend = trendDir === 'down';
  const isHighVol = volLevel === 'high';
  const isLowVol = volLevel === 'low';

  // -------------------------------------------------------------------------
  // SUPPORT/RESISTANCE (Replay Labs when available, else Bollinger Bands)
  // -------------------------------------------------------------------------
  
  let supportLevel: number;
  let resistanceLevel: number;
  let supportFromAnnotations = false;
  let resistanceFromAnnotations = false;
  
  if (localExtrema && localExtrema.length > 0) {
    // Use Replay Labs annotations
    const supportAnnotation = findSupportFromAnnotations(localExtrema, currentPrice);
    const resistanceAnnotation = findResistanceFromAnnotations(localExtrema, currentPrice);
    
    supportLevel = supportAnnotation?.price ?? bb.lower;
    resistanceLevel = resistanceAnnotation?.price ?? bb.upper;
    supportFromAnnotations = supportAnnotation !== null;
    resistanceFromAnnotations = resistanceAnnotation !== null;
  } else {
    // Fallback to Bollinger Bands
    supportLevel = bb.lower;
    resistanceLevel = bb.upper;
  }

  // -------------------------------------------------------------------------
  // MULTI-STEP REASONING FIELDS
  // -------------------------------------------------------------------------

  // 1. Uptrend pullback to VWAP (computed)
  const nearVwap = Math.abs(currentPrice - vwap) / vwap < 0.003;
  const uptrendPullbackToVwap = isUptrend && nearVwap;

  // 2. Volatility + Direction combo (computed)
  let volatilityDirectionCombo: 'high_vol_bullish' | 'high_vol_bearish' | 'low_vol_drift_up' | 'low_vol_drift_down' | 'consolidation';
  if (isHighVol && isUptrend) {
    volatilityDirectionCombo = 'high_vol_bullish';
  } else if (isHighVol && isDowntrend) {
    volatilityDirectionCombo = 'high_vol_bearish';
  } else if (isLowVol && isUptrend) {
    volatilityDirectionCombo = 'low_vol_drift_up';
  } else if (isLowVol && isDowntrend) {
    volatilityDirectionCombo = 'low_vol_drift_down';
  } else {
    volatilityDirectionCombo = 'consolidation';
  }

  // 3. Tested and held support (uses annotations or BB)
  const last5 = candles.slice(-5);
  const testedSupport = last5.some(c => c.low <= supportLevel * 1.002); // Within 0.2% of support
  const heldAboveSupport = last5.every(c => c.close > supportLevel * 0.998);
  const testedAndHeldSupport = testedSupport && heldAboveSupport;

  // 4. Breakout with volume (uses annotations or BB)
  const avgVolume = last10.reduce((sum, c) => sum + c.volume, 0) / last10.length;
  const brokeResistance = lastCandle.high > resistanceLevel;
  const highVolume = lastCandle.volume > avgVolume * 1.2;
  const breakoutWithVolume = brokeResistance && highVolume;

  // 5. Potential reversal at support (uses annotations or BB)
  let potentialReversalAtSupport = false;
  if (candles.length >= 2) {
    const prevCandle = candles[candles.length - 2]!;
    const touchedSupport = prevCandle.low <= supportLevel * 1.002;
    const bullishFollow = lastCandle.close > lastCandle.open;
    const closedHigher = lastCandle.close > prevCandle.close;
    potentialReversalAtSupport = touchedSupport && bullishFollow && closedHigher;
  }

  // 6. Overall bias (derived from all signals)
  let bullishSignals = 0;
  let bearishSignals = 0;

  if (isUptrend) bullishSignals++;
  if (isDowntrend) bearishSignals++;
  if (currentPrice > vwap) bullishSignals++;
  if (currentPrice < vwap) bearishSignals++;
  if (testedAndHeldSupport) bullishSignals++;
  if (breakoutWithVolume) bullishSignals++;
  if (potentialReversalAtSupport) bullishSignals++;

  let overallBias: 'bullish' | 'mildly_bullish' | 'neutral' | 'mildly_bearish' | 'bearish';
  const netSignal = bullishSignals - bearishSignals;
  if (netSignal >= 3) {
    overallBias = 'bullish';
  } else if (netSignal >= 1) {
    overallBias = 'mildly_bullish';
  } else if (netSignal <= -3) {
    overallBias = 'bearish';
  } else if (netSignal <= -1) {
    overallBias = 'mildly_bearish';
  } else {
    overallBias = 'neutral';
  }

  // -------------------------------------------------------------------------
  // OUTPUT
  // -------------------------------------------------------------------------

  return {
    meta: {
      base_quote: meta.base_quote,
      venue: meta.venue,
      timeframe: meta.timeframe,
    },
    active_readout: {
      open: lastCandle.open,
      high: lastCandle.high,
      low: lastCandle.low,
      close: lastCandle.close,
    },
    multi_step: {
      uptrend_pullback_to_vwap: uptrendPullbackToVwap,
      volatility_direction_combo: volatilityDirectionCombo,
      tested_and_held_support: testedAndHeldSupport,
      breakout_with_volume: breakoutWithVolume,
      potential_reversal_at_support: potentialReversalAtSupport,
      overall_bias: overallBias,
    },
    // Debug info (not part of schema, for verification)
    _debug: {
      supportLevel,
      resistanceLevel,
      supportFromAnnotations,
      resistanceFromAnnotations,
      vwap,
      bb,
      trendDir,
      volLevel,
    },
  } as ChartReadingOutput;
}
