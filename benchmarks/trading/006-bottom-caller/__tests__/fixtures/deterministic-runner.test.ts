import { describe, expect, it } from 'vitest';
import {
  DeterministicModelRunner,
  GOLDEN_TEST_PREDICTIONS,
  createGoldenTestRunner,
  createCustomRunner,
  getExpectedLogLoss,
  LOG_LOSS_CONFIDENCE_80,
  LOG_LOSS_CONFIDENCE_90,
  type DeterministicRunnerConfig,
  type HorizonPredictionConfig,
} from './deterministic-runner.js';
import type { TimeframeId } from '../../src/timeframe-config.js';

describe('deterministic-runner', () => {
  describe('DeterministicModelRunner.run()', () => {
    it('returns valid JSON string', () => {
      const runner = createGoldenTestRunner();
      const result = runner.run();

      expect(() => JSON.parse(result.text)).not.toThrow();
    });

    it('parses to expected predictions structure', () => {
      const runner = createGoldenTestRunner();
      const result = runner.run();
      const parsed = JSON.parse(result.text);

      expect(parsed).toHaveProperty('predictions');
      expect(parsed.predictions).toHaveProperty('15m');
      expect(parsed.predictions).toHaveProperty('1h');
      expect(parsed.predictions).toHaveProperty('4h');
      expect(parsed.predictions).toHaveProperty('24h');
    });

    it('returns consistent text and parsed output', () => {
      const runner = createGoldenTestRunner();
      const result = runner.run();
      const parsedFromText = JSON.parse(result.text);

      expect(parsedFromText).toEqual(result.parsed);
    });

    it('wraps in code fences when configured', () => {
      const runner = createGoldenTestRunner({ wrapInCodeFences: true });
      const result = runner.run();

      expect(result.text).toMatch(/^```json\n/);
      expect(result.text).toMatch(/\n```$/);
    });
  });

  describe('GOLDEN_TEST_PREDICTIONS', () => {
    const goldenLabels: Record<TimeframeId, boolean> = {
      '15m': false,
      '1h': true,
      '4h': false,
      '24h': true,
    };

    it('matches expected golden labels', () => {
      expect(GOLDEN_TEST_PREDICTIONS['15m'].noNewLow).toBe(goldenLabels['15m']);
      expect(GOLDEN_TEST_PREDICTIONS['1h'].noNewLow).toBe(goldenLabels['1h']);
      expect(GOLDEN_TEST_PREDICTIONS['4h'].noNewLow).toBe(goldenLabels['4h']);
      expect(GOLDEN_TEST_PREDICTIONS['24h'].noNewLow).toBe(goldenLabels['24h']);
    });

    it('has 0.90 confidence for TRUE labels', () => {
      expect(GOLDEN_TEST_PREDICTIONS['1h'].confidence).toBe(0.90);
      expect(GOLDEN_TEST_PREDICTIONS['24h'].confidence).toBe(0.90);
    });

    it('has 0.80 confidence for FALSE labels', () => {
      expect(GOLDEN_TEST_PREDICTIONS['15m'].confidence).toBe(0.80);
      expect(GOLDEN_TEST_PREDICTIONS['4h'].confidence).toBe(0.80);
    });
  });

  describe('expected log loss constants', () => {
    it('LOG_LOSS_CONFIDENCE_90 equals -ln(0.90)', () => {
      expect(LOG_LOSS_CONFIDENCE_90).toBeCloseTo(-Math.log(0.90), 10);
      expect(LOG_LOSS_CONFIDENCE_90).toBeCloseTo(0.10536, 4);
    });

    it('LOG_LOSS_CONFIDENCE_80 equals -ln(0.80)', () => {
      expect(LOG_LOSS_CONFIDENCE_80).toBeCloseTo(-Math.log(0.80), 10);
      expect(LOG_LOSS_CONFIDENCE_80).toBeCloseTo(0.22314, 4);
    });
  });

  describe('getExpectedLogLoss()', () => {
    it('returns -ln(confidence) for correct predictions', () => {
      expect(getExpectedLogLoss(true, 0.90)).toBeCloseTo(LOG_LOSS_CONFIDENCE_90, 10);
      expect(getExpectedLogLoss(true, 0.80)).toBeCloseTo(LOG_LOSS_CONFIDENCE_80, 10);
    });

    it('returns -ln(1-confidence) for incorrect predictions', () => {
      expect(getExpectedLogLoss(false, 0.90)).toBeCloseTo(-Math.log(0.10), 10);
      expect(getExpectedLogLoss(false, 0.80)).toBeCloseTo(-Math.log(0.20), 10);
    });
  });

  describe('createCustomRunner()', () => {
    it('creates uniform predictions', () => {
      const uniformPrediction: HorizonPredictionConfig = { noNewLow: true, confidence: 0.75 };
      const predictions: DeterministicRunnerConfig['predictions'] = {
        '15m': uniformPrediction,
        '1h': uniformPrediction,
        '4h': uniformPrediction,
        '24h': uniformPrediction,
      };

      const runner = createCustomRunner(predictions);
      const result = runner.getPredictions();

      expect(result['15m']).toEqual(uniformPrediction);
      expect(result['1h']).toEqual(uniformPrediction);
      expect(result['4h']).toEqual(uniformPrediction);
      expect(result['24h']).toEqual(uniformPrediction);
    });

    it('includes reasoning when configured', () => {
      const runner = createCustomRunner(GOLDEN_TEST_PREDICTIONS, {
        includeReasoning: true,
        reasoning: 'Test reasoning',
      });
      const result = runner.run();

      expect(result.parsed.reasoning).toBe('Test reasoning');
    });
  });

  describe('getPredictions()', () => {
    it('returns predictions directly without JSON wrapper', () => {
      const runner = createGoldenTestRunner();
      const predictions = runner.getPredictions();

      expect(predictions).toEqual(GOLDEN_TEST_PREDICTIONS);
    });
  });
});
