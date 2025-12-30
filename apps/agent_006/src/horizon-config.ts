export type Horizon = '15m' | '1h' | '24h' | '7d';

export interface FractalParams {
  L: number;
  candleTimeframe: string;
}

export interface ZigzagParams {
  deviationPct: number;
  candleTimeframe: string;
}

export interface HorizonConfigEntry {
  duration: number;
  method: 'fractal' | 'zigzag';
  params: FractalParams | ZigzagParams;
}

export const HORIZON_CONFIG: Record<Horizon, HorizonConfigEntry> = {
  '15m': {
    duration: 15 * 60_000,
    method: 'fractal',
    params: { L: 3, candleTimeframe: '1m' },
  },
  '1h': {
    duration: 60 * 60_000,
    method: 'fractal',
    params: { L: 3, candleTimeframe: '5m' },
  },
  '24h': {
    duration: 24 * 60 * 60_000,
    method: 'zigzag',
    params: { deviationPct: 0.025, candleTimeframe: '15m' },
  },
  '7d': {
    duration: 7 * 24 * 60 * 60_000,
    method: 'zigzag',
    params: { deviationPct: 0.05, candleTimeframe: '1h' },
  },
} as const;

// Positive magnitudes - max allowed drawdown before prediction is invalidated
export const MAX_DRAWDOWN: Record<Horizon, number> = {
  '15m': 0.004, // 0.4%
  '1h': 0.01, // 1%
  '24h': 0.025, // 2.5%
  '7d': 0.06, // 6%
} as const;

export function getHorizonDuration(horizon: Horizon): number {
  // eslint-disable-next-line security/detect-object-injection -- Horizon is a typed union, not user input
  return HORIZON_CONFIG[horizon].duration;
}

export function getMaxDrawdown(horizon: Horizon): number {
  // eslint-disable-next-line security/detect-object-injection -- Horizon is a typed union, not user input
  return MAX_DRAWDOWN[horizon];
}

export function getAnnotationMethod(horizon: Horizon): {
  method: 'fractal' | 'zigzag';
  params: FractalParams | ZigzagParams;
} {
  // eslint-disable-next-line security/detect-object-injection -- Horizon is a typed union, not user input
  const config = HORIZON_CONFIG[horizon];
  return { method: config.method, params: config.params };
}
