import { describe, it, expect } from 'vitest';
import {
  TIMEFRAME_CONFIG,
  TIMEFRAME_IDS,
  getTimeframeConfig,
  getTimeframeDurationMs,
  validateTimeframeConfig,
} from '../src/timeframe-config.js';

describe('timeframe-config', () => {
  describe('TIMEFRAME_CONFIG', () => {
    it('should have all 4 timeframes configured', () => {
      expect(TIMEFRAME_IDS).toEqual(['15m', '1h', '4h', '24h']);
    });

    it('15m uses fractal method with 5m candles', () => {
      expect(TIMEFRAME_CONFIG['15m'].groundTruth.pivot.spec.method).toBe(
        'fractal'
      );
      expect(TIMEFRAME_CONFIG['15m'].groundTruth.pivot.barTimeframe).toBe('5m');
    });

    it('24h uses zigzag method with 4h candles', () => {
      expect(TIMEFRAME_CONFIG['24h'].groundTruth.pivot.spec.method).toBe(
        'zigzag'
      );
      expect(TIMEFRAME_CONFIG['24h'].groundTruth.pivot.barTimeframe).toBe('4h');
    });
  });

  describe('getTimeframeConfig', () => {
    it('should have correct chart config for 15m timeframe', () => {
      const config = getTimeframeConfig('15m');
      expect(config.chart.barSizeMinutes).toBe(5);
      expect(config.chart.barTimeframe).toBe('5m');
      expect(config.chart.range.fromMinutesAgo).toBe(120);
      expect(config.chart.range.to).toBe('snapTime');
    });

    it('should return correct task config', () => {
      const config = getTimeframeConfig('1h');
      expect(config.task.forwardWindowMinutes).toBe(60);
      expect(config.task.maxDrawdown).toBe(0.001);
    });
  });

  describe('getTimeframeDurationMs', () => {
    it('should calculate duration in ms', () => {
      expect(getTimeframeDurationMs('15m')).toBe(15 * 60_000);
      expect(getTimeframeDurationMs('1h')).toBe(60 * 60_000);
      expect(getTimeframeDurationMs('4h')).toBe(4 * 60 * 60_000);
      expect(getTimeframeDurationMs('24h')).toBe(24 * 60 * 60_000);
    });
  });

  describe('maxDrawdown thresholds', () => {
    it('has correct thresholds', () => {
      expect(TIMEFRAME_CONFIG['15m'].task.maxDrawdown).toBe(0.001);
      expect(TIMEFRAME_CONFIG['1h'].task.maxDrawdown).toBe(0.001);
      expect(TIMEFRAME_CONFIG['4h'].task.maxDrawdown).toBe(0.001);
      expect(TIMEFRAME_CONFIG['24h'].task.maxDrawdown).toBe(0.001);
    });
  });

  describe('ground truth pivot config', () => {
    it('should have typed pivot spec for fractal timeframes', () => {
      const config15m = getTimeframeConfig('15m');
      expect(config15m.groundTruth.pivot.spec.method).toBe('fractal');
      if (config15m.groundTruth.pivot.spec.method === 'fractal') {
        expect(config15m.groundTruth.pivot.spec.params.L).toBe(3);
        expect(config15m.groundTruth.pivot.spec.params.candleTimeframe).toBe(
          '5m'
        );
      }
    });

    it('should have typed pivot spec for zigzag timeframes', () => {
      const config24h = getTimeframeConfig('24h');
      expect(config24h.groundTruth.pivot.spec.method).toBe('zigzag');
      if (config24h.groundTruth.pivot.spec.method === 'zigzag') {
        expect(config24h.groundTruth.pivot.spec.params.deviationPct).toBe(0.025);
        expect(config24h.groundTruth.pivot.spec.params.candleTimeframe).toBe(
          '4h'
        );
      }
    });
  });

  describe('validateTimeframeConfig', () => {
    it('should validate config consistency', () => {
      expect(() => validateTimeframeConfig()).not.toThrow();
    });
  });

  describe('search config', () => {
    it('should have search config for all timeframes', () => {
      for (const id of TIMEFRAME_IDS) {
        const config = getTimeframeConfig(id);
        expect(config.groundTruth.pivot.search.mode).toBeDefined();
        expect(typeof config.groundTruth.pivot.search.slackCandles).toBe(
          'number'
        );
      }
    });

    it('should have snapTime_to_close mode for all timeframes', () => {
      for (const id of TIMEFRAME_IDS) {
        const config = getTimeframeConfig(id);
        expect(config.groundTruth.pivot.search.mode).toBe('snapTime_to_close');
        expect(config.groundTruth.pivot.search.slackCandles).toBe(0);
      }
    });
  });

  describe('dual ground truth config', () => {
    it('should have both primary and secondary pivot configs', () => {
      for (const id of TIMEFRAME_IDS) {
        const config = getTimeframeConfig(id);
        expect(config.groundTruth.pivot).toBeDefined();
        expect(config.groundTruth.secondaryPivot).toBeDefined();
      }
    });

    it('primary and secondary should use different methods', () => {
      for (const id of TIMEFRAME_IDS) {
        const config = getTimeframeConfig(id);
        expect(config.groundTruth.pivot.spec.method).not.toBe(
          config.groundTruth.secondaryPivot.spec.method
        );
      }
    });

    it('15m and 1h use fractal primary, zigzag secondary', () => {
      const config15m = getTimeframeConfig('15m');
      const config1h = getTimeframeConfig('1h');

      expect(config15m.groundTruth.pivot.spec.method).toBe('fractal');
      expect(config15m.groundTruth.secondaryPivot.spec.method).toBe('zigzag');

      expect(config1h.groundTruth.pivot.spec.method).toBe('fractal');
      expect(config1h.groundTruth.secondaryPivot.spec.method).toBe('zigzag');
    });

    it('4h and 24h use zigzag primary, fractal secondary', () => {
      const config4h = getTimeframeConfig('4h');
      const config24h = getTimeframeConfig('24h');

      expect(config4h.groundTruth.pivot.spec.method).toBe('zigzag');
      expect(config4h.groundTruth.secondaryPivot.spec.method).toBe('fractal');

      expect(config24h.groundTruth.pivot.spec.method).toBe('zigzag');
      expect(config24h.groundTruth.secondaryPivot.spec.method).toBe('fractal');
    });

    it('secondary pivot should have valid search config', () => {
      for (const id of TIMEFRAME_IDS) {
        const config = getTimeframeConfig(id);
        expect(config.groundTruth.secondaryPivot.search.mode).toBe(
          'snapTime_to_close'
        );
        expect(config.groundTruth.secondaryPivot.search.slackCandles).toBe(0);
      }
    });
  });
});
