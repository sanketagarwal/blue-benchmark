/* eslint-disable sonarjs/no-duplicate-string -- Test assertions require duplicate strings for context setup */
import { beforeEach, describe, expect, test } from 'vitest';

import {
  clearMarketMakerContext,
  marketMaker,
  setMarketMakerContext,
  type MarketMakerOutput,
  FILL_CONTRACT_IDS,
} from '../src/market-maker';

describe('marketMaker', () => {
  beforeEach(() => {
    clearMarketMakerContext();
  });

  describe('agent definition', () => {
    test('agent is defined with correct id', () => {
      expect(marketMaker.definition.id).toBe('market_maker_001');
    });

    test('agent has output schema', () => {
      expect(marketMaker.definition.outputSchema).toBeDefined();
    });

    test('agent has buildRoundPrompt function', () => {
      expect(marketMaker.definition.buildRoundPrompt).toBeDefined();
      expect(typeof marketMaker.definition.buildRoundPrompt).toBe('function');
    });

    test('agent has buildCompactionPrompt function', () => {
      expect(marketMaker.definition.buildCompactionPrompt).toBeDefined();
      expect(typeof marketMaker.definition.buildCompactionPrompt).toBe('function');
    });

    test('agent has compactionTrigger defined', () => {
      expect(marketMaker.definition.compactionTrigger).toBeDefined();
      expect(marketMaker.definition.compactionTrigger?.type).toBe('custom');
    });
  });

  describe('output schema validation', () => {
    test('output schema validates correct predictions with all 6 fill contracts', () => {
      const validOutput: MarketMakerOutput = {
        reasoning: 'Test reasoning',
        predictions: {
          'bid-fill-1m': 0.3,
          'bid-fill-5m': 0.5,
          'bid-fill-15m': 0.7,
          'ask-fill-1m': 0.25,
          'ask-fill-5m': 0.45,
          'ask-fill-15m': 0.65,
        },
      };

      const result = marketMaker.definition.outputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    test('output schema rejects probabilities greater than 1', () => {
      const invalidOutput = {
        reasoning: 'Test reasoning',
        predictions: {
          'bid-fill-1m': 1.5, // Invalid: > 1
          'bid-fill-5m': 0.5,
          'bid-fill-15m': 0.7,
          'ask-fill-1m': 0.25,
          'ask-fill-5m': 0.45,
          'ask-fill-15m': 0.65,
        },
      };

      const result = marketMaker.definition.outputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });

    test('output schema rejects probabilities less than 0', () => {
      const invalidOutput = {
        reasoning: 'Test reasoning',
        predictions: {
          'bid-fill-1m': -0.1, // Invalid: < 0
          'bid-fill-5m': 0.5,
          'bid-fill-15m': 0.7,
          'ask-fill-1m': 0.25,
          'ask-fill-5m': 0.45,
          'ask-fill-15m': 0.65,
        },
      };

      const result = marketMaker.definition.outputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });

    test('output schema rejects missing contracts', () => {
      const incompleteOutput = {
        reasoning: 'Test reasoning',
        predictions: {
          'bid-fill-1m': 0.5,
          // Missing all other required contracts
        },
      };

      const result = marketMaker.definition.outputSchema.safeParse(incompleteOutput);
      expect(result.success).toBe(false);
    });

    test('output schema requires reasoning field', () => {
      const noReasoningOutput = {
        predictions: {
          'bid-fill-1m': 0.3,
          'bid-fill-5m': 0.5,
          'bid-fill-15m': 0.7,
          'ask-fill-1m': 0.25,
          'ask-fill-5m': 0.45,
          'ask-fill-15m': 0.65,
        },
      };

      const result = marketMaker.definition.outputSchema.safeParse(noReasoningOutput);
      expect(result.success).toBe(false);
    });
  });

  describe('FILL_CONTRACT_IDS', () => {
    test('exports exactly 6 fill probability contracts', () => {
      expect(FILL_CONTRACT_IDS).toHaveLength(6);
    });

    test('includes all bid fill contracts', () => {
      expect(FILL_CONTRACT_IDS).toContain('bid-fill-1m');
      expect(FILL_CONTRACT_IDS).toContain('bid-fill-5m');
      expect(FILL_CONTRACT_IDS).toContain('bid-fill-15m');
    });

    test('includes all ask fill contracts', () => {
      expect(FILL_CONTRACT_IDS).toContain('ask-fill-1m');
      expect(FILL_CONTRACT_IDS).toContain('ask-fill-5m');
      expect(FILL_CONTRACT_IDS).toContain('ask-fill-15m');
    });
  });

  describe('buildRoundPrompt', () => {
    test('buildRoundPrompt throws without context', () => {
      expect(() => {
        marketMaker.definition.buildRoundPrompt({ roundNumber: 0 });
      }).toThrow('Market maker context not set. Call setMarketMakerContext() before runRound().');
    });

    test('buildRoundPrompt includes all contract IDs when context is set', () => {
      setMarketMakerContext({
        chart4h5mUrl: 'https://example.com/chart-4h-5m',
        chart24h15mUrl: 'https://example.com/chart-24h-15m',
        orderbookData: 'mid_price: 3055.56, spread: 0.12, imbalance: 0.37, best_bid: 3055.50, best_ask: 3055.62',
        currentTime: '2024-01-01T00:00:00.000Z',
        symbolId: 'COINBASE_SPOT_ETH_USD',
      });

      const prompt = marketMaker.definition.buildRoundPrompt({ roundNumber: 0 });

      for (const contractId of FILL_CONTRACT_IDS) {
        expect(prompt).toContain(contractId);
      }
    });

    test('buildRoundPrompt includes symbol ID', () => {
      setMarketMakerContext({
        chart4h5mUrl: 'https://example.com/chart-4h-5m',
        chart24h15mUrl: 'https://example.com/chart-24h-15m',
        orderbookData: 'mid_price: 3055.56, spread: 0.12, imbalance: 0.37, best_bid: 3055.50, best_ask: 3055.62',
        currentTime: '2024-01-01T00:00:00.000Z',
        symbolId: 'COINBASE_SPOT_ETH_USD',
      });

      const prompt = marketMaker.definition.buildRoundPrompt({ roundNumber: 0 });

      expect(prompt).toContain('COINBASE_SPOT_ETH_USD');
    });

    test('buildRoundPrompt includes chart URLs', () => {
      setMarketMakerContext({
        chart4h5mUrl: 'https://example.com/chart-4h-5m',
        chart24h15mUrl: 'https://example.com/chart-24h-15m',
        orderbookData: 'mid_price: 3055.56, spread: 0.12, imbalance: 0.37, best_bid: 3055.50, best_ask: 3055.62',
        currentTime: '2024-01-01T00:00:00.000Z',
        symbolId: 'COINBASE_SPOT_ETH_USD',
      });

      const prompt = marketMaker.definition.buildRoundPrompt({ roundNumber: 0 });

      expect(prompt).toContain('https://example.com/chart-4h-5m');
      expect(prompt).toContain('https://example.com/chart-24h-15m');
    });

    test('buildRoundPrompt includes orderbook data', () => {
      setMarketMakerContext({
        chart4h5mUrl: 'https://example.com/chart-4h-5m',
        chart24h15mUrl: 'https://example.com/chart-24h-15m',
        orderbookData: 'mid_price: 3055.56, spread: 0.12, imbalance: 0.37, best_bid: 3055.50, best_ask: 3055.62',
        currentTime: '2024-01-01T00:00:00.000Z',
        symbolId: 'COINBASE_SPOT_ETH_USD',
      });

      const prompt = marketMaker.definition.buildRoundPrompt({ roundNumber: 0 });

      expect(prompt).toContain('best_bid');
      expect(prompt).toContain('best_ask');
      expect(prompt).toContain('imbalance');
    });

    test('buildRoundPrompt includes current time', () => {
      setMarketMakerContext({
        chart4h5mUrl: 'https://example.com/chart-4h-5m',
        chart24h15mUrl: 'https://example.com/chart-24h-15m',
        orderbookData: 'mid_price: 3055.56, spread: 0.12, imbalance: 0.37, best_bid: 3055.50, best_ask: 3055.62',
        currentTime: '2024-01-01T00:00:00.000Z',
        symbolId: 'COINBASE_SPOT_ETH_USD',
      });

      const prompt = marketMaker.definition.buildRoundPrompt({ roundNumber: 0 });

      expect(prompt).toContain('2024-01-01T00:00:00.000Z');
    });

    test('buildRoundPrompt includes monotonicity constraints', () => {
      setMarketMakerContext({
        chart4h5mUrl: 'https://example.com/chart-4h-5m',
        chart24h15mUrl: 'https://example.com/chart-24h-15m',
        orderbookData: 'mid_price: 3055.56, spread: 0.12, imbalance: 0.37, best_bid: 3055.50, best_ask: 3055.62',
        currentTime: '2024-01-01T00:00:00.000Z',
        symbolId: 'COINBASE_SPOT_ETH_USD',
      });

      const prompt = marketMaker.definition.buildRoundPrompt({ roundNumber: 0 });

      // Check for monotonicity constraint text
      expect(prompt.toLowerCase()).toContain('monoton');
      expect(prompt).toContain('bid-fill-15m >= bid-fill-5m >= bid-fill-1m');
      expect(prompt).toContain('ask-fill-15m >= ask-fill-5m >= ask-fill-1m');
    });

    test('buildRoundPrompt explains fill mechanics', () => {
      setMarketMakerContext({
        chart4h5mUrl: 'https://example.com/chart-4h-5m',
        chart24h15mUrl: 'https://example.com/chart-24h-15m',
        orderbookData: 'mid_price: 3055.56, spread: 0.12, imbalance: 0.37, best_bid: 3055.50, best_ask: 3055.62',
        currentTime: '2024-01-01T00:00:00.000Z',
        symbolId: 'COINBASE_SPOT_ETH_USD',
      });

      const prompt = marketMaker.definition.buildRoundPrompt({ roundNumber: 0 });

      // Should explain that limit BUY fills when market sells into it
      expect(prompt.toLowerCase()).toContain('limit');
      expect(prompt.toLowerCase()).toContain('fill');
    });

    test('buildRoundPrompt explains imbalance interpretation', () => {
      setMarketMakerContext({
        chart4h5mUrl: 'https://example.com/chart-4h-5m',
        chart24h15mUrl: 'https://example.com/chart-24h-15m',
        orderbookData: 'mid_price: 3055.56, spread: 0.12, imbalance: 0.37, best_bid: 3055.50, best_ask: 3055.62',
        currentTime: '2024-01-01T00:00:00.000Z',
        symbolId: 'COINBASE_SPOT_ETH_USD',
      });

      const prompt = marketMaker.definition.buildRoundPrompt({ roundNumber: 0 });

      // Should explain imbalance interpretation
      expect(prompt.toLowerCase()).toContain('imbalance');
    });

    test('buildRoundPrompt includes compaction summary when available', () => {
      setMarketMakerContext({
        chart4h5mUrl: 'https://example.com/chart-4h-5m',
        chart24h15mUrl: 'https://example.com/chart-24h-15m',
        orderbookData: 'mid_price: 3055.56, spread: 0.12, imbalance: 0.37, best_bid: 3055.50, best_ask: 3055.62',
        currentTime: '2024-01-01T00:00:00.000Z',
        symbolId: 'COINBASE_SPOT_ETH_USD',
      });

      const prompt = marketMaker.definition.buildRoundPrompt({
        roundNumber: 10,
        compactionSummary: 'Previous learning: High imbalance correlates with fills.',
      });

      expect(prompt).toContain('Previous learning: High imbalance correlates with fills.');
    });
  });

  describe('context management', () => {
    test('setMarketMakerContext and clearMarketMakerContext work', () => {
      // Initially, calling buildRoundPrompt should throw
      expect(() => {
        marketMaker.definition.buildRoundPrompt({ roundNumber: 0 });
      }).toThrow();

      // After setting context, it should work
      setMarketMakerContext({
        chart4h5mUrl: 'https://example.com/chart-4h-5m',
        chart24h15mUrl: 'https://example.com/chart-24h-15m',
        orderbookData: 'mid_price: 3055.56, spread: 0.12, imbalance: 0.37, best_bid: 3055.50, best_ask: 3055.62',
        currentTime: '2024-01-01T00:00:00.000Z',
        symbolId: 'COINBASE_SPOT_ETH_USD',
      });

      expect(() => {
        marketMaker.definition.buildRoundPrompt({ roundNumber: 0 });
      }).not.toThrow();

      // After clearing, it should throw again
      clearMarketMakerContext();

      expect(() => {
        marketMaker.definition.buildRoundPrompt({ roundNumber: 0 });
      }).toThrow();
    });
  });

  describe('compaction trigger', () => {
    test('compaction trigger is custom with shouldCompact function', () => {
      expect(marketMaker.definition.compactionTrigger?.type).toBe('custom');
      if (marketMaker.definition.compactionTrigger?.type === 'custom') {
        expect(typeof marketMaker.definition.compactionTrigger.shouldCompact).toBe('function');
      }
    });

    test('shouldCompact triggers every 10 rounds after round 0', () => {
      const trigger = marketMaker.definition.compactionTrigger;
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
      const result = marketMaker.definition.buildCompactionPrompt([]);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('buildCompactionPrompt handles empty history', () => {
      const result = marketMaker.definition.buildCompactionPrompt([]);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    test('buildCompactionPrompt mentions fill prediction context', () => {
      const result = marketMaker.definition.buildCompactionPrompt([]);
      expect(result.toLowerCase()).toContain('fill');
    });

    test('buildCompactionPrompt includes history length', () => {
      const history = [
        {
          roundNumber: 0,
          prompt: 'test prompt',
          output: {
            reasoning: 'test',
            predictions: {
              'bid-fill-1m': 0.3,
              'bid-fill-5m': 0.5,
              'bid-fill-15m': 0.7,
              'ask-fill-1m': 0.25,
              'ask-fill-5m': 0.45,
              'ask-fill-15m': 0.65,
            },
          },
          timestamp: '2024-01-01T00:00:00.000Z',
        },
        {
          roundNumber: 1,
          prompt: 'test prompt 2',
          output: {
            reasoning: 'test 2',
            predictions: {
              'bid-fill-1m': 0.35,
              'bid-fill-5m': 0.55,
              'bid-fill-15m': 0.75,
              'ask-fill-1m': 0.3,
              'ask-fill-5m': 0.5,
              'ask-fill-15m': 0.7,
            },
          },
          timestamp: '2024-01-01T00:01:00.000Z',
        },
      ];
      const result = marketMaker.definition.buildCompactionPrompt(history);
      expect(result).toContain('2');
    });
  });
});
/* eslint-enable sonarjs/no-duplicate-string -- Re-enable rule after test file */
