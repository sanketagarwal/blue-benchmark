/**
 * Similar Chart Finder
 * 
 * Finds charts with matching pattern conditions for transfer learning tests.
 * 
 * Two approaches:
 * 1. Ground Truth Matching: Uses full ground truth computation (slower, more accurate)
 * 2. Fingerprint Matching: Uses indicator fingerprints (faster, more matches)
 */

import { getSignedChartUrl, STANDARD_CHART_LAYERS } from './replay-lab/charts.js';
import { getCandles, type CandleTimeframe, type Candle } from './replay-lab/ohlcv.js';
import { getLocalExtrema } from './replay-lab/annotations.js';
import { computeGroundTruth, type GroundTruthInput, type ChartMeta, type IndicatorValues } from './ground-truth/index.js';
import type { ChartReadingOutput } from './output-schema.js';
import { 
  createFingerprint, 
  findSimilarByFingerprint, 
  describeFingerprint,
  type ChartFingerprint 
} from './fingerprint.js';

export interface ChartConditions {
  uptrendPullbackToVwap: boolean;
  volatilityDirectionCombo: string;
  testedAndHeldSupport: boolean;
  breakoutWithVolume: boolean;
  potentialReversalAtSupport: boolean;
  overallBias: string;
}

export interface SimilarChartResult {
  chartUrl: string;
  timeframe: CandleTimeframe;
  from: Date;
  to: Date;
  groundTruth: ChartReadingOutput;
  candles: Candle[];
  matchScore: number; // 0-6, how many fields match
  matchedFields: string[];
}

function timeframeToMinutes(tf: CandleTimeframe): number {
  const map: Record<CandleTimeframe, number> = {
    '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440,
  };
  return map[tf];
}

function computeIndicators(candles: Candle[]): IndicatorValues {
  if (candles.length === 0) {
    return { vwap: null, bb_upper: null, bb_lower: null, bb_mid: null, sma20: null, ema20: null };
  }

  const last20 = candles.slice(-20);
  const sma20 = last20.length >= 20
    ? last20.reduce((sum, c) => sum + c.close, 0) / 20
    : null;

  const ema20 = sma20;

  const totalVolume = candles.reduce((sum, c) => sum + c.volume, 0);
  const vwap = totalVolume > 0
    ? candles.reduce((sum, c) => sum + ((c.high + c.low + c.close) / 3) * c.volume, 0) / totalVolume
    : null;

  let bb_upper: number | null = null;
  let bb_lower: number | null = null;
  let bb_mid: number | null = null;

  if (sma20 !== null && last20.length >= 20) {
    const stdDev = Math.sqrt(
      last20.reduce((sum, c) => sum + Math.pow(c.close - sma20, 2), 0) / 20
    );
    bb_mid = sma20;
    bb_upper = sma20 + 2 * stdDev;
    bb_lower = sma20 - 2 * stdDev;
  }

  return { vwap, bb_upper, bb_lower, bb_mid, sma20, ema20 };
}

/**
 * Extract pattern conditions from a ground truth output
 */
export function extractConditions(gt: ChartReadingOutput): ChartConditions {
  return {
    uptrendPullbackToVwap: gt.multi_step.uptrend_pullback_to_vwap,
    volatilityDirectionCombo: gt.multi_step.volatility_direction_combo,
    testedAndHeldSupport: gt.multi_step.tested_and_held_support,
    breakoutWithVolume: gt.multi_step.breakout_with_volume,
    potentialReversalAtSupport: gt.multi_step.potential_reversal_at_support,
    overallBias: gt.multi_step.overall_bias,
  };
}

/**
 * Calculate how many fields match between two condition sets
 */
export function calculateMatchScore(
  target: ChartConditions,
  candidate: ChartConditions
): { score: number; matchedFields: string[] } {
  const matchedFields: string[] = [];
  
  if (target.uptrendPullbackToVwap === candidate.uptrendPullbackToVwap) {
    matchedFields.push('uptrend_pullback_to_vwap');
  }
  if (target.volatilityDirectionCombo === candidate.volatilityDirectionCombo) {
    matchedFields.push('volatility_direction_combo');
  }
  if (target.testedAndHeldSupport === candidate.testedAndHeldSupport) {
    matchedFields.push('tested_and_held_support');
  }
  if (target.breakoutWithVolume === candidate.breakoutWithVolume) {
    matchedFields.push('breakout_with_volume');
  }
  if (target.potentialReversalAtSupport === candidate.potentialReversalAtSupport) {
    matchedFields.push('potential_reversal_at_support');
  }
  if (target.overallBias === candidate.overallBias) {
    matchedFields.push('overall_bias');
  }
  
  return { score: matchedFields.length, matchedFields };
}

