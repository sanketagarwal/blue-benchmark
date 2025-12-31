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
      chartByHorizon: {
        '15m': 'https://example.com/chart-15m.png',
        '1h': 'https://example.com/chart-1h.png',
        '24h': 'https://example.com/chart-24h.png',
        '7d': 'https://example.com/chart-7d.png',
      },
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

    it('builds prompt with chart URLs and horizon contracts', () => {
      const agent = createBottomCaller('anthropic/claude-haiku-4.5');
      const prompt = agent.definition.buildRoundPrompt({ roundNumber: 0 });
      expect(prompt).toContain('chart-15m.png');
      expect(prompt).toContain('chart-1h.png');
      expect(prompt).toContain('chart-24h.png');
      expect(prompt).toContain('chart-7d.png');
      expect(prompt).toContain('15-Minute Horizon');
      expect(prompt).toContain('1-Hour Horizon');
      expect(prompt).toContain('24-Hour Horizon');
      expect(prompt).toContain('7-Day Horizon');
    });

    it('builds compaction prompt with round count', () => {
      const agent = createBottomCaller('anthropic/claude-haiku-4.5');
      const mockHistory = [{ role: 'user', content: 'test' }, { role: 'assistant', content: 'response' }];
      const prompt = agent.definition.buildCompactionPrompt(mockHistory);
      expect(prompt).toContain('2 rounds');
      expect(prompt).toContain('learnings');
    });

    it('includes compaction summary in prompt when provided', () => {
      const agent = createBottomCaller('anthropic/claude-haiku-4.5');
      const prompt = agent.definition.buildRoundPrompt({
        roundNumber: 10,
        compactionSummary: 'Previous learnings: momentum divergence works well',
      });
      expect(prompt).toContain('Your past learnings:');
      expect(prompt).toContain('momentum divergence works well');
    });
  });
});
