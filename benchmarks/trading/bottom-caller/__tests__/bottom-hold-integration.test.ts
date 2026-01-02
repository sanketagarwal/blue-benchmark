import { describe, it, expect } from 'vitest';
import { getBottomHoldAnnotations, didBottomHold } from '../src/replay-lab/annotations.js';

/**
 * Integration tests for bottom_event annotations with bottom-hold method.
 * Tests hit the REAL Replay Lab API using Task Spec v1 parameters.
 *
 * Skip in CI if REPLAY_LAB_BASE_URL is not set.
 */

const TASK_SPEC_V1_PARAMS = {
  '15m': { lookbackCandles: 24, horizonCandles: 3, maxDrawdownFrac: 0.001, candleTimeframe: '5m' as const },
  '1h': { lookbackCandles: 32, horizonCandles: 4, maxDrawdownFrac: 0.001, candleTimeframe: '15m' as const },
  '4h': { lookbackCandles: 32, horizonCandles: 4, maxDrawdownFrac: 0.001, candleTimeframe: '1h' as const },
  '24h': { lookbackCandles: 48, horizonCandles: 6, maxDrawdownFrac: 0.001, candleTimeframe: '4h' as const },
};

const TEST_PARAMS = TASK_SPEC_V1_PARAMS['15m'];

describe('bottom_event with bottom-hold method', () => {
  const shouldSkip = !process.env.REPLAY_LAB_BASE_URL;

  describe.skipIf(shouldSkip)('Task Spec v1 params (15m horizon)', () => {
    it('returns annotations for valid time range', async () => {
      const result = await getBottomHoldAnnotations(
        'COINBASE_SPOT_BTC_USD',
        TEST_PARAMS,
        new Date('2025-12-26T17:00:00Z'),
        new Date('2025-12-26T20:00:00Z'),
        new Date('2025-12-26T20:00:00Z')
      );

      expect(result.length).toBeGreaterThan(0);

      const firstAnnotation = result[0];
      expect(firstAnnotation).toHaveProperty('id');
      expect(firstAnnotation).toHaveProperty('time_start');
      expect(firstAnnotation).toHaveProperty('type', 'bottom_event');
      expect(firstAnnotation).toHaveProperty('method', 'bottom-hold');
      expect(firstAnnotation).toHaveProperty('payload');
    });

    it('respects availableAt constraint', async () => {
      const earlyAvailableAt = new Date('2025-12-26T17:30:00Z');
      const result = await getBottomHoldAnnotations(
        'COINBASE_SPOT_BTC_USD',
        TEST_PARAMS,
        new Date('2025-12-26T17:00:00Z'),
        new Date('2025-12-26T20:00:00Z'),
        earlyAvailableAt
      );

      for (const annotation of result) {
        const annotationAvailableAt = new Date(annotation.available_at);
        expect(annotationAvailableAt.getTime()).toBeLessThanOrEqual(earlyAvailableAt.getTime());
      }
    });

    it('returns annotations matching Task Spec v1 params', async () => {
      const result = await getBottomHoldAnnotations(
        'COINBASE_SPOT_BTC_USD',
        TEST_PARAMS,
        new Date('2025-12-26T17:00:00Z'),
        new Date('2025-12-26T20:00:00Z'),
        new Date('2025-12-26T20:00:00Z')
      );

      expect(result.length).toBeGreaterThan(0);

      for (const annotation of result) {
        expect(annotation.payload.params.lookbackCandles).toBe(TEST_PARAMS.lookbackCandles);
        expect(annotation.payload.params.horizonCandles).toBe(TEST_PARAMS.horizonCandles);
        expect(annotation.payload.params.maxDrawdownFrac).toBe(TEST_PARAMS.maxDrawdownFrac);
        expect(annotation.payload.params.candleTimeframe).toBe(TEST_PARAMS.candleTimeframe);
      }
    });
  });

  describe.skipIf(shouldSkip)('payload structure', () => {
    it('includes required fields: refLow, fwdLow, drawdownFrac', async () => {
      const result = await getBottomHoldAnnotations(
        'COINBASE_SPOT_BTC_USD',
        TEST_PARAMS,
        new Date('2025-12-26T17:00:00Z'),
        new Date('2025-12-26T20:00:00Z'),
        new Date('2025-12-26T20:00:00Z')
      );

      expect(result.length).toBeGreaterThan(0);

      for (const annotation of result) {
        expect(annotation.payload).toHaveProperty('refLow');
        expect(annotation.payload).toHaveProperty('fwdLow');
        expect(annotation.payload).toHaveProperty('drawdownFrac');
      }
    });

    it('drawdownFrac is non-negative number', async () => {
      const result = await getBottomHoldAnnotations(
        'COINBASE_SPOT_BTC_USD',
        TEST_PARAMS,
        new Date('2025-12-26T17:00:00Z'),
        new Date('2025-12-26T20:00:00Z'),
        new Date('2025-12-26T20:00:00Z')
      );

      expect(result.length).toBeGreaterThan(0);

      for (const annotation of result) {
        expect(typeof annotation.payload.drawdownFrac).toBe('number');
        expect(annotation.payload.drawdownFrac).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe.skipIf(shouldSkip)('didBottomHold helper', () => {
    it('returns boolean for each annotation', async () => {
      const result = await getBottomHoldAnnotations(
        'COINBASE_SPOT_BTC_USD',
        TEST_PARAMS,
        new Date('2025-12-26T17:00:00Z'),
        new Date('2025-12-26T20:00:00Z'),
        new Date('2025-12-26T20:00:00Z')
      );

      expect(result.length).toBeGreaterThan(0);

      for (const annotation of result) {
        expect(typeof didBottomHold(annotation)).toBe('boolean');
      }
    });

    it('returns true when drawdownFrac <= maxDrawdownFrac', async () => {
      const result = await getBottomHoldAnnotations(
        'COINBASE_SPOT_BTC_USD',
        TEST_PARAMS,
        new Date('2025-12-26T17:00:00Z'),
        new Date('2025-12-26T20:00:00Z'),
        new Date('2025-12-26T20:00:00Z')
      );

      for (const annotation of result) {
        const held = didBottomHold(annotation);
        const { drawdownFrac, params } = annotation.payload;
        if (drawdownFrac <= params.maxDrawdownFrac) {
          expect(held).toBe(true);
        } else {
          expect(held).toBe(false);
        }
      }
    });
  });
});
