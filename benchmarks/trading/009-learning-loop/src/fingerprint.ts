/**
 * Indicator Fingerprinting for Chart Similarity
 * 
 * Creates simplified "fingerprints" of chart conditions using Replay Labs indicators.
 * Much faster than computing full ground truth, and more likely to find matches.
 */

import { getIndicators, type ReplayLabIndicators } from './replay-lab/indicators.js';
import { getCandles, type CandleTimeframe, type Candle } from './replay-lab/ohlcv.js';
import { getRegime, getLocalExtrema, type RegimeAnnotation, type LocalExtremaAnnotation } from './replay-lab/annotations.js';

// ============================================================================
// Fingerprint Types
// ============================================================================

export type RSICategory = 'oversold' | 'neutral' | 'overbought';
export type TrendDirection = 'bullish' | 'bearish' | 'neutral';
export type VolatilityCategory = 'compressed' | 'normal' | 'expanded';
export type MomentumCategory = 'bullish' | 'bearish' | 'neutral';
export type RegimeCategory = 'trending_up' | 'trending_down' | 'ranging' | 'volatile' | 'unknown';
export type PriceLocation = 'above_vwap' | 'at_vwap' | 'below_vwap' | 'unknown';

export interface ChartFingerprint {
  // From indicators API
  rsi: RSICategory;
  trend: TrendDirection;
  volatility: VolatilityCategory;
  momentum: MomentumCategory;
  priceVsVwap: PriceLocation;
  
  // From annotations API
  regime: RegimeCategory;
  hasRecentSupport: boolean;  // Local bottom in visible range
  hasRecentResistance: boolean;  // Local top in visible range
  
  // From price action
  priceNearHigh: boolean;  // Price within 2% of recent high
  priceNearLow: boolean;   // Price within 2% of recent low
  
  // Raw values (for debugging)
  _raw?: {
    rsi?: number;
    bbw?: number;
    macdHistogram?: number;
    vwap?: number;
    lastClose?: number;
    recentHigh?: number;
    recentLow?: number;
  };
}

export interface FingerprintMatch {
  score: number;  // 0-10, how many fields match
  matchedFields: string[];
  mismatchedFields: string[];
}

// ============================================================================
// Fingerprint Creation
// ============================================================================

/**
 * Categorize RSI value
 */
function categorizeRSI(rsi: number | undefined): RSICategory {
  if (rsi === undefined) return 'neutral';
  if (rsi < 30) return 'oversold';
  if (rsi > 70) return 'overbought';
  return 'neutral';
}

/**
 * Categorize trend from SuperTrend or price action
 */
function categorizeTrend(
  supertrendAdvice: string | undefined,
  candles: Candle[]
): TrendDirection {
  // Use SuperTrend if available
  if (supertrendAdvice === 'long') return 'bullish';
  if (supertrendAdvice === 'short') return 'bearish';
  
  // Fallback to simple price action
  if (candles.length < 5) return 'neutral';
  
  const recentCandles = candles.slice(-5);
  const firstClose = recentCandles[0]?.close ?? 0;
  const lastClose = recentCandles[recentCandles.length - 1]?.close ?? 0;
  
  const changePct = (lastClose - firstClose) / firstClose;
  if (changePct > 0.01) return 'bullish';  // >1% up
  if (changePct < -0.01) return 'bearish'; // >1% down
  return 'neutral';
}

/**
 * Categorize volatility from BBW (Bollinger Band Width)
 */
function categorizeVolatility(bbw: number | undefined): VolatilityCategory {
  if (bbw === undefined) return 'normal';
  // BBW is typically 0.01-0.10 for crypto
  if (bbw < 0.025) return 'compressed';
  if (bbw > 0.06) return 'expanded';
  return 'normal';
}

/**
 * Categorize momentum from MACD histogram
 */
function categorizeMomentum(macdHistogram: number | undefined): MomentumCategory {
  if (macdHistogram === undefined) return 'neutral';
  if (macdHistogram > 50) return 'bullish';   // Positive histogram
  if (macdHistogram < -50) return 'bearish';  // Negative histogram
  return 'neutral';
}

/**
 * Categorize price location relative to VWAP
 */
function categorizePriceVsVwap(
  lastClose: number | undefined,
  vwap: number | undefined
): PriceLocation {
  if (lastClose === undefined || vwap === undefined) return 'unknown';
  
  const distance = (lastClose - vwap) / vwap;
  if (distance > 0.003) return 'above_vwap';  // >0.3% above
  if (distance < -0.003) return 'below_vwap'; // >0.3% below
  return 'at_vwap';
}

/**
 * Convert regime annotation to category
 */
