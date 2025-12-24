import { getConfig } from './client';

export interface ChartParams {
  symbolId: string;
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  from: Date;
  to: Date;
  layers: string;
  width?: number;
  height?: number;
}

// Chartable layers (per API spec): candles, sma, ema, bb, vwap, volume
const CHART_LAYERS = 'candles,sma:20,ema:20,bb:20:2,vwap,volume';

export function buildChartUrl(params: ChartParams): string {
  const { baseUrl } = getConfig();
  const width = params.width ?? 1200;
  const height = params.height ?? 800;

  const searchParams = new URLSearchParams({
    timeframe: params.timeframe,
    from: params.from.toISOString(),
    to: params.to.toISOString(),
    layers: params.layers,
    width: String(width),
    height: String(height),
  });

  return `${baseUrl}/api/charts/${params.symbolId}/image?${searchParams.toString()}`;
}

export interface ForecastingCharts {
  // Chart 1: 4-hour lookback with 5m candles
  chart4h5m: string;
  // Chart 2: 24-hour lookback with 15m candles
  chart24h15m: string;
}

export function getForecastingCharts(
  symbolId: string,
  currentTime: Date
): ForecastingCharts {
  // Chart 1: 4 hours of 5m candles (ending at current time)
  const fourHoursAgo = new Date(currentTime);
  fourHoursAgo.setHours(fourHoursAgo.getHours() - 4);

  // Chart 2: 24 hours of 15m candles (ending at current time)
  const twentyFourHoursAgo = new Date(currentTime);
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const chart4h5m = buildChartUrl({
    symbolId,
    timeframe: '5m',
    from: fourHoursAgo,
    to: currentTime,
    layers: CHART_LAYERS,
    width: 1200,
    height: 800,
  });

  const chart24h15m = buildChartUrl({
    symbolId,
    timeframe: '15m',
    from: twentyFourHoursAgo,
    to: currentTime,
    layers: CHART_LAYERS,
    width: 1200,
    height: 800,
  });

  return { chart4h5m, chart24h15m };
}
