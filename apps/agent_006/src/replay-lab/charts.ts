import { HORIZON_CHART_CONFIG } from '../horizon-config.js';

import { replayLabFetch } from './client.js';

import type { Horizon } from '../horizon-config.js';

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
  chartByHorizon: Record<Horizon, string>;
}

export async function getForecastingCharts(
  symbolId: string,
  snapTime: Date
): Promise<ForecastingCharts> {
  const horizons: Horizon[] = ['15m', '1h', '24h', '7d'];

  const chartPromises = horizons.map(async (horizon) => {
    // eslint-disable-next-line security/detect-object-injection -- Horizon is a typed union, not user input
    const config = HORIZON_CHART_CONFIG[horizon];
    const fromTime = new Date(snapTime.getTime() - config.lookbackMs);

    const url = await getSignedChartUrl({
      symbolId,
      timeframe: config.candleTimeframe,
      from: fromTime,
      to: snapTime,
      layers: CHART_LAYERS,
    });

    return [horizon, url] as const;
  });

  const results = await Promise.all(chartPromises);
  const chartByHorizon = Object.fromEntries(results) as Record<Horizon, string>;

  return { chartByHorizon };
}
