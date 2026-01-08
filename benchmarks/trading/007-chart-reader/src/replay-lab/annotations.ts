/**
 * Annotations API client for Replay Labs.
 * 
 * Fetches pre-computed annotations instead of computing ground truth ourselves.
 */
import { replayLabFetch } from './client.js';

// ============================================================================
// Types based on ANNOTATION_SPEC.md
// ============================================================================

export interface AnnotationBase {
  id: string;
  type: string;
  source: string;
  time_start: string;
  time_end?: string;
  _meta?: {
    created_at: string;
    annotator_version: string;
    confidence: number;
    validation_status: string;
    human_reviewed: boolean;
  };
}

// Local extrema (swing highs/lows)
export interface LocalExtremaPayload {
  kind: 'top' | 'bottom';
  method: string;
  price: number;
  candleTimeframe: string;
  params?: {
    deviationPct?: number;
    minBarsBetweenPivots?: number;
  };
  availability?: {
    availableAt: string;
    futureBarsUsed: number;
    mode: string;
  };
}

export interface LocalExtremaAnnotation extends AnnotationBase {
  type: 'local_extrema';
  payload: LocalExtremaPayload;
}

// Regime (trending, ranging, volatile)
export interface RegimePayload {
  regime_type: 'trending_up' | 'trending_down' | 'ranging_tight' | 'ranging_wide' | 'volatile_chop' | 'capitulation';
}

export interface RegimeAnnotation extends AnnotationBase {
  type: 'regime';
  payload: RegimePayload;
}

// Volatility spike
export interface VolSpikePayload {
  z_score: number;
  realized_vol: number;
}

export interface VolSpikeAnnotation extends AnnotationBase {
  type: 'vol_spike';
  payload: VolSpikePayload;
}

// Indicator signal
export interface IndicatorSignalPayload {
  indicator: string;  // "rsi", "macd", "supertrend", "vwap", "bb"
  signal_type: string;  // "oversold", "overbought", "bullish_cross", etc.
  signal_value: number;
  price_at_signal: number;
  outcome_5m_pct?: number;
  outcome_15m_pct?: number;
  outcome_1h_pct?: number;
  signal_success?: boolean;
}

export interface IndicatorSignalAnnotation extends AnnotationBase {
  type: 'indicator_signal';
  payload: IndicatorSignalPayload;
}

// Volatility compression
export interface VolCompressionPayload {
  compression_level: number;
  duration_minutes: number;
  bbw_value: number;
  atr_value: number;
  subsequent_vol_spike: boolean;
  spike_direction: 'up' | 'down' | null;
}

export interface VolCompressionAnnotation extends AnnotationBase {
  type: 'vol_compression';
  payload: VolCompressionPayload;
}

// Union type for all annotations
export type Annotation = 
  | LocalExtremaAnnotation 
  | RegimeAnnotation 
  | VolSpikeAnnotation 
  | IndicatorSignalAnnotation
  | VolCompressionAnnotation
  | AnnotationBase;

// ============================================================================
// API Response types
// ============================================================================

interface AnnotationsResponse {
  annotations: Annotation[];
  total: number;
  limit: number;
  offset: number;
}

