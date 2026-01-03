import { describe, expect, it } from 'vitest';

import { getGoldenFixtures } from './fixtures/synthetic-candles.js';
import {
  createGoldenTestRunner,
  LOG_LOSS_CONFIDENCE_80,
  LOG_LOSS_CONFIDENCE_90,
  GOLDEN_TEST_PREDICTIONS,
} from './fixtures/deterministic-runner.js';
import {
  computeReferenceLow,
  computeForwardWindow,
  labelNoNewLow,
  resolveNoNewLowGroundTruth,
} from '../src/ground-truth/no-new-low.js';
import { scorePhase0Round } from '../src/scorers/phase-0-scorer.js';
import type { BottomContractId } from '../src/bottom-caller.js';
import type { TimeframeId } from '../src/timeframe-config.js';

const SNAP_TIME = new Date('2025-01-01T00:00:00.000Z');

const HORIZONS: TimeframeId[] = ['15m', '1h', '4h', '24h'];

describe('golden-e2e', () => {
  describe('ground truth labeling', () => {
    const fixtures = getGoldenFixtures(SNAP_TIME);

    describe('15m horizon', () => {
      const fixture = fixtures['15m'];

      it('computes correct reference low', () => {
        const result = computeReferenceLow(fixture.lookbackCandles);
        expect(result.price).toBe(100.0);
        expect(result.candlesBack).toBe(5);
      });

      it('computes correct forward low', () => {
        const result = computeForwardWindow(fixture.forwardCandles);
        expect(result.lowestPrice).toBe(99.5);
      });

      it('produces label=0 (new low made)', () => {
        const label = labelNoNewLow(100.0, 99.5);
        expect(label).toBe(0);
        expect(fixture.expectedLabel).toBe(0);
      });

      it('resolveNoNewLowGroundTruth returns consistent result', () => {
        const result = resolveNoNewLowGroundTruth(
          fixture.lookbackCandles,
          fixture.forwardCandles
        );
        expect(result.refLowPrice).toBe(100.0);
        expect(result.refLowCandlesBack).toBe(5);
        expect(result.forwardLow).toBe(99.5);
        expect(result.labelNoNewLow).toBe(0);
      });
    });

    describe('1h horizon', () => {
      const fixture = fixtures['1h'];

      it('computes correct reference low', () => {
        const result = computeReferenceLow(fixture.lookbackCandles);
        expect(result.price).toBe(200.0);
        expect(result.candlesBack).toBe(10);
      });

      it('computes correct forward low', () => {
        const result = computeForwardWindow(fixture.forwardCandles);
        expect(result.lowestPrice).toBe(200.0);
      });

      it('produces label=1 (no new low)', () => {
        const label = labelNoNewLow(200.0, 200.0);
        expect(label).toBe(1);
        expect(fixture.expectedLabel).toBe(1);
      });

      it('resolveNoNewLowGroundTruth returns consistent result', () => {
        const result = resolveNoNewLowGroundTruth(
          fixture.lookbackCandles,
          fixture.forwardCandles
        );
        expect(result.refLowPrice).toBe(200.0);
        expect(result.refLowCandlesBack).toBe(10);
        expect(result.forwardLow).toBe(200.0);
        expect(result.labelNoNewLow).toBe(1);
      });
    });

    describe('4h horizon', () => {
      const fixture = fixtures['4h'];

      it('computes correct reference low', () => {
        const result = computeReferenceLow(fixture.lookbackCandles);
        expect(result.price).toBe(300.0);
        expect(result.candlesBack).toBe(0);
      });

      it('computes correct forward low', () => {
        const result = computeForwardWindow(fixture.forwardCandles);
        expect(result.lowestPrice).toBe(299.0);
      });

      it('produces label=0 (new low made)', () => {
        const label = labelNoNewLow(300.0, 299.0);
        expect(label).toBe(0);
        expect(fixture.expectedLabel).toBe(0);
      });

      it('resolveNoNewLowGroundTruth returns consistent result', () => {
        const result = resolveNoNewLowGroundTruth(
          fixture.lookbackCandles,
          fixture.forwardCandles
        );
        expect(result.refLowPrice).toBe(300.0);
        expect(result.refLowCandlesBack).toBe(0);
        expect(result.forwardLow).toBe(299.0);
        expect(result.labelNoNewLow).toBe(0);
      });
    });

    describe('24h horizon', () => {
      const fixture = fixtures['24h'];

      it('computes correct reference low', () => {
        const result = computeReferenceLow(fixture.lookbackCandles);
        expect(result.price).toBe(400.0);
        expect(result.candlesBack).toBe(20);
      });

      it('computes correct forward low', () => {
        const result = computeForwardWindow(fixture.forwardCandles);
        expect(result.lowestPrice).toBe(401.0);
      });

      it('produces label=1 (no new low)', () => {
        const label = labelNoNewLow(400.0, 401.0);
        expect(label).toBe(1);
        expect(fixture.expectedLabel).toBe(1);
      });

      it('resolveNoNewLowGroundTruth returns consistent result', () => {
        const result = resolveNoNewLowGroundTruth(
          fixture.lookbackCandles,
          fixture.forwardCandles
        );
        expect(result.refLowPrice).toBe(400.0);
        expect(result.refLowCandlesBack).toBe(20);
        expect(result.forwardLow).toBe(401.0);
        expect(result.labelNoNewLow).toBe(1);
      });
    });
  });

  describe('deterministic runner', () => {
    it('produces parseable JSON output', () => {
      const runner = createGoldenTestRunner();
      const text = runner.getText();

      expect(() => JSON.parse(text)).not.toThrow();
    });

    it('returns correctly structured predictions', () => {
      const runner = createGoldenTestRunner();
      const parsed = runner.getParsedOutput();

      expect(parsed.predictions).toBeDefined();
      expect(parsed.predictions['15m']).toBeDefined();
      expect(parsed.predictions['1h']).toBeDefined();
      expect(parsed.predictions['4h']).toBeDefined();
      expect(parsed.predictions['24h']).toBeDefined();
    });

    it('has all four horizons present', () => {
      const runner = createGoldenTestRunner();
      const predictions = runner.getPredictions();

      for (const horizon of HORIZONS) {
        expect(predictions[horizon]).toBeDefined();
      }
    });

    it('has confidence values in valid range [0, 1]', () => {
      const runner = createGoldenTestRunner();
      const predictions = runner.getPredictions();

      for (const horizon of HORIZONS) {
        const pred = predictions[horizon];
        expect(pred.confidence).toBeGreaterThanOrEqual(0);
        expect(pred.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('matches expected golden predictions', () => {
      const runner = createGoldenTestRunner();
      const predictions = runner.getPredictions();

      expect(predictions['15m'].noNewLow).toBe(false);
      expect(predictions['15m'].confidence).toBe(0.8);

      expect(predictions['1h'].noNewLow).toBe(true);
      expect(predictions['1h'].confidence).toBe(0.9);

      expect(predictions['4h'].noNewLow).toBe(false);
      expect(predictions['4h'].confidence).toBe(0.8);

      expect(predictions['24h'].noNewLow).toBe(true);
      expect(predictions['24h'].confidence).toBe(0.9);
    });
  });

  describe('scoring', () => {
    const fixtures = getGoldenFixtures(SNAP_TIME);

    function convertToScorerPredictions(): Record<BottomContractId, number> {
      const result: Record<string, number> = {};

      for (const horizon of HORIZONS) {
        const pred = GOLDEN_TEST_PREDICTIONS[horizon];
        const p = pred.noNewLow ? pred.confidence : 1 - pred.confidence;
        result[`bottom-${horizon}`] = p;
      }

      return result as Record<BottomContractId, number>;
    }

    function getLabels(): Record<TimeframeId, boolean> {
      return {
        '15m': fixtures['15m'].expectedLabel === 1,
        '1h': fixtures['1h'].expectedLabel === 1,
        '4h': fixtures['4h'].expectedLabel === 1,
        '24h': fixtures['24h'].expectedLabel === 1,
      };
    }

    it('converts predictions correctly', () => {
      const predictions = convertToScorerPredictions();

      expect(predictions['bottom-15m']).toBeCloseTo(0.2, 9);
      expect(predictions['bottom-1h']).toBeCloseTo(0.9, 9);
      expect(predictions['bottom-4h']).toBeCloseTo(0.2, 9);
      expect(predictions['bottom-24h']).toBeCloseTo(0.9, 9);
    });

    it('constructs labels from fixtures correctly', () => {
      const labels = getLabels();

      expect(labels['15m']).toBe(false);
      expect(labels['1h']).toBe(true);
      expect(labels['4h']).toBe(false);
      expect(labels['24h']).toBe(true);
    });

    it('computes correct log loss for 15m (predict false correctly)', () => {
      const predictions = convertToScorerPredictions();
      const labels = getLabels();
      const score = scorePhase0Round(predictions, labels);

      expect(score.logLossByHorizon['15m']).toBeCloseTo(LOG_LOSS_CONFIDENCE_80, 9);
    });

    it('computes correct log loss for 1h (predict true correctly)', () => {
      const predictions = convertToScorerPredictions();
      const labels = getLabels();
      const score = scorePhase0Round(predictions, labels);

      expect(score.logLossByHorizon['1h']).toBeCloseTo(LOG_LOSS_CONFIDENCE_90, 9);
    });

    it('computes correct log loss for 4h (predict false correctly)', () => {
      const predictions = convertToScorerPredictions();
      const labels = getLabels();
      const score = scorePhase0Round(predictions, labels);

      expect(score.logLossByHorizon['4h']).toBeCloseTo(LOG_LOSS_CONFIDENCE_80, 9);
    });

    it('computes correct log loss for 24h (predict true correctly)', () => {
      const predictions = convertToScorerPredictions();
      const labels = getLabels();
      const score = scorePhase0Round(predictions, labels);

      expect(score.logLossByHorizon['24h']).toBeCloseTo(LOG_LOSS_CONFIDENCE_90, 9);
    });

    it('has no extreme errors (predictions match labels)', () => {
      const predictions = convertToScorerPredictions();
      const labels = getLabels();
      const score = scorePhase0Round(predictions, labels);

      for (const horizon of HORIZONS) {
        expect(score.extremeErrors[horizon]).toBe(false);
      }
    });
  });

  describe('end-to-end invariants', () => {
    it('changing forward low changes label correctly', () => {
      const lookback = [
        { timestamp: new Date(), open: 110, high: 120, low: 100, close: 115, volume: 1000 },
      ];

      const forwardAbove = [
        { timestamp: new Date(), open: 110, high: 120, low: 105, close: 115, volume: 1000 },
      ];
      const resultAbove = resolveNoNewLowGroundTruth(lookback, forwardAbove);
      expect(resultAbove.labelNoNewLow).toBe(1);

      const forwardBelow = [
        { timestamp: new Date(), open: 110, high: 120, low: 95, close: 115, volume: 1000 },
      ];
      const resultBelow = resolveNoNewLowGroundTruth(lookback, forwardBelow);
      expect(resultBelow.labelNoNewLow).toBe(0);

      const forwardEqual = [
        { timestamp: new Date(), open: 110, high: 120, low: 100, close: 115, volume: 1000 },
      ];
      const resultEqual = resolveNoNewLowGroundTruth(lookback, forwardEqual);
      expect(resultEqual.labelNoNewLow).toBe(1);
    });

    it('tie-breaking: most recent candle wins when multiple share same low', () => {
      const candles = [
        { timestamp: new Date(1000), open: 110, high: 120, low: 100, close: 115, volume: 1000 },
        { timestamp: new Date(2000), open: 110, high: 120, low: 100, close: 115, volume: 1000 },
        { timestamp: new Date(3000), open: 110, high: 120, low: 100, close: 115, volume: 1000 },
      ];

      const result = computeReferenceLow(candles);

      expect(result.price).toBe(100);
      expect(result.candleIndex).toBe(2);
      expect(result.candlesBack).toBe(0);
    });

    it('all fixture horizons have expected lookback/forward candle counts', () => {
      const fixtures = getGoldenFixtures(SNAP_TIME);

      expect(fixtures['15m'].lookbackCandles.length).toBe(24);
      expect(fixtures['15m'].forwardCandles.length).toBe(3);

      expect(fixtures['1h'].lookbackCandles.length).toBe(32);
      expect(fixtures['1h'].forwardCandles.length).toBe(4);

      expect(fixtures['4h'].lookbackCandles.length).toBe(32);
      expect(fixtures['4h'].forwardCandles.length).toBe(4);

      expect(fixtures['24h'].lookbackCandles.length).toBe(48);
      expect(fixtures['24h'].forwardCandles.length).toBe(6);
    });

    it('runner output matches fixture expected labels', () => {
      const fixtures = getGoldenFixtures(SNAP_TIME);
      const runner = createGoldenTestRunner();
      const predictions = runner.getPredictions();

      const expectedMatch15m = (predictions['15m'].noNewLow === false) === (fixtures['15m'].expectedLabel === 0);
      const expectedMatch1h = (predictions['1h'].noNewLow === true) === (fixtures['1h'].expectedLabel === 1);
      const expectedMatch4h = (predictions['4h'].noNewLow === false) === (fixtures['4h'].expectedLabel === 0);
      const expectedMatch24h = (predictions['24h'].noNewLow === true) === (fixtures['24h'].expectedLabel === 1);

      expect(expectedMatch15m).toBe(true);
      expect(expectedMatch1h).toBe(true);
      expect(expectedMatch4h).toBe(true);
      expect(expectedMatch24h).toBe(true);
    });

    it('no silent fallbacks in parsed output', () => {
      const runner = createGoldenTestRunner();
      const text = runner.getText();
      const parsed = JSON.parse(text) as { predictions: Record<string, unknown> };

      expect(Object.keys(parsed.predictions)).toHaveLength(4);

      for (const horizon of HORIZONS) {
        const pred = parsed.predictions[horizon] as { noNewLow: unknown; confidence: unknown };
        expect(typeof pred.noNewLow).toBe('boolean');
        expect(typeof pred.confidence).toBe('number');
      }
    });
  });
});
