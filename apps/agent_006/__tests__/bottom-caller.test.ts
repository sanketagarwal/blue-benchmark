import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  createBottomCaller,
  setBottomCallerContext,
  clearBottomCallerContext,
  BOTTOM_CONTRACT_IDS,
  type BottomCallerContext,
} from '../src/bottom-caller.js';

describe('bottom-caller', () => {
  describe('BOTTOM_CONTRACT_IDS', () => {
    it('has 4 horizon contracts', () => {
      expect(BOTTOM_CONTRACT_IDS).toEqual([
        'bottom-15m',
        'bottom-1h',
        'bottom-24h',
        'bottom-7d',
      ]);
    });
  });

  describe('createBottomCaller', () => {
    const mockContext: BottomCallerContext = {
      chart4h5mUrl: 'https://example.com/chart1.png',
      chart24h15mUrl: 'https://example.com/chart2.png',
      orderbookData: 'mid=100,spread=0.1',
      currentTime: '2025-01-01T00:00:00Z',
      symbolId: 'COINBASE_SPOT_BTC_USD',
    };

    beforeEach(() => {
      setBottomCallerContext(mockContext);
    });

    afterEach(() => {
      clearBottomCallerContext();
    });

    it('creates agent with model-specific ID', () => {
      const agent = createBottomCaller('anthropic/claude-haiku-4.5');
      expect(agent.definition.id).toBe('bottom_caller_anthropic_claude-haiku-4.5');
    });

    it('includes output schema with bottom predictions', () => {
      const agent = createBottomCaller('anthropic/claude-haiku-4.5');
      expect(agent.definition.outputSchema).toBeDefined();
    });

    it('throws if context not set', () => {
      clearBottomCallerContext();
      const agent = createBottomCaller('anthropic/claude-haiku-4.5');
      expect(() => agent.definition.buildRoundPrompt({ roundNumber: 0 })).toThrow(
        'Bottom caller context not set'
      );
    });

    it('builds prompt with chart URLs and orderbook', () => {
      const agent = createBottomCaller('anthropic/claude-haiku-4.5');
      const prompt = agent.definition.buildRoundPrompt({ roundNumber: 0 });
      expect(prompt).toContain('chart1.png');
      expect(prompt).toContain('chart2.png');
      expect(prompt).toContain('mid=100');
      expect(prompt).toContain('bottom-15m');
      expect(prompt).toContain('bottom-1h');
      expect(prompt).toContain('bottom-24h');
      expect(prompt).toContain('bottom-7d');
    });
  });
});
