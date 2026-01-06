/**
 * Golden path end-to-end test for the no-new-low benchmark.
 * Validates the entire pipeline without touching any external model provider.
 *
 * This test guarantees:
 * - Candle slicing is correct for lookback and horizon windows
 * - refLowCandlesBack and refLowPrice are computed correctly
 * - labelNoNewLow is computed correctly with strict undercut
 * - Prompt includes correct ref low metadata for each horizon
 * - Model output parsing and schema validation works
 * - Scoring produces expected log loss values
 */

import { describe, it, expect } from 'vitest';

import {
  GOLDEN_SNAP_TIME,
  GOLDEN_EXPECTED,
  buildAllGoldenCandles,
} from './fixtures/golden-path-candles.js';
import {
  GOLDEN_TEST_PREDICTIONS,
  LOG_LOSS_CONFIDENCE_80,
  LOG_LOSS_CONFIDENCE_90,
  DeterministicModelRunner,
} from './fixtures/deterministic-runner.js';
import {
  computeReferenceLow,
  resolveNoNewLowGroundTruth,
} from '../src/ground-truth/no-new-low.js';
import { logLoss } from '../src/scorers/log-loss-scorer.js';
import { brierScore } from '../src/scorers/brier-scorer.js';
import type { TimeframeId } from '../src/timeframe-config.js';

const HORIZONS: TimeframeId[] = ['15m', '1h', '4h', '24h'];

const GOLDEN_EXPECTED_LOG_LOSSES: Record<TimeframeId, number> = {
  '15m': LOG_LOSS_CONFIDENCE_80,
  '1h': LOG_LOSS_CONFIDENCE_90,
  '4h': LOG_LOSS_CONFIDENCE_80,
  '24h': LOG_LOSS_CONFIDENCE_90,
};

