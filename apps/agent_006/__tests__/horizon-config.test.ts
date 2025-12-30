import { describe, expect, it } from 'vitest';
import {
  HORIZON_CONFIG,
  MAX_DRAWDOWN,
  getHorizonDuration,
  getMaxDrawdown,
  getAnnotationMethod,
} from '../src/horizon-config.js';
import type { Horizon } from '../src/horizon-config.js';

describe('horizon-config', () => {
  describe('HORIZON_CONFIG', () => {
    it('has 4 horizons', () => {
      expect(Object.keys(HORIZON_CONFIG)).toEqual(['15m', '1h', '24h', '7d']);
    });

    it('15m uses fractal method with 1m candles', () => {
      expect(HORIZON_CONFIG['15m'].method).toBe('fractal');
      expect(HORIZON_CONFIG['15m'].params.candleTimeframe).toBe('1m');
    });

    it('7d uses zigzag method with 1h candles', () => {
      expect(HORIZON_CONFIG['7d'].method).toBe('zigzag');
      expect(HORIZON_CONFIG['7d'].params.candleTimeframe).toBe('1h');
    });
  });

  describe('MAX_DRAWDOWN', () => {
    it('has correct thresholds', () => {
      expect(MAX_DRAWDOWN['15m']).toBe(0.004);
      expect(MAX_DRAWDOWN['1h']).toBe(0.01);
      expect(MAX_DRAWDOWN['24h']).toBe(0.025);
      expect(MAX_DRAWDOWN['7d']).toBe(0.06);
    });
  });

  describe('getHorizonDuration', () => {
    it('returns milliseconds for each horizon', () => {
      expect(getHorizonDuration('15m')).toBe(15 * 60_000);
      expect(getHorizonDuration('1h')).toBe(60 * 60_000);
      expect(getHorizonDuration('24h')).toBe(24 * 60 * 60_000);
      expect(getHorizonDuration('7d')).toBe(7 * 24 * 60 * 60_000);
    });
  });

  describe('getMaxDrawdown', () => {
    it('returns threshold for each horizon', () => {
      expect(getMaxDrawdown('15m')).toBe(0.004);
      expect(getMaxDrawdown('7d')).toBe(0.06);
    });
  });

  describe('getAnnotationMethod', () => {
    it('returns method config for fractal horizons', () => {
      const method = getAnnotationMethod('15m');
      expect(method.method).toBe('fractal');
      expect(method.params).toEqual({ L: 3, candleTimeframe: '1m' });
    });

    it('returns method config for zigzag horizons', () => {
      const method = getAnnotationMethod('24h');
      expect(method.method).toBe('zigzag');
      expect(method.params).toEqual({ deviationPct: 0.025, candleTimeframe: '15m' });
    });
  });
});
