/* eslint-disable sonarjs/no-duplicate-string -- Test assertions require duplicate strings for context setup */
import { beforeEach, describe, expect, test } from 'vitest';

import {
  clearForecastContext,
  forecaster,
  setForecastContext,
  type ForecastOutput,
} from '../src/forecaster';
import { CONTRACT_IDS } from '../src/replay-lab/annotations';

describe('forecaster', () => {
  beforeEach(() => {
    clearForecastContext();
  });

  describe('agent definition', () => {
    test('agent is defined with correct id', () => {
      expect(forecaster.definition.id).toBe('forecaster_001');
    });

    test('agent has output schema', () => {
      expect(forecaster.definition.outputSchema).toBeDefined();
    });

    test('agent has buildRoundPrompt function', () => {
      expect(forecaster.definition.buildRoundPrompt).toBeDefined();
      expect(typeof forecaster.definition.buildRoundPrompt).toBe('function');
    });

    test('agent has buildCompactionPrompt function', () => {
      expect(forecaster.definition.buildCompactionPrompt).toBeDefined();
      expect(typeof forecaster.definition.buildCompactionPrompt).toBe('function');
    });

    test('agent has compactionTrigger defined', () => {
      expect(forecaster.definition.compactionTrigger).toBeDefined();
      expect(forecaster.definition.compactionTrigger?.type).toBe('custom');
    });
  });

  describe('output schema validation', () => {
    test('output schema validates correct predictions', () => {
      const validOutput: ForecastOutput = {
        reasoning: 'Test reasoning',
        predictions: {
          'dump-simple-15m-1pct': 0.6,
          'dump-simple-15m-3pct': 0.4,
          'dump-simple-15m-5pct': 0.2,
          'dump-simple-1h-0.5pct': 0.7,
          'dump-simple-1h-1pct': 0.5,
          'dump-vol-adjusted-15m-z2': 0.3,
          'dump-vol-adjusted-1h-z2': 0.2,
          'dump-drawdown-1pct': 0.6,
          'dump-drawdown-3pct': 0.3,
        },
      };

      const result = forecaster.definition.outputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    test('output schema rejects probabilities outside 0-1 range (greater than 1)', () => {
      const invalidOutput = {
        reasoning: 'Test reasoning',
        predictions: {
          'dump-simple-15m-1pct': 1.5, // Invalid: > 1
          'dump-simple-15m-3pct': 0.4,
          'dump-simple-15m-5pct': 0.2,
          'dump-simple-1h-0.5pct': 0.7,
          'dump-simple-1h-1pct': 0.5,
          'dump-vol-adjusted-15m-z2': 0.3,
          'dump-vol-adjusted-1h-z2': 0.2,
          'dump-drawdown-1pct': 0.6,
          'dump-drawdown-3pct': 0.3,
        },
      };

      const result = forecaster.definition.outputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });

    test('output schema rejects probabilities outside 0-1 range (less than 0)', () => {
      const invalidOutput = {
        reasoning: 'Test reasoning',
        predictions: {
          'dump-simple-15m-1pct': -0.1, // Invalid: < 0
          'dump-simple-15m-3pct': 0.4,
          'dump-simple-15m-5pct': 0.2,
          'dump-simple-1h-0.5pct': 0.7,
          'dump-simple-1h-1pct': 0.5,
          'dump-vol-adjusted-15m-z2': 0.3,
          'dump-vol-adjusted-1h-z2': 0.2,
          'dump-drawdown-1pct': 0.6,
          'dump-drawdown-3pct': 0.3,
        },
      };

      const result = forecaster.definition.outputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });

    test('output schema rejects missing contracts', () => {
      const incompleteOutput = {
        reasoning: 'Test reasoning',
        predictions: {
          'dump-simple-15m-1pct': 0.5,
          // Missing all other required contracts
        },
      };

      const result = forecaster.definition.outputSchema.safeParse(incompleteOutput);
      expect(result.success).toBe(false);
    });

    test('output schema requires reasoning field', () => {
      const noReasoningOutput = {
        predictions: {
          'dump-simple-15m-1pct': 0.6,
          'dump-simple-15m-3pct': 0.4,
          'dump-simple-15m-5pct': 0.2,
          'dump-simple-1h-0.5pct': 0.7,
          'dump-simple-1h-1pct': 0.5,
          'dump-vol-adjusted-15m-z2': 0.3,
          'dump-vol-adjusted-1h-z2': 0.2,
          'dump-drawdown-1pct': 0.6,
          'dump-drawdown-3pct': 0.3,
        },
      };

      const result = forecaster.definition.outputSchema.safeParse(noReasoningOutput);
      expect(result.success).toBe(false);
    });
  });

  describe('buildRoundPrompt', () => {
    test('buildRoundPrompt throws without context', () => {
      expect(() => {
        forecaster.definition.buildRoundPrompt({ roundNumber: 0 });
      }).toThrow('Forecast context not set. Call setForecastContext() before runRound().');
    });

    test('buildRoundPrompt includes all contract IDs when context is set', () => {
      setForecastContext({
        chart4h5mUrl: 'https://example.com/chart-4h-5m',
        chart24h15mUrl: 'https://example.com/chart-24h-15m',
        orderbookData: 'orderbook data here',
        currentTime: '2024-01-01T00:00:00.000Z',
        symbolId: 'BTC-USD',
      });

      const prompt = forecaster.definition.buildRoundPrompt({ roundNumber: 0 });

      for (const contractId of CONTRACT_IDS) {
        expect(prompt).toContain(contractId);
      }
    });

    test('buildRoundPrompt includes symbol ID', () => {
      setForecastContext({
        chart4h5mUrl: 'https://example.com/chart-4h-5m',
        chart24h15mUrl: 'https://example.com/chart-24h-15m',
        orderbookData: 'orderbook data here',
        currentTime: '2024-01-01T00:00:00.000Z',
        symbolId: 'BTC-USD',
      });

      const prompt = forecaster.definition.buildRoundPrompt({ roundNumber: 0 });

      expect(prompt).toContain('BTC-USD');
    });

    test('buildRoundPrompt includes chart URLs', () => {
      setForecastContext({
        chart4h5mUrl: 'https://example.com/chart-4h-5m',
        chart24h15mUrl: 'https://example.com/chart-24h-15m',
        orderbookData: 'orderbook data here',
        currentTime: '2024-01-01T00:00:00.000Z',
        symbolId: 'BTC-USD',
      });

      const prompt = forecaster.definition.buildRoundPrompt({ roundNumber: 0 });

      expect(prompt).toContain('https://example.com/chart-4h-5m');
      expect(prompt).toContain('https://example.com/chart-24h-15m');
    });

    test('buildRoundPrompt includes orderbook data', () => {
      setForecastContext({
        chart4h5mUrl: 'https://example.com/chart-4h-5m',
        chart24h15mUrl: 'https://example.com/chart-24h-15m',
        orderbookData: 'orderbook data here',
        currentTime: '2024-01-01T00:00:00.000Z',
        symbolId: 'BTC-USD',
      });

      const prompt = forecaster.definition.buildRoundPrompt({ roundNumber: 0 });

      expect(prompt).toContain('orderbook data here');
    });

    test('buildRoundPrompt includes current time', () => {
      setForecastContext({
        chart4h5mUrl: 'https://example.com/chart-4h-5m',
        chart24h15mUrl: 'https://example.com/chart-24h-15m',
        orderbookData: 'orderbook data here',
        currentTime: '2024-01-01T00:00:00.000Z',
        symbolId: 'BTC-USD',
      });

      const prompt = forecaster.definition.buildRoundPrompt({ roundNumber: 0 });

      expect(prompt).toContain('2024-01-01T00:00:00.000Z');
    });

    test('buildRoundPrompt includes monotonicity constraints', () => {
      setForecastContext({
        chart4h5mUrl: 'https://example.com/chart-4h-5m',
        chart24h15mUrl: 'https://example.com/chart-24h-15m',
        orderbookData: 'orderbook data here',
        currentTime: '2024-01-01T00:00:00.000Z',
        symbolId: 'BTC-USD',
      });

      const prompt = forecaster.definition.buildRoundPrompt({ roundNumber: 0 });

      expect(prompt.toLowerCase()).toContain('monoton');
    });
  });

  describe('context management', () => {
    test('setForecastContext and clearForecastContext work', () => {
      // Initially, calling buildRoundPrompt should throw
      expect(() => {
        forecaster.definition.buildRoundPrompt({ roundNumber: 0 });
      }).toThrow();

      // After setting context, it should work
      setForecastContext({
        chart4h5mUrl: 'https://example.com/chart-4h-5m',
        chart24h15mUrl: 'https://example.com/chart-24h-15m',
        orderbookData: 'orderbook data here',
        currentTime: '2024-01-01T00:00:00.000Z',
        symbolId: 'BTC-USD',
      });

      expect(() => {
        forecaster.definition.buildRoundPrompt({ roundNumber: 0 });
      }).not.toThrow();

      // After clearing, it should throw again
      clearForecastContext();

      expect(() => {
        forecaster.definition.buildRoundPrompt({ roundNumber: 0 });
      }).toThrow();
    });
  });

  describe('compaction trigger', () => {
    test('compaction trigger is custom with shouldCompact function', () => {
      expect(forecaster.definition.compactionTrigger?.type).toBe('custom');
      if (forecaster.definition.compactionTrigger?.type === 'custom') {
        expect(typeof forecaster.definition.compactionTrigger.shouldCompact).toBe('function');
      }
    });

    test('shouldCompact triggers every 10 rounds after round 0', () => {
      const trigger = forecaster.definition.compactionTrigger;
      if (trigger?.type !== 'custom') {
        throw new Error('Expected custom trigger');
      }

      // Round 0 should not compact
      expect(trigger.shouldCompact({ roundNumber: 0, messageCount: 0, estimatedTokens: 0, contextWindowSize: 1000 })).toBe(false);

      // Round 5 should not compact
      expect(trigger.shouldCompact({ roundNumber: 5, messageCount: 0, estimatedTokens: 0, contextWindowSize: 1000 })).toBe(false);

      // Round 10 should compact
      expect(trigger.shouldCompact({ roundNumber: 10, messageCount: 0, estimatedTokens: 0, contextWindowSize: 1000 })).toBe(true);

      // Round 20 should compact
      expect(trigger.shouldCompact({ roundNumber: 20, messageCount: 0, estimatedTokens: 0, contextWindowSize: 1000 })).toBe(true);

      // Round 15 should not compact (not a multiple of 10)
      expect(trigger.shouldCompact({ roundNumber: 15, messageCount: 0, estimatedTokens: 0, contextWindowSize: 1000 })).toBe(false);
    });
  });

  describe('buildCompactionPrompt', () => {
    test('buildCompactionPrompt returns a string', () => {
      const result = forecaster.definition.buildCompactionPrompt([]);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('buildCompactionPrompt handles empty history', () => {
      const result = forecaster.definition.buildCompactionPrompt([]);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });
});
/* eslint-enable sonarjs/no-duplicate-string -- Re-enable rule after test file */