interface AnnotatorsResponse {
  annotators: Array<{
    name: string;
    type: string;
    description: string;
    parameters?: Record<string, unknown>;
    coverage?: {
      symbols: string[];
      from: string;
      to: string;
    };
  }>;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch annotations for a symbol within a time range.
 * @param symbolId - Trading symbol identifier
 * @param types - Array of annotation types to fetch (e.g., ['local_extrema', 'regime'])
 * @param from - Start of time range
 * @param to - End of time range
 * @param source - Optional specific annotator source
 * @returns Array of annotations
 */
export async function getAnnotations(
  symbolId: string,
  types: string[],
  from: Date,
  to: Date,
  source?: string,
  limit = 1000
): Promise<Annotation[]> {
  const typeParam = types.join(',');
  const fromTime = from.toISOString();
  const toTime = to.toISOString();

  let path = `/api/annotations/${symbolId}?type=${typeParam}&from=${fromTime}&to=${toTime}&limit=${String(limit)}`;
  
  if (source) {
    path += `&source=${source}`;
  }

  const response = await replayLabFetch<AnnotationsResponse>(path);
  return response.annotations;
}

/**
 * List available annotators.
 * @param type - Optional filter by annotation type
 * @returns Array of available annotators
 */
export async function listAnnotators(type?: string): Promise<AnnotatorsResponse['annotators']> {
  let path = '/api/annotators';
  if (type) {
    path += `?type=${type}`;
  }
  
  const response = await replayLabFetch<AnnotatorsResponse>(path);
  return response.annotators;
}

/**
 * Get local extrema (swing highs/lows) for a symbol.
 */
export async function getLocalExtrema(
  symbolId: string,
  from: Date,
  to: Date,
  source?: string
): Promise<LocalExtremaAnnotation[]> {
  const annotations = await getAnnotations(symbolId, ['local_extrema'], from, to, source);
  return annotations.filter((a): a is LocalExtremaAnnotation => a.type === 'local_extrema');
}

/**
 * Get regime annotations for a symbol.
 */
export async function getRegime(
  symbolId: string,
  from: Date,
  to: Date
): Promise<RegimeAnnotation[]> {
  const annotations = await getAnnotations(symbolId, ['regime'], from, to);
  return annotations.filter((a): a is RegimeAnnotation => a.type === 'regime');
}

/**
 * Get indicator signals for a symbol.
 */
export async function getIndicatorSignals(
  symbolId: string,
  from: Date,
  to: Date,
  indicator?: string
): Promise<IndicatorSignalAnnotation[]> {
  const annotations = await getAnnotations(symbolId, ['indicator_signal'], from, to);
  const signals = annotations.filter((a): a is IndicatorSignalAnnotation => a.type === 'indicator_signal');
  
  if (indicator) {
    return signals.filter(s => s.payload.indicator === indicator);
  }
  return signals;
}

/**
 * Get volatility-related annotations (spikes and compressions).
 */
export async function getVolatilityAnnotations(
  symbolId: string,
  from: Date,
  to: Date
): Promise<(VolSpikeAnnotation | VolCompressionAnnotation)[]> {
  const annotations = await getAnnotations(symbolId, ['vol_spike', 'vol_compression'], from, to);
  return annotations.filter((a): a is VolSpikeAnnotation | VolCompressionAnnotation => 
    a.type === 'vol_spike' || a.type === 'vol_compression'
  );
}

// ============================================================================
// Helper functions to extract ground truth from annotations
// ============================================================================

/**
 * Find the most recent support level (local bottom) before a given time.
 */
export function findRecentSupport(
  extrema: LocalExtremaAnnotation[],
  beforeTime: Date
): LocalExtremaAnnotation | undefined {
  const bottoms = extrema
    .filter(e => e.payload.kind === 'bottom')
    .filter(e => new Date(e.time_start) < beforeTime)
    .sort((a, b) => new Date(b.time_start).getTime() - new Date(a.time_start).getTime());
  
  return bottoms[0];
}

/**
 * Find the most recent resistance level (local top) before a given time.
 */
export function findRecentResistance(
  extrema: LocalExtremaAnnotation[],
  beforeTime: Date
): LocalExtremaAnnotation | undefined {
  const tops = extrema
    .filter(e => e.payload.kind === 'top')
    .filter(e => new Date(e.time_start) < beforeTime)
    .sort((a, b) => new Date(b.time_start).getTime() - new Date(a.time_start).getTime());
  
  return tops[0];
}

/**
 * Get the current regime at a given time.
 */
export function getRegimeAtTime(
  regimes: RegimeAnnotation[],
  atTime: Date
): RegimeAnnotation | undefined {
  // Find regime that covers this time
  const sorted = regimes.sort((a, b) => 
    new Date(b.time_start).getTime() - new Date(a.time_start).getTime()
  );
  
  return sorted.find(r => new Date(r.time_start) <= atTime);
}

