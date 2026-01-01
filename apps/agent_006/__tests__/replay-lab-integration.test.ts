import { describe, it, expect } from 'vitest';
import { getLocalExtremaAnnotations, filterPivotLows } from '../src/replay-lab/annotations.js';

/**
 * Integration tests that hit the REAL Replay Lab API.
 * These tests verify that:
 * 1. The API is accessible and returning data
 * 2. Annotations exist for known historical periods
 * 3. The query parameters work correctly
 * 4. Client-side filtering works (by method, params, direction)
 *
 * Skip these in CI if REPLAY_LAB_BASE_URL is not set.
 *
 * NOTE: API has data up to 2025-12-26 with L: 5 and L: 10 parameters.
 */
describe('Replay Lab Integration', () => {
  const shouldSkip = !process.env.REPLAY_LAB_BASE_URL;

  describe.skipIf(shouldSkip)('real API calls', () => {

    it('should return annotations for a known date range with BTC pivots', async () => {
      // 2025-12-26 has confirmed data with L: 5 params
      const result = await getLocalExtremaAnnotations(
        'COINBASE_SPOT_BTC_USD',
        'fractal',
        { L: 5, candleTimeframe: '1m' },
        new Date('2025-12-26T17:00:00Z'),
        new Date('2025-12-26T20:00:00Z'),
        new Date('2025-12-26T20:00:00Z')
      );

      // This SHOULD have data - if it doesn't, the API is broken
      expect(result.length).toBeGreaterThan(0);

      // Verify structure of returned annotations
      const firstAnnotation = result[0];
      expect(firstAnnotation).toHaveProperty('id');
      expect(firstAnnotation).toHaveProperty('time_start');
      expect(firstAnnotation).toHaveProperty('type', 'local_extrema');
      expect(firstAnnotation).toHaveProperty('payload');

      // Each annotation should have direction in payload
      for (const annotation of result) {
        expect(annotation.payload).toHaveProperty('direction');
        expect(['high', 'low']).toContain(annotation.payload.direction);
      }
    });

    it('should filter pivot lows correctly with filterPivotLows', async () => {
      // Use targeted time range known to have data
      const result = await getLocalExtremaAnnotations(
        'COINBASE_SPOT_BTC_USD',
        'fractal',
        { L: 5, candleTimeframe: '1m' },
        new Date('2025-12-26T17:00:00Z'),
        new Date('2025-12-26T20:00:00Z'),
        new Date('2025-12-26T20:00:00Z')
      );

      const lows = filterPivotLows(result);

      // All returned annotations should be lows
      for (const annotation of lows) {
        expect(annotation.payload.direction).toBe('low');
      }

      // filterPivotLows should return subset of original
      expect(lows.length).toBeLessThanOrEqual(result.length);
    });

    it('should return annotations when API has data', async () => {
      // Verify the API returns annotations for a known-good date range
      // This tests that basic connectivity and auth work
      const result = await getLocalExtremaAnnotations(
        'COINBASE_SPOT_BTC_USD',
        'fractal',
        { L: 5, candleTimeframe: '1m' },
        new Date('2025-12-26T17:00:00Z'),
        new Date('2025-12-26T20:00:00Z'),
        new Date('2025-12-26T20:00:00Z')
      );

      // Should return non-empty results
      expect(result.length).toBeGreaterThan(0);

      // Each annotation should have required fields
      for (const annotation of result) {
        expect(annotation).toHaveProperty('id');
        expect(annotation).toHaveProperty('time_start');
        expect(annotation).toHaveProperty('method', 'fractal');
        expect(annotation.payload).toHaveProperty('direction');
      }
    });

    it('should filter by method server-side (method query param)', async () => {
      // The API now supports method as a query param (BUG-012 fixed)
      // This test verifies server-side filtering works
      const fractalResult = await getLocalExtremaAnnotations(
        'COINBASE_SPOT_BTC_USD',
        'fractal',
        { L: 5, candleTimeframe: '1m' },
        new Date('2025-12-26T17:00:00Z'),
        new Date('2025-12-26T20:00:00Z'),
        new Date('2025-12-26T20:00:00Z')
      );

      // Should have results for fractal
      expect(fractalResult.length).toBeGreaterThan(0);

      // All results should be fractal method (top-level field)
      for (const annotation of fractalResult) {
        expect(annotation.method).toBe('fractal');
      }
    });

    it('should filter by params client-side (L value)', async () => {
      // Fetch with L: 5 and L: 10 - should get different results
      const l5Result = await getLocalExtremaAnnotations(
        'COINBASE_SPOT_BTC_USD',
        'fractal',
        { L: 5, candleTimeframe: '1m' },
        new Date('2025-12-26T17:00:00Z'),
        new Date('2025-12-26T20:00:00Z'),
        new Date('2025-12-26T20:00:00Z')
      );

      const l10Result = await getLocalExtremaAnnotations(
        'COINBASE_SPOT_BTC_USD',
        'fractal',
        { L: 10, candleTimeframe: '1m' },
        new Date('2025-12-26T17:00:00Z'),
        new Date('2025-12-26T20:00:00Z'),
        new Date('2025-12-26T20:00:00Z')
      );

      // All L5 results should have L: 5
      for (const annotation of l5Result) {
        expect(annotation.payload.params?.L).toBe(5);
      }

      // All L10 results should have L: 10
      for (const annotation of l10Result) {
        expect(annotation.payload.params?.L).toBe(10);
      }

      // L: 10 should have fewer pivots (more restrictive)
      expect(l10Result.length).toBeLessThanOrEqual(l5Result.length);
    });
  });
});
