/**
 * Ground truth computation for Multi-Step Reasoning benchmark.
 * 
 * DETERMINISTIC: All values computed from raw OHLCV data.
 * No null values - every field has a definite answer.
 */

import type { ChartReadingOutput } from '../output-schema.js';
import type { Candle } from '../replay-lab/ohlcv.js';

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
}

/**
 * Compute Bollinger Bands from raw candle data
 * @param candles - Array of candles (need at least 20)
 * @param period - Period for SMA calculation (default 20)
 * @param stdDev - Standard deviation multiplier (default 2)
 */
function computeBollingerBands(candles: Candle[], period = 20, stdDev = 2): { upper: number; lower: number; mid: number } {
  if (candles.length < period) {
    // Not enough data - use simple range-based fallback
    const closes = candles.map(c => c.close);
    const mid = closes.reduce((a, b) => a + b, 0) / closes.length;
    const range = Math.max(...candles.map(c => c.high)) - Math.min(...candles.map(c => c.low));
    return { upper: mid + range * 0.5, lower: mid - range * 0.5, mid };
  }

  const relevantCandles = candles.slice(-period);
  const closes = relevantCandles.map(c => c.close);
  
  // Calculate SMA
  const sma = closes.reduce((a, b) => a + b, 0) / period;
  
  // Calculate standard deviation
  const squaredDiffs = closes.map(c => Math.pow(c - sma, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(variance);
  
  return {
    upper: sma + (std * stdDev),
    lower: sma - (std * stdDev),
    mid: sma,
  };
}

/**
 * Compute VWAP from raw candle data
 */
function computeVWAP(candles: Candle[]): number {
  let cumulativeTPV = 0; // Typical Price * Volume
  let cumulativeVolume = 0;
  
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeTPV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
  }
  
  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : candles[candles.length - 1]!.close;
}

/**
 * Compute ground truth for multi-step reasoning benchmark.
 * ALL VALUES ARE DETERMINISTIC - no nulls, computed from raw data.
 */
export function computeGroundTruth(input: GroundTruthInput): ChartReadingOutput {
  const { candles, meta, indicators } = input;

  if (candles.length === 0) {
    throw new Error('No candles provided');
  }

  // Get last candle for active readout
  const lastCandle = candles[candles.length - 1]!;
  const last10 = candles.slice(-10);

  // Compute indicators from raw data if not provided
  const bb = indicators.bb_upper !== null && indicators.bb_lower !== null
    ? { upper: indicators.bb_upper, lower: indicators.bb_lower, mid: indicators.bb_mid ?? (indicators.bb_upper + indicators.bb_lower) / 2 }
    : computeBollingerBands(candles);
  
  const vwap = indicators.vwap ?? computeVWAP(candles);

  // Compute trend from last 10 candles
  const firstClose = last10[0]?.close ?? lastCandle.close;
  const lastClose = lastCandle.close;
  const priceChange = (lastClose - firstClose) / firstClose;

  const isUptrend = priceChange > 0.005; // >0.5% up
  const isDowntrend = priceChange < -0.005; // >0.5% down

  // Compute volatility (average range as % of price)
  const avgRange = last10.reduce((sum, c) => sum + (c.high - c.low), 0) / last10.length;
  const avgPrice = last10.reduce((sum, c) => sum + c.close, 0) / last10.length;
  const volatilityPct = avgRange / avgPrice;

  const isHighVol = volatilityPct > 0.015; // >1.5% average range
  const isLowVol = volatilityPct < 0.008; // <0.8% average range

  // Check VWAP relationship
  const closeVsVwap = lastClose > vwap ? 'above' : lastClose < vwap ? 'below' : 'at';

  // Check if pulling back to VWAP (close within 0.3% of VWAP)
  const nearVwap = Math.abs(lastClose - vwap) / vwap < 0.003;

  // 1. Uptrend pullback to VWAP (DETERMINISTIC: false if no uptrend)
  const uptrendPullbackToVwap = isUptrend && nearVwap;

  // 2. Volatility + Direction combo (DETERMINISTIC: always has a value)
  let volatilityDirectionCombo: 'high_vol_bullish' | 'high_vol_bearish' | 'low_vol_drift_up' | 'low_vol_drift_down' | 'consolidation' | 'unknown';
  if (isHighVol && isUptrend) {
    volatilityDirectionCombo = 'high_vol_bullish';
  } else if (isHighVol && isDowntrend) {
    volatilityDirectionCombo = 'high_vol_bearish';
  } else if (isLowVol && isUptrend) {
    volatilityDirectionCombo = 'low_vol_drift_up';
  } else if (isLowVol && isDowntrend) {
    volatilityDirectionCombo = 'low_vol_drift_down';
  } else if (!isUptrend && !isDowntrend) {
    volatilityDirectionCombo = 'consolidation';
  } else {
    // High vol but no clear direction, or medium vol with trend
    volatilityDirectionCombo = isUptrend ? 'low_vol_drift_up' : isDowntrend ? 'low_vol_drift_down' : 'consolidation';
  }

  // 3. Tested and held support (DETERMINISTIC: computed from BB)
  const last5 = candles.slice(-5);
  const testedLower = last5.some(c => c.low <= bb.lower);
  const closedAbove = last5.every(c => c.close > bb.lower);
  const testedAndHeldSupport = testedLower && closedAbove;

  // 4. Breakout with volume (DETERMINISTIC: computed from BB and volume)
  const avgVolume = last10.reduce((sum, c) => sum + c.volume, 0) / last10.length;
  const brokeUpper = lastCandle.high > bb.upper;
  const highVolume = lastCandle.volume > avgVolume * 1.2; // 20% above average
  const breakoutWithVolume = brokeUpper && highVolume;

  // 5. Potential reversal at support (DETERMINISTIC: computed from BB)
  let potentialReversalAtSupport = false;
  if (candles.length >= 2) {
    const prevCandle = candles[candles.length - 2]!;
    const touchedSupport = prevCandle.low <= bb.lower;
    const bullishFollow = lastCandle.close > lastCandle.open;
    const closedHigher = lastCandle.close > prevCandle.close;
    potentialReversalAtSupport = touchedSupport && bullishFollow && closedHigher;
  }

  // 6. Overall bias (DETERMINISTIC: based on signal count)
  let bullishSignals = 0;
  let bearishSignals = 0;

  if (isUptrend) bullishSignals++;
  if (isDowntrend) bearishSignals++;
  if (closeVsVwap === 'above') bullishSignals++;
  if (closeVsVwap === 'below') bearishSignals++;
  if (testedAndHeldSupport) bullishSignals++;
  if (breakoutWithVolume) bullishSignals++;
  if (potentialReversalAtSupport) bullishSignals++;

  let overallBias: 'bullish' | 'mildly_bullish' | 'neutral' | 'mildly_bearish' | 'bearish' | 'unknown';
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
  };
}
