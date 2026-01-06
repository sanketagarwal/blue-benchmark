import { describe, expect, it } from 'vitest';

import { bucketByQuintile, collectEVPnLSamples } from '../src/scorers/quintile-analyzer';

import type { QuintileBucket } from '../src/scorers/quintile-analyzer';

describe('Quintile Analyzer', () => {
  describe('bucketByQuintile', () => {
    it('buckets samples into 5 quintiles by predicted EV', () => {
      const samples = [
        { predictedEV: 10, realizedPnL: 8 },
        { predictedEV: 20, realizedPnL: 15 },
        { predictedEV: 30, realizedPnL: 25 },
        { predictedEV: 40, realizedPnL: 35 },
        { predictedEV: 50, realizedPnL: 45 },
        { predictedEV: 60, realizedPnL: 55 },
        { predictedEV: 70, realizedPnL: 65 },
        { predictedEV: 80, realizedPnL: 75 },
        { predictedEV: 90, realizedPnL: 85 },
        { predictedEV: 100, realizedPnL: 95 },
      ];

      const buckets = bucketByQuintile(samples);

      expect(buckets).toHaveLength(5);
      expect(buckets[0].label).toBe('Q1 (lowest)');
      expect(buckets[4].label).toBe('Q5 (highest)');
      expect(buckets[0].sampleCount).toBe(2);
    });

    it('computes mean predicted EV per bucket', () => {
      const samples = [
        { predictedEV: 10, realizedPnL: 5 },
        { predictedEV: 20, realizedPnL: 15 },
      ];

      const buckets = bucketByQuintile(samples);

      expect(buckets[0].meanPredictedEV).toBe(10);
    });

    it('computes mean realized PnL per bucket', () => {
      const samples = [
        { predictedEV: 10, realizedPnL: 5 },
        { predictedEV: 20, realizedPnL: 15 },
        { predictedEV: 30, realizedPnL: 25 },
        { predictedEV: 40, realizedPnL: 35 },
        { predictedEV: 50, realizedPnL: 45 },
      ];

      const buckets = bucketByQuintile(samples);

      expect(buckets[0].meanRealizedPnL).toBe(5);
      expect(buckets[4].meanRealizedPnL).toBe(45);
    });

    it('computes EV-PnL gap per bucket', () => {
      const samples = [{ predictedEV: 100, realizedPnL: 80 }];

      const buckets = bucketByQuintile(samples);

      expect(buckets[0].evPnLGap).toBe(20);
    });

    it('returns empty buckets for empty input', () => {
      const buckets = bucketByQuintile([]);

      expect(buckets).toHaveLength(5);
      expect(buckets.every((bucket: QuintileBucket) => bucket.sampleCount === 0)).toBe(true);
    });

    it('handles uneven sample distribution across quintiles', () => {
      // 7 samples - should distribute 1-1-1-2-2 or similar
      const samples = [
        { predictedEV: 10, realizedPnL: 8 },
        { predictedEV: 20, realizedPnL: 18 },
        { predictedEV: 30, realizedPnL: 28 },
        { predictedEV: 40, realizedPnL: 38 },
        { predictedEV: 50, realizedPnL: 48 },
        { predictedEV: 60, realizedPnL: 58 },
        { predictedEV: 70, realizedPnL: 68 },
      ];

      const buckets = bucketByQuintile(samples);

      // All 7 samples should be distributed
      const totalSamples = buckets.reduce((sum, b) => sum + b.sampleCount, 0);
      expect(totalSamples).toBe(7);
    });
  });

  describe('collectEVPnLSamples', () => {
    it('matches EV and PnL results by side and horizon', () => {
      const evResults = [
        { side: 'bid', horizon: '1m', ev: 0.5 },
        { side: 'ask', horizon: '5m', ev: 0.3 },
      ];
      const pnlResults = [
        { side: 'bid', horizon: '1m', pnl: 0.4 },
        { side: 'ask', horizon: '5m', pnl: 0.2 },
      ];

      const samples = collectEVPnLSamples(evResults, pnlResults);

      expect(samples).toHaveLength(2);
      expect(samples[0]).toEqual({ predictedEV: 0.5, realizedPnL: 0.4 });
      expect(samples[1]).toEqual({ predictedEV: 0.3, realizedPnL: 0.2 });
    });

    it('excludes EV results without matching PnL', () => {
      const evResults = [
        { side: 'bid', horizon: '1m', ev: 0.5 },
        { side: 'ask', horizon: '5m', ev: 0.3 },
      ];
      const pnlResults = [{ side: 'bid', horizon: '1m', pnl: 0.4 }];

      const samples = collectEVPnLSamples(evResults, pnlResults);

      expect(samples).toHaveLength(1);
      expect(samples[0]).toEqual({ predictedEV: 0.5, realizedPnL: 0.4 });
    });

    it('returns empty array when no matches found', () => {
      const evResults = [{ side: 'bid', horizon: '1m', ev: 0.5 }];
      const pnlResults = [{ side: 'ask', horizon: '5m', pnl: 0.4 }];

      const samples = collectEVPnLSamples(evResults, pnlResults);

      expect(samples).toHaveLength(0);
    });
  });
});