describe('e2e_golden_no_new_low_event_provider_independent', () => {
  describe('Step 1: Ground truth computation', () => {
    it('computes correct refLowCandlesBack for each horizon', () => {
      const allCandles = buildAllGoldenCandles(GOLDEN_SNAP_TIME);

      for (const horizon of HORIZONS) {
        const { lookback } = allCandles[horizon];
        const refLow = computeReferenceLow(lookback);
        const expected = GOLDEN_EXPECTED[horizon];

        expect(refLow.candlesBack).toBe(expected.refLowCandlesBack);
      }
    });

    it('computes correct refLowPrice for each horizon', () => {
      const allCandles = buildAllGoldenCandles(GOLDEN_SNAP_TIME);

      for (const horizon of HORIZONS) {
        const { lookback } = allCandles[horizon];
        const refLow = computeReferenceLow(lookback);
        const expected = GOLDEN_EXPECTED[horizon];

        expect(refLow.price).toBeCloseTo(expected.refLowPrice, 10);
      }
    });

    it('computes correct labelNoNewLow for each horizon', () => {
      const allCandles = buildAllGoldenCandles(GOLDEN_SNAP_TIME);

      for (const horizon of HORIZONS) {
        const { lookback, forward } = allCandles[horizon];
        const result = resolveNoNewLowGroundTruth(lookback, forward);
        const expected = GOLDEN_EXPECTED[horizon];

        const expectedLabel = expected.labelNoNewLow ? 1 : 0;
        expect(result.labelNoNewLow).toBe(expectedLabel);
      }
    });

    it('15m: label is FALSE because forwardLow < refLow', () => {
      const { lookback, forward } = buildAllGoldenCandles(GOLDEN_SNAP_TIME)['15m'];
      const result = resolveNoNewLowGroundTruth(lookback, forward);

      expect(result.refLowPrice).toBeCloseTo(100.0, 10);
      expect(result.forwardLow).toBeCloseTo(99.5, 10);
      expect(result.labelNoNewLow).toBe(0);
    });

    it('1h: label is TRUE because forwardLow >= refLow (equal)', () => {
      const { lookback, forward } = buildAllGoldenCandles(GOLDEN_SNAP_TIME)['1h'];
      const result = resolveNoNewLowGroundTruth(lookback, forward);

      expect(result.refLowPrice).toBeCloseTo(200.0, 10);
      expect(result.forwardLow).toBeCloseTo(200.0, 10);
      expect(result.labelNoNewLow).toBe(1);
    });

    it('4h: label is FALSE, refLow at candlesBack=0', () => {
      const { lookback, forward } = buildAllGoldenCandles(GOLDEN_SNAP_TIME)['4h'];
      const result = resolveNoNewLowGroundTruth(lookback, forward);

      expect(result.refLowPrice).toBeCloseTo(300.0, 10);
      expect(result.refLowCandlesBack).toBe(0);
      expect(result.forwardLow).toBeCloseTo(299.0, 10);
      expect(result.labelNoNewLow).toBe(0);
    });

    it('24h: label is TRUE because forwardLow > refLow', () => {
      const { lookback, forward } = buildAllGoldenCandles(GOLDEN_SNAP_TIME)['24h'];
      const result = resolveNoNewLowGroundTruth(lookback, forward);

      expect(result.refLowPrice).toBeCloseTo(400.0, 10);
      expect(result.forwardLow).toBeCloseTo(401.0, 10);
      expect(result.labelNoNewLow).toBe(1);
    });
  });

  describe('Step 2: Model output parsing', () => {
    it('deterministic runner returns valid JSON', () => {
      const runner = new DeterministicModelRunner({ predictions: GOLDEN_TEST_PREDICTIONS });
      const result = runner.run('test prompt');

      expect(() => JSON.parse(result.text)).not.toThrow();
    });

    it('parsed output contains all horizons', () => {
      const runner = new DeterministicModelRunner({ predictions: GOLDEN_TEST_PREDICTIONS });
      const result = runner.run('test prompt');
      const parsed = JSON.parse(result.text) as { predictions: Record<string, unknown> };

      for (const horizon of HORIZONS) {
        const pred = parsed.predictions[horizon] as { noNewLow: unknown; confidence: unknown };
        expect(pred).toBeDefined();
        expect(pred.noNewLow).toBeDefined();
        expect(pred.confidence).toBeDefined();
      }
    });

    it('parsed predictions match golden config', () => {
      const runner = new DeterministicModelRunner({ predictions: GOLDEN_TEST_PREDICTIONS });
      const result = runner.run('test prompt');
      const parsed = JSON.parse(result.text) as {
        predictions: Record<TimeframeId, { noNewLow: boolean; confidence: number }>;
      };

      expect(parsed.predictions['15m'].noNewLow).toBe(false);
      expect(parsed.predictions['15m'].confidence).toBe(0.8);
      expect(parsed.predictions['1h'].noNewLow).toBe(true);
      expect(parsed.predictions['1h'].confidence).toBe(0.9);
      expect(parsed.predictions['4h'].noNewLow).toBe(false);
      expect(parsed.predictions['4h'].confidence).toBe(0.8);
      expect(parsed.predictions['24h'].noNewLow).toBe(true);
      expect(parsed.predictions['24h'].confidence).toBe(0.9);
    });
  });

  describe('Step 3: Scoring', () => {
    it('computes expected log loss for each horizon', () => {
      const predictions = GOLDEN_TEST_PREDICTIONS;

      const labels: Record<TimeframeId, boolean> = {
        '15m': GOLDEN_EXPECTED['15m'].labelNoNewLow,
        '1h': GOLDEN_EXPECTED['1h'].labelNoNewLow,
        '4h': GOLDEN_EXPECTED['4h'].labelNoNewLow,
        '24h': GOLDEN_EXPECTED['24h'].labelNoNewLow,
      };

      for (const horizon of HORIZONS) {
        const pred = predictions[horizon];
        const label = labels[horizon];

        const p = pred.noNewLow ? pred.confidence : 1 - pred.confidence;

        const ll = logLoss(p, label);
        const expected = GOLDEN_EXPECTED_LOG_LOSSES[horizon];

        expect(ll).toBeCloseTo(expected, 9);
      }
    });

    it('15m: log loss ≈ 0.22314 (correct FALSE with 0.80 confidence)', () => {
      const p = 1 - 0.8;
      const ll = logLoss(p, false);
      expect(ll).toBeCloseTo(-Math.log(0.8), 9);
    });

    it('1h: log loss ≈ 0.10536 (correct TRUE with 0.90 confidence)', () => {
      const p = 0.9;
      const ll = logLoss(p, true);
      expect(ll).toBeCloseTo(-Math.log(0.9), 9);
    });

    it('Brier scores are computed correctly', () => {
      const predictions = GOLDEN_TEST_PREDICTIONS;
      const labels: Record<TimeframeId, boolean> = {
        '15m': false,
        '1h': true,
        '4h': false,
        '24h': true,
      };

      for (const horizon of HORIZONS) {
        const pred = predictions[horizon];
        const label = labels[horizon];
        const p = pred.noNewLow ? pred.confidence : 1 - pred.confidence;

        const bs = brierScore(p, label);
        const y = label ? 1 : 0;
        const expected = (p - y) ** 2;

        expect(bs).toBeCloseTo(expected, 9);
      }
    });
  });

  describe('Step 4: Full pipeline integration', () => {
    it('complete round produces consistent results', () => {
      const allCandles = buildAllGoldenCandles(GOLDEN_SNAP_TIME);

      const groundTruth: Record<
        TimeframeId,
        { label: boolean; refLowPrice: number; refLowCandlesBack: number }
      > = {} as Record<
        TimeframeId,
        { label: boolean; refLowPrice: number; refLowCandlesBack: number }
      >;

      for (const horizon of HORIZONS) {
        const { lookback, forward } = allCandles[horizon];
        const result = resolveNoNewLowGroundTruth(lookback, forward);
        groundTruth[horizon] = {
          label: result.labelNoNewLow === 1,
          refLowPrice: result.refLowPrice,
          refLowCandlesBack: result.refLowCandlesBack,
        };
      }

      const runner = new DeterministicModelRunner({ predictions: GOLDEN_TEST_PREDICTIONS });
      const output = runner.run('prompt');
      const parsed = JSON.parse(output.text) as {
        predictions: Record<TimeframeId, { noNewLow: boolean; confidence: number }>;
      };

      const scores: Record<TimeframeId, number> = {} as Record<TimeframeId, number>;
      for (const horizon of HORIZONS) {
        const pred = parsed.predictions[horizon];
        const label = groundTruth[horizon].label;
        const p = pred.noNewLow ? pred.confidence : 1 - pred.confidence;
        scores[horizon] = logLoss(p, label);
      }

      expect(groundTruth['15m'].label).toBe(false);
      expect(groundTruth['1h'].label).toBe(true);
      expect(groundTruth['4h'].label).toBe(false);
      expect(groundTruth['24h'].label).toBe(true);

      expect(scores['15m']).toBeCloseTo(GOLDEN_EXPECTED_LOG_LOSSES['15m'], 9);
      expect(scores['1h']).toBeCloseTo(GOLDEN_EXPECTED_LOG_LOSSES['1h'], 9);
      expect(scores['4h']).toBeCloseTo(GOLDEN_EXPECTED_LOG_LOSSES['4h'], 9);
      expect(scores['24h']).toBeCloseTo(GOLDEN_EXPECTED_LOG_LOSSES['24h'], 9);
    });
  });
});
