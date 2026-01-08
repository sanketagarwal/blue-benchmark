/**
 * Indicators API client for Replay Labs.
 * 
 * Fetches pre-computed indicator values instead of computing them ourselves.
 */

import { replayLabFetch } from './client.js';

export interface MACDData {
  macd: number;
  signal: number;
  histogram: number;
}

export interface SupertrendData {
  value: number;
  advice: 'long' | 'short' | 'neutral';
}

export interface StochRSIData {
  k: number;
  d: number;
}

export interface ReplayLabIndicators {
  /** RSI value (0-100) */
  rsi?: number;
  /** MACD data */
  macd?: MACDData;
  /** Average True Range */
  atr?: number;
  /** Bollinger Band Width (not upper/lower, just width) */
  bbw?: number;
  /** Average Directional Index */
  adx?: number;
  /** SuperTrend indicator */
  supertrend?: SupertrendData;
  /** Stochastic RSI */
  stoch_rsi?: StochRSIData;
  /** Chaikin Money Flow */
  cmf?: number;
  /** VWAP (from rolling_vwap) */
  vwap?: number;
  /** Realized volatility */
  realized_vol?: number;
}

interface RawIndicatorResponse {
  symbol_id: string;
  timeframe: string;
  timestamp?: string;
  indicators?: Array<{
    rsi?: number;
    macd?: { macd: number; signal: number; histogram: number };
    atr?: number;
    bbw?: number;
    adx?: number;
    supertrend?: { value: number; advice: string };
    stoch_rsi?: { k: number; d: number };
    cmf?: number;
    rolling_vwap?: { vwap: number };
    realized_vol?: number;
  }>;
  // Alternative response format
  rsi?: number;
  macd?: { macd: number; signal: number; histogram: number };
  atr?: number;
  bbw?: number;
  adx?: number;
  supertrend?: { value: number; advice: string };
  stoch_rsi?: { k: number; d: number };
  cmf?: number;
  rolling_vwap?: { vwap: number };
  realized_vol?: number;
}

/**
 * Fetch indicators from Replay Labs API.
 * 
 * @param symbolId - Trading symbol (e.g., "COINBASE_SPOT_BTC_USD")
 * @param timeframe - Candle timeframe (e.g., "1h", "4h")
 * @param timestamp - Point in time for indicators (optional, defaults to latest)
 */
export async function getIndicators(
  symbolId: string,
  timeframe: string,
  timestamp?: Date
): Promise<ReplayLabIndicators> {
  let path = `/api/indicators/${symbolId}?timeframe=${timeframe}`;
  
  if (timestamp) {
    path += `&from=${timestamp.toISOString()}&limit=1`;
  }

  try {
    const response = await replayLabFetch<RawIndicatorResponse>(path);
    
    // Handle different response formats
    const data = response.indicators?.[0] ?? response;
    
    return {
      rsi: data.rsi,
      macd: data.macd ? {
        macd: data.macd.macd,
        signal: data.macd.signal,
        histogram: data.macd.histogram,
      } : undefined,
      atr: data.atr,
      bbw: data.bbw,
      adx: data.adx,
      supertrend: data.supertrend ? {
        value: data.supertrend.value,
        advice: data.supertrend.advice as 'long' | 'short' | 'neutral',
      } : undefined,
      stoch_rsi: data.stoch_rsi ? {
        k: data.stoch_rsi.k,
        d: data.stoch_rsi.d,
      } : undefined,
      cmf: data.cmf,
      vwap: data.rolling_vwap?.vwap,
      realized_vol: data.realized_vol,
    };
  } catch (error) {
    // Indicators API may not be available for all symbols/timeframes
    console.warn(`Failed to fetch indicators: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

/**
 * Check if VWAP is available from Replay Labs.
 */
export function hasVWAP(indicators: ReplayLabIndicators): boolean {
  return indicators.vwap !== undefined && indicators.vwap !== null;
}