function categorizeRegime(regimes: RegimeAnnotation[]): RegimeCategory {
  if (regimes.length === 0) return 'unknown';
  
  // Get most recent regime
  const sorted = [...regimes].sort((a, b) => 
    new Date(b.time_start).getTime() - new Date(a.time_start).getTime()
  );
  const latest = sorted[0];
  
  const regimeType = latest?.payload.regime_type;
  if (regimeType === 'trending_up') return 'trending_up';
  if (regimeType === 'trending_down') return 'trending_down';
  if (regimeType === 'ranging_tight' || regimeType === 'ranging_wide') return 'ranging';
  if (regimeType === 'volatile_chop' || regimeType === 'capitulation') return 'volatile';
  return 'unknown';
}

/**
 * Check if price is near recent high/low
 */
function checkPriceLocation(candles: Candle[]): { nearHigh: boolean; nearLow: boolean; high: number; low: number } {
  if (candles.length === 0) return { nearHigh: false, nearLow: false, high: 0, low: 0 };
  
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const recentHigh = Math.max(...highs);
  const recentLow = Math.min(...lows);
  const lastClose = candles[candles.length - 1]?.close ?? 0;
  
  const distFromHigh = (recentHigh - lastClose) / recentHigh;
  const distFromLow = (lastClose - recentLow) / recentLow;
  
  return {
    nearHigh: distFromHigh < 0.02,  // Within 2% of high
    nearLow: distFromLow < 0.02,    // Within 2% of low
    high: recentHigh,
    low: recentLow,
  };
}

/**
 * Create a fingerprint for a chart at a specific time
 * 
 * Note: Due to Replay Labs JIT budget limits, we minimize API calls and
 * compute most indicators locally from candle data.
 */
export async function createFingerprint(
  symbolId: string,
  timeframe: CandleTimeframe,
  from: Date,
  to: Date
): Promise<ChartFingerprint> {
  // Fetch only essential data - candles first (required)
  let candles: Candle[] = [];
  try {
    candles = await getCandles(symbolId, timeframe, from, to, 50);
  } catch (error) {
    // If candles fail, return default fingerprint
    console.warn(`    ⚠️ Failed to fetch candles: ${error instanceof Error ? error.message : String(error)}`);
    return createDefaultFingerprint();
  }
  
  if (candles.length < 10) {
    return createDefaultFingerprint();
  }
  
  // Try to get annotations (optional, may hit rate limits)
  let extrema: LocalExtremaAnnotation[] = [];
  let regimes: RegimeAnnotation[] = [];
  try {
    extrema = await getLocalExtrema(symbolId, from, to);
  } catch {
    // Annotations are optional - continue without them
  }
  try {
    regimes = await getRegime(symbolId, from, to);
  } catch {
    // Regimes are optional - continue without them
  }
  
  // Compute indicators locally from candles (no API call needed)
  const localIndicators = computeLocalIndicators(candles);
  
  const lastClose = candles[candles.length - 1]?.close;
  const priceLocation = checkPriceLocation(candles);
  
  // Check for recent support/resistance
  const hasRecentSupport = extrema.some(e => e.payload.kind === 'bottom');
  const hasRecentResistance = extrema.some(e => e.payload.kind === 'top');
  
  return {
    rsi: categorizeRSI(localIndicators.rsi),
    trend: categorizeTrend(undefined, candles), // Use price action only
    volatility: categorizeVolatility(localIndicators.bbw),
    momentum: categorizeMomentum(localIndicators.macdHistogram),
    priceVsVwap: categorizePriceVsVwap(lastClose, localIndicators.vwap),
    regime: categorizeRegime(regimes),
    hasRecentSupport,
    hasRecentResistance,
    priceNearHigh: priceLocation.nearHigh,
    priceNearLow: priceLocation.nearLow,
    _raw: {
      rsi: localIndicators.rsi,
      bbw: localIndicators.bbw,
      macdHistogram: localIndicators.macdHistogram,
      vwap: localIndicators.vwap,
      lastClose,
      recentHigh: priceLocation.high,
      recentLow: priceLocation.low,
    },
  };
}

/**
 * Compute indicators locally from candle data
 */
function computeLocalIndicators(candles: Candle[]): {
  rsi?: number;
  bbw?: number;
  macdHistogram?: number;
  vwap?: number;
} {
  if (candles.length < 14) {
    return {};
  }
  
  // RSI (14-period)
  const rsi = computeRSI(candles, 14);
  
  // Bollinger Band Width (20-period, 2 std)
  const bbw = computeBBW(candles, 20);
  
  // Simple MACD histogram approximation
  const macdHistogram = computeSimpleMomentum(candles);
  
  // VWAP
  const vwap = computeVWAP(candles);
  
  return { rsi, bbw, macdHistogram, vwap };
}

/**
 * Compute RSI from candles
 */