/**
 * Find charts with similar pattern conditions
 * 
 * @param targetConditions - The conditions to match
 * @param symbolId - Symbol to search
 * @param timeframe - Timeframe to search
 * @param searchRange - How far back to search (in days)
 * @param minMatchScore - Minimum number of fields that must match (default: 4)
 * @param maxResults - Maximum number of results to return
 */
export async function findSimilarCharts(
  targetConditions: ChartConditions,
  symbolId: string,
  timeframe: CandleTimeframe,
  searchRange: { startDate: Date; endDate: Date },
  minMatchScore = 4,
  maxResults = 5
): Promise<SimilarChartResult[]> {
  const results: SimilarChartResult[] = [];
  const tfMinutes = timeframeToMinutes(timeframe);
  const candlesPerChart = 30;
  const chartDurationMs = candlesPerChart * tfMinutes * 60 * 1000;
  
  // Sample points within the search range
  const rangeMs = searchRange.endDate.getTime() - searchRange.startDate.getTime();
  const sampleInterval = chartDurationMs * 2; // Don't overlap charts too much
  const numSamples = Math.min(50, Math.floor(rangeMs / sampleInterval)); // Cap at 50 samples
  
  for (let i = 0; i < numSamples && results.length < maxResults; i++) {
    const offsetMs = i * sampleInterval;
    const toTime = new Date(searchRange.endDate.getTime() - offsetMs);
    const fromTime = new Date(toTime.getTime() - chartDurationMs);
    
    try {
      // Get candles
      const candles = await getCandles(
        symbolId,
        timeframe,
        fromTime,
        toTime,
        candlesPerChart + 10
      );
      
      if (candles.length < 20) continue;
      
      // Fetch annotations
      let localExtrema: Awaited<ReturnType<typeof getLocalExtrema>> = [];
      try {
        localExtrema = await getLocalExtrema(symbolId, fromTime, toTime);
      } catch {
        // Annotations are optional
      }
      
      // Compute ground truth
      const meta: ChartMeta = {
        base_quote: 'Bitcoin / U.S. Dollar',
        venue: 'Coinbase',
        timeframe,
      };
      
      const indicators = computeIndicators(candles);
      
      const groundTruthInput: GroundTruthInput = {
        candles,
        meta,
        indicators,
        timeframeMinutes: tfMinutes,
        localExtrema,
      };
      
      const groundTruth = computeGroundTruth(groundTruthInput);
      const candidateConditions = extractConditions(groundTruth);
      
      // Calculate match score
      const { score, matchedFields } = calculateMatchScore(targetConditions, candidateConditions);
      
      if (score >= minMatchScore) {
        // Get chart URL
        const chartUrl = await getSignedChartUrl({
          symbolId,
          timeframe,
          from: fromTime,
          to: toTime,
          layers: STANDARD_CHART_LAYERS,
        });
        
        results.push({
          chartUrl,
          timeframe,
          from: fromTime,
          to: toTime,
          groundTruth,
          candles,
          matchScore: score,
          matchedFields,
        });
      }
    } catch (error) {
      // Skip this sample point on error
      continue;
    }
  }
  
  // Sort by match score (highest first)
  return results.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Find a chart with exact matching conditions
 */
export async function findExactMatchChart(
  targetConditions: ChartConditions,
  symbolId: string,
  timeframe: CandleTimeframe,
  searchRange: { startDate: Date; endDate: Date },
  excludeTimeRanges?: Array<{ from: Date; to: Date }>
): Promise<SimilarChartResult | null> {
  const similar = await findSimilarCharts(
    targetConditions,
    symbolId,
    timeframe,
    searchRange,
    6, // All 6 fields must match
    10
  );
  
  // Filter out excluded time ranges
  const filtered = similar.filter(chart => {
    if (!excludeTimeRanges) return true;
    return !excludeTimeRanges.some(excluded => 
      chart.from >= excluded.from && chart.to <= excluded.to
    );
  });
  
  return filtered[0] ?? null;
}

// ============================================================================
// FINGERPRINT-BASED SIMILARITY (Method 2 - Faster)
// ============================================================================

export interface FingerprintSimilarChartResult {
  chartUrl: string;
  timeframe: CandleTimeframe;
  from: Date;
  to: Date;
  fingerprint: ChartFingerprint;
  groundTruth: ChartReadingOutput;
  candles: Candle[];
  matchScore: number;
  matchedFields: string[];
  description: string;
}

/**
 * Find similar charts using indicator fingerprints (faster than ground truth matching)
 * 
 * This method:
 * 1. Creates a fingerprint for the baseline chart
 * 2. Searches historical data for charts with similar fingerprints
 * 3. Only computes full ground truth for matching charts
 */
export async function findSimilarChartsByFingerprint(
  baselineFrom: Date,
  baselineTo: Date,
  symbolId: string,
  timeframe: CandleTimeframe,
  searchRange: { startDate: Date; endDate: Date },
  minMatchScore = 6,
  maxResults = 3
): Promise<FingerprintSimilarChartResult[]> {
  console.log(`  🔬 Using fingerprint-based similarity search...`);
  
  // Step 1: Create fingerprint for baseline chart
  console.log(`    Creating baseline fingerprint...`);
  const baselineFingerprint = await createFingerprint(symbolId, timeframe, baselineFrom, baselineTo);
  console.log(`    Baseline: ${describeFingerprint(baselineFingerprint)}`);
  
  // Step 2: Find charts with similar fingerprints
  const similarFingerprints = await findSimilarByFingerprint(
    baselineFingerprint,
    symbolId,
    timeframe,
    searchRange,
    minMatchScore,
    maxResults * 2 // Get extras in case some fail ground truth computation
  );
  
  if (similarFingerprints.length === 0) {
    console.log(`    ❌ No similar fingerprints found with score >= ${minMatchScore}`);
    return [];
  }
  
  console.log(`    Found ${similarFingerprints.length} fingerprint matches, computing ground truth...`);
  
  // Step 3: Compute ground truth for matching charts
  const results: FingerprintSimilarChartResult[] = [];
  const tfMinutes = timeframeToMinutes(timeframe);
  
  for (const match of similarFingerprints) {
    if (results.length >= maxResults) break;
    
    try {
      // Get candles
      const candles = await getCandles(symbolId, timeframe, match.from, match.to, 40);
      if (candles.length < 20) continue;
      
      // Get annotations
      let localExtrema: Awaited<ReturnType<typeof getLocalExtrema>> = [];
      try {
        localExtrema = await getLocalExtrema(symbolId, match.from, match.to);
      } catch {
        // Annotations are optional
      }
      
      // Compute ground truth
      const meta: ChartMeta = {
        base_quote: 'Bitcoin / U.S. Dollar',
        venue: 'Coinbase',
        timeframe,
      };
      
      const indicators = computeIndicators(candles);
      
      const groundTruthInput: GroundTruthInput = {
        candles,
        meta,
        indicators,
        timeframeMinutes: tfMinutes,
        localExtrema,
      };
      
      const groundTruth = computeGroundTruth(groundTruthInput);
      
      // Get chart URL
      const chartUrl = await getSignedChartUrl({
        symbolId,
        timeframe,
        from: match.from,
        to: match.to,
        layers: STANDARD_CHART_LAYERS,
      });
      
      results.push({
        chartUrl,
        timeframe,
        from: match.from,
        to: match.to,
        fingerprint: match.fingerprint,
        groundTruth,
        candles,
        matchScore: match.matchScore,
        matchedFields: match.matchedFields,
        description: describeFingerprint(match.fingerprint),
      });
      
      console.log(`    ✅ Added similar chart from ${match.from.toISOString().slice(0, 10)} (score: ${match.matchScore}/10)`);
    } catch (error) {
      console.log(`    ⚠️ Skipping chart: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
  }
  
  return results;
}

/**
 * Re-export fingerprint utilities for external use
 */
export { createFingerprint, describeFingerprint, type ChartFingerprint } from './fingerprint.js';
