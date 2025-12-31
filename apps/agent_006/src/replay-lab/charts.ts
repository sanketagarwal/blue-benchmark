import {
  TIMEFRAME_IDS,
  getTimeframeConfig,
} from '../timeframe-config.js';

import { replayLabFetch } from './client.js';

import type { TimeframeId } from '../timeframe-config.js';

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

// Chartable layers (per API spec): candles, sma, ema, bb, vwap, volume
const CHART_LAYERS = 'candles,sma:20,ema:20,bb:20:2,vwap,volume';

export async function getSignedChartUrl(params: ChartParams): Promise<string> {
  const width = params.width ?? 1200;
  const height = params.height ?? 800;

  // Build the chart path (relative URL)
  const chartPath = `/api/charts/${params.symbolId}/image?timeframe=${params.timeframe}&from=${params.from.toISOString()}&to=${params.to.toISOString()}&layers=${params.layers}&width=${String(width)}&height=${String(height)}`;

  // Request signed URL from API
  const response = await replayLabFetch<SignedUrlResponse>('/api/signed-url', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      path: chartPath,
      expiresIn: 3600,
    }),
  });

  return response.url;
}

export interface ForecastingCharts {
  chartByHorizon: Record<TimeframeId, string>;
}

export async function getForecastingCharts(
  symbolId: string,
  snapTime: Date
): Promise<ForecastingCharts> {
  const chartPromises = TIMEFRAME_IDS.map(async (timeframeId) => {
    const config = getTimeframeConfig(timeframeId);
    const rangeMs = config.chart.range.fromMinutesAgo * 60_000;
    const fromTime = new Date(snapTime.getTime() - rangeMs);
    const timeframe = config.chart.barTimeframe; // Direct access, no helper needed

    const url = await getSignedChartUrl({
      symbolId,
      timeframe,
      from: fromTime,
      to: snapTime,
      layers: CHART_LAYERS,
    });

    return [timeframeId, url] as const;
  });

  const results = await Promise.all(chartPromises);
  const chartByHorizon = Object.fromEntries(results) as Record<
    TimeframeId,
    string
  >;

  return { chartByHorizon };
}