function computeRSI(candles: Candle[], period: number): number | undefined {
  if (candles.length < period + 1) return undefined;
  
  const changes = candles.slice(-period - 1).map((c, i, arr) => 
    i > 0 ? c.close - arr[i - 1]!.close : 0
  ).slice(1);
  
  const gains = changes.filter(c => c > 0);
  const losses = changes.filter(c => c < 0).map(c => Math.abs(c));
  
  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Compute Bollinger Band Width
 */
function computeBBW(candles: Candle[], period: number): number | undefined {
  if (candles.length < period) return undefined;
  
  const closes = candles.slice(-period).map(c => c.close);
  const sma = closes.reduce((a, b) => a + b, 0) / period;
  const variance = closes.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  
  // BBW = (Upper - Lower) / Middle = 4 * stdDev / sma
  return (4 * stdDev) / sma;
}

/**
 * Compute simple momentum (approximation of MACD histogram)
 */
function computeSimpleMomentum(candles: Candle[]): number | undefined {
  if (candles.length < 26) return undefined;
  
  const closes = candles.map(c => c.close);
  const ema12 = computeEMA(closes.slice(-12), 12);
  const ema26 = computeEMA(closes.slice(-26), 26);
  
  if (ema12 === undefined || ema26 === undefined) return undefined;
  
  // Scale by price to make it comparable
  const macdLine = ema12 - ema26;
  return macdLine; // Positive = bullish momentum, negative = bearish
}

/**
 * Simple EMA calculation
 */
function computeEMA(values: number[], period: number): number | undefined {
  if (values.length < period) return undefined;
  
  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < values.length; i++) {
    ema = (values[i]! - ema) * multiplier + ema;
  }
  
  return ema;
}

/**
 * Compute VWAP
 */
function computeVWAP(candles: Candle[]): number | undefined {
  const totalVolume = candles.reduce((sum, c) => sum + c.volume, 0);
  if (totalVolume === 0) return undefined;
  
  const vwap = candles.reduce((sum, c) => 
    sum + ((c.high + c.low + c.close) / 3) * c.volume, 0
  ) / totalVolume;
  
  return vwap;
}

/**
 * Create a default fingerprint when data is unavailable
 */
function createDefaultFingerprint(): ChartFingerprint {
  return {
    rsi: 'neutral',
    trend: 'neutral',
    volatility: 'normal',
    momentum: 'neutral',
    priceVsVwap: 'unknown',
    regime: 'unknown',
    hasRecentSupport: false,
    hasRecentResistance: false,
    priceNearHigh: false,
    priceNearLow: false,
  };
}

// ============================================================================
// Fingerprint Matching
// ============================================================================

/**
 * Compare two fingerprints and return match details
 */
export function compareFingerprints(
  target: ChartFingerprint,
  candidate: ChartFingerprint
): FingerprintMatch {
  const matchedFields: string[] = [];
  const mismatchedFields: string[] = [];
  
  // Compare each field
  const fields: Array<{ name: string; match: boolean }> = [
    { name: 'rsi', match: target.rsi === candidate.rsi },
    { name: 'trend', match: target.trend === candidate.trend },
    { name: 'volatility', match: target.volatility === candidate.volatility },
    { name: 'momentum', match: target.momentum === candidate.momentum },
    { name: 'priceVsVwap', match: target.priceVsVwap === candidate.priceVsVwap },
    { name: 'regime', match: target.regime === candidate.regime },
    { name: 'hasRecentSupport', match: target.hasRecentSupport === candidate.hasRecentSupport },
    { name: 'hasRecentResistance', match: target.hasRecentResistance === candidate.hasRecentResistance },
    { name: 'priceNearHigh', match: target.priceNearHigh === candidate.priceNearHigh },
    { name: 'priceNearLow', match: target.priceNearLow === candidate.priceNearLow },
  ];
  
  for (const field of fields) {
    if (field.match) {
      matchedFields.push(field.name);
    } else {
      mismatchedFields.push(field.name);
    }
  }
  
  return {
    score: matchedFields.length,
    matchedFields,
    mismatchedFields,
  };
}

/**
 * Check if fingerprints match with minimum score
 */
export function fingerprintsMatch(
  target: ChartFingerprint,
  candidate: ChartFingerprint,
  minScore = 6
): boolean {
  const { score } = compareFingerprints(target, candidate);
  return score >= minScore;
}

// ============================================================================
// Similarity Search
// ============================================================================

export interface SimilarChartByFingerprint {
  from: Date;
  to: Date;
  fingerprint: ChartFingerprint;
  matchScore: number;
  matchedFields: string[];
}

/**
 * Small delay to help with API rate limiting
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if a fingerprint is a "default" (failed) fingerprint
 */
