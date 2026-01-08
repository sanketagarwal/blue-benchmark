/**
 * Chart image fetching from Replay Labs API.
 *
 * Simplified version for single-chart extraction (no multi-horizon like 006).
 */
import { replayLabFetch } from './client.js';

export interface ChartParams {
  symbolId: string;
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  from: Date;
  to: Date;
  layers: string;
  width?: number;
  height?: number;
}

interface SignedUrlResponse {
  url: string;
  expiresAt: string;
}

/**
 * Standard chart layers for the benchmark.
 * Includes: candles, SMA(20), EMA(20), BB(20,2), VWAP, volume
 */
export const STANDARD_CHART_LAYERS = 'candles,sma:20,ema:20,bb:20:2,vwap,volume';

/**
 * Get a signed URL for a chart image.
 * @param params - Chart parameters including symbol, timeframe, and date range
 * @returns Signed URL for the chart image
 */
export async function getSignedChartUrl(params: ChartParams): Promise<string> {
  const width = params.width ?? 900;
  const height = params.height ?? 600;

  const chartPath = `/api/charts/${params.symbolId}/image?timeframe=${params.timeframe}&from=${params.from.toISOString()}&to=${params.to.toISOString()}&layers=${params.layers}&width=${String(width)}&height=${String(height)}`;

  const response = await replayLabFetch<SignedUrlResponse>('/api/signed-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: chartPath, expiresIn: 3600 }),
  });

  return response.url;
}

/**
 * Fetch a chart image as bytes.
 * @param params - Chart parameters including symbol, timeframe, and date range
 * @returns Chart image as a Uint8Array
 */
export async function getChartImageBytes(
  params: ChartParams
): Promise<Uint8Array> {
  const url = await getSignedChartUrl(params);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch chart image: ${String(response.status)} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

