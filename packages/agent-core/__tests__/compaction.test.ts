import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { z } from 'zod';

import type { CompactionTrigger, AgentDefinition } from '../src/types.js';
import { estimateTokenCount, shouldCompact, runCompaction } from '../src/compaction.js';

import type { OpenAIProvider } from '@ai-sdk/openai';

// Create type-safe mock for OpenAI provider
// This mock will throw if unmocked methods are called
const mockOpenAIProvider = mockDeep<OpenAIProvider>({
  fallbackMockImplementation: () => {
    throw new Error('Unmocked OpenAI provider method called - add explicit mock');
  },
});

// Mock chat method to return a mock model
const mockChatModel = vi.fn().mockReturnValue('mock-model');
mockOpenAIProvider.chat.mockImplementation(mockChatModel);

// Mock the modules we depend on
vi.mock('../src/history.js', () => ({
  loadMessageHistory: vi.fn(),
  getCurrentRoundNumber: vi.fn(),
  loadRecentRounds: vi.fn(),
}));

vi.mock('../src/llm.js', () => ({
  getLLMClient: vi.fn(() => mockOpenAIProvider),
  getModelId: vi.fn(() => 'deepseek/deepseek-v3.2'),
  MODEL_CONTEXT_WINDOWS: {
    'openai/gpt-4o': 128_000,
    'openai/gpt-4o-mini': 128_000,
    'deepseek/deepseek-v3.2': 128_000,
    'anthropic/claude-sonnet-4': 200_000,
  },
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

vi.mock('@nullagent/database', () => ({
  getDatabase: vi.fn(() => ({
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  })),
  agentMessages: {},
}));

describe('compaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReset(mockOpenAIProvider);
    // Re-setup chat mock after reset
    mockOpenAIProvider.chat.mockImplementation(mockChatModel);
  });

  describe('estimateTokenCount', () => {
    it('returns 0 for empty messages', () => {
      const count = estimateTokenCount([]);
      expect(count).toBe(0);
    });

    it('estimates tokens at ~4 chars per token', () => {
      const messages = [{ content: 'a'.repeat(100) }];
      const count = estimateTokenCount(messages);
      expect(count).toBe(25);
    });

    it('sums tokens across multiple messages', () => {
      const messages = [{ content: 'a'.repeat(100) }, { content: 'b'.repeat(200) }];
      const count = estimateTokenCount(messages);
      expect(count).toBe(75);
    });
  });

  describe('shouldCompact - message-count trigger', () => {
    it('returns false when message count below threshold', async () => {
      const trigger: CompactionTrigger = { type: 'message-count', count: 10 };
      const messages = [{ content: 'test' }];

      const result = await shouldCompact(trigger, 'test-agent', messages);

      expect(result).toBe(false);
    });

    it('returns true when message count reaches threshold', async () => {
      const trigger: CompactionTrigger = { type: 'message-count', count: 3 };
      const messages = [{ content: 'a' }, { content: 'b' }, { content: 'c' }];

      const result = await shouldCompact(trigger, 'test-agent', messages);

      expect(result).toBe(true);
    });

    it('returns true when message count exceeds threshold', async () => {
      const trigger: CompactionTrigger = { type: 'message-count', count: 2 };
      const messages = [{ content: 'a' }, { content: 'b' }, { content: 'c' }];

      const result = await shouldCompact(trigger, 'test-agent', messages);

      expect(result).toBe(true);
    });
  });

  describe('shouldCompact - context-window trigger', () => {
    it('returns false when below threshold', async () => {
      const trigger: CompactionTrigger = {
        type: 'context-window',
        modelId: 'openai/gpt-4o',
        threshold: 0.8,
      };
      const messages = [{ content: 'short' }];

      const result = await shouldCompact(trigger, 'test-agent', messages);

      expect(result).toBe(false);
    });

    it('returns true when above threshold', async () => {
      const trigger: CompactionTrigger = {
        type: 'context-window',
        modelId: 'openai/gpt-4o',
        threshold: 0.1,
      };
      const messages = [{ content: 'a'.repeat(60000) }];

      const result = await shouldCompact(trigger, 'test-agent', messages);

      expect(result).toBe(true);
    });

    it('throws error for unknown model', async () => {
      const trigger: CompactionTrigger = {
        type: 'context-window',
        modelId: 'unknown/model',
        threshold: 0.8,
      };
      const messages = [{ content: 'test' }];

      await expect(shouldCompact(trigger, 'test-agent', messages)).rejects.toThrow(
        'Unknown model ID: unknown/model'
      );
    });
  });

  describe('shouldCompact - custom trigger', () => {
    it('calls custom function with correct context', async () => {
      const shouldCompactFn = vi.fn().mockReturnValue(false);
      const trigger: CompactionTrigger = {
        type: 'custom',
        shouldCompact: shouldCompactFn,
      };
      const messages = [{ content: 'test' }];

      const { getCurrentRoundNumber } = await import('../src/history.js');
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(5);

      await shouldCompact(trigger, 'test-agent', messages);

      expect(shouldCompactFn).toHaveBeenCalledWith({
        roundNumber: 5,
        messageCount: 1,
        estimatedTokens: expect.any(Number),
        contextWindowSize: expect.any(Number),
      });
    });

    it('returns result from custom function', async () => {
      const trigger: CompactionTrigger = {
        type: 'custom',
        shouldCompact: () => true,
      };
      const messages = [{ content: 'test' }];

      const { getCurrentRoundNumber } = await import('../src/history.js');
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(5);

      const result = await shouldCompact(trigger, 'test-agent', messages);

      expect(result).toBe(true);
    });

    it('handles async custom functions', async () => {
      const trigger: CompactionTrigger = {
        type: 'custom',
        shouldCompact: async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return true;
        },
      };
      const messages = [{ content: 'test' }];

      const { getCurrentRoundNumber } = await import('../src/history.js');
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(5);

      const result = await shouldCompact(trigger, 'test-agent', messages);

      expect(result).toBe(true);
    });

    it('throws error for unknown model in custom trigger', async () => {
      const trigger: CompactionTrigger = {
        type: 'custom',
        shouldCompact: () => true,
      };
      const messages = [{ content: 'test' }];

      const { getCurrentRoundNumber } = await import('../src/history.js');
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(5);

      const { getModelId } = await import('../src/llm.js');
      vi.mocked(getModelId).mockReturnValue('unknown/model');

      await expect(shouldCompact(trigger, 'test-agent', messages)).rejects.toThrow(
        'Unknown model ID: unknown/model'
      );
    });
  });

  describe('runCompaction', () => {
    it('uses chat completions API (not responses API) for AI Gateway compatibility', async () => {
      const schema = z.object({ result: z.string() });
      const agent: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: () => 'prompt',
        buildCompactionPrompt: () => 'Compact history',
      };

      const { loadRecentRounds } = await import('../src/history.js');
      vi.mocked(loadRecentRounds).mockResolvedValue([]);

      // Ensure getModelId returns the expected model
      const { getModelId } = await import('../src/llm.js');
      vi.mocked(getModelId).mockReturnValue('deepseek/deepseek-v3.2');

      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValue({
        text: 'Summary',
      } as never);

      await runCompaction(agent);

      // Critical: Verify .chat() is called, not the provider directly
      // This ensures we use chat completions API which AI Gateway supports
      expect(mockOpenAIProvider.chat).toHaveBeenCalledWith('deepseek/deepseek-v3.2');
    });

    it('loads recent rounds and generates compaction summary', async () => {
      const schema = z.object({ result: z.string() });
      const agent: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: () => 'prompt',
        buildCompactionPrompt: (history) => `Compact ${history.length} rounds`,
      };

      const { loadRecentRounds } = await import('../src/history.js');
      vi.mocked(loadRecentRounds).mockResolvedValue([
        {
          roundNumber: 1,
          prompt: 'What is 2+2?',
          output: { result: '4' },
          timestamp: '2024-01-01T00:00:00Z',
        },
      ]);

      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValue({
        text: 'Compaction summary: 1 round completed',
      } as never);

      const summary = await runCompaction(agent);

      expect(summary).toBe('Compaction summary: 1 round completed');
      expect(loadRecentRounds).toHaveBeenCalledWith('test-agent', 100);
    });

    it('saves compaction summary to database', async () => {
      const schema = z.object({ result: z.string() });
      const agent: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: () => 'prompt',
        buildCompactionPrompt: () => 'Compact',
      };

      const { loadRecentRounds } = await import('../src/history.js');
      vi.mocked(loadRecentRounds).mockResolvedValue([]);

      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValue({
        text: 'Summary',
      } as never);

      const insertMock = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const { getDatabase } = await import('@nullagent/database');
      vi.mocked(getDatabase).mockReturnValue({
        insert: insertMock,
      } as never);

      await runCompaction(agent);

      expect(insertMock).toHaveBeenCalled();
    });
  });
});