function isDefaultFingerprint(fp: ChartFingerprint): boolean {
  return fp.trend === 'neutral' && 
         fp.priceVsVwap === 'unknown' && 
         fp.regime === 'unknown' &&
         !fp.hasRecentSupport && 
         !fp.hasRecentResistance;
}

/**
 * Find charts with similar fingerprints
 * 
 * Note: Uses delays and error handling to work within Replay Labs API limits
 */
export async function findSimilarByFingerprint(
  targetFingerprint: ChartFingerprint,
  symbolId: string,
  timeframe: CandleTimeframe,
  searchRange: { startDate: Date; endDate: Date },
  minMatchScore = 6,
  maxResults = 5
): Promise<SimilarChartByFingerprint[]> {
  const results: SimilarChartByFingerprint[] = [];
  let consecutiveFailures = 0;
  const maxConsecutiveFailures = 5;
  
  // Calculate chart duration
  const tfMinutes: Record<CandleTimeframe, number> = {
    '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440,
  };
  const candlesPerChart = 30;
  const chartDurationMs = candlesPerChart * tfMinutes[timeframe] * 60 * 1000;
  
  // Sample points within the search range - use larger intervals to avoid rate limits
  const rangeMs = searchRange.endDate.getTime() - searchRange.startDate.getTime();
  const sampleInterval = chartDurationMs * 2; // Sparser sampling to reduce API calls
  const numSamples = Math.min(50, Math.floor(rangeMs / sampleInterval));
  
  console.log(`    🔍 Searching ${numSamples} sample points for similar fingerprints...`);
  
  for (let i = 0; i < numSamples && results.length < maxResults; i++) {
    // Stop if we hit too many consecutive failures (likely rate limited)
    if (consecutiveFailures >= maxConsecutiveFailures) {
      console.log(`    ⚠️ Stopping search after ${maxConsecutiveFailures} consecutive failures (API rate limit)`);
      break;
    }
    
    const offsetMs = i * sampleInterval;
    const toTime = new Date(searchRange.endDate.getTime() - offsetMs);
    const fromTime = new Date(toTime.getTime() - chartDurationMs);
    
    try {
      // Add small delay between API calls
      if (i > 0) {
        await delay(100); // 100ms between calls
      }
      
      const candidateFingerprint = await createFingerprint(symbolId, timeframe, fromTime, toTime);
      
      // Skip default fingerprints (failed to fetch data)
      if (isDefaultFingerprint(candidateFingerprint)) {
        consecutiveFailures++;
        continue;
      }
      
      consecutiveFailures = 0; // Reset on success
      const match = compareFingerprints(targetFingerprint, candidateFingerprint);
      
      if (match.score >= minMatchScore) {
        results.push({
          from: fromTime,
          to: toTime,
          fingerprint: candidateFingerprint,
          matchScore: match.score,
          matchedFields: match.matchedFields,
        });
        console.log(`    ✅ Found match at ${fromTime.toISOString().slice(0, 10)} (score: ${match.score}/10)`);
      }
    } catch (error) {
      consecutiveFailures++;
      // Skip this sample point on error
      continue;
    }
    
    // Progress indicator every 10 samples
    if (i > 0 && i % 10 === 0) {
      console.log(`    ... checked ${i}/${numSamples} samples, found ${results.length} matches`);
    }
  }
  
  // Sort by match score (highest first)
  return results.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Get a human-readable description of a fingerprint
 */
export function describeFingerprint(fp: ChartFingerprint): string {
  const parts: string[] = [];
  
  // Trend and momentum
  if (fp.trend === 'bullish') parts.push('📈 Bullish trend');
  else if (fp.trend === 'bearish') parts.push('📉 Bearish trend');
  else parts.push('➡️ Sideways');
  
  // RSI
  if (fp.rsi === 'oversold') parts.push('🔵 RSI oversold');
  else if (fp.rsi === 'overbought') parts.push('🔴 RSI overbought');
  
  // Volatility
  if (fp.volatility === 'compressed') parts.push('🔒 Low volatility');
  else if (fp.volatility === 'expanded') parts.push('💥 High volatility');
  
  // Price location
  if (fp.priceVsVwap === 'above_vwap') parts.push('⬆️ Above VWAP');
  else if (fp.priceVsVwap === 'below_vwap') parts.push('⬇️ Below VWAP');
  
  // Support/Resistance
  if (fp.hasRecentSupport) parts.push('🟢 Has support');
  if (fp.hasRecentResistance) parts.push('🔴 Has resistance');
  
  // Price extremes
  if (fp.priceNearHigh) parts.push('🔝 Near high');
  if (fp.priceNearLow) parts.push('🔻 Near low');
  
  return parts.join(' | ');
}
