import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { z } from 'zod';

import type { AgentDefinition } from '../src/types.js';
import { defineAgent, runRound } from '../src/run-round.js';

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

// Mock all dependencies
vi.mock('../src/history.js', () => ({
  loadMessageHistory: vi.fn(),
  saveRoundPrompt: vi.fn(),
  saveRoundOutput: vi.fn(),
  getCurrentRoundNumber: vi.fn(),
}));

vi.mock('../src/compaction.js', () => ({
  shouldCompact: vi.fn(),
  runCompaction: vi.fn(),
}));

vi.mock('../src/llm.js', () => ({
  getLLMClient: vi.fn(() => mockOpenAIProvider),
  getModelId: vi.fn(() => 'deepseek/deepseek-v3.2'),
}));

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

describe('run-round', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReset(mockOpenAIProvider);
    // Re-setup chat mock after reset
    mockOpenAIProvider.chat.mockImplementation(mockChatModel);
  });

  describe('defineAgent', () => {
    it('creates an agent from definition', () => {
      const schema = z.object({ result: z.string() });
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: (ctx) => `Round ${ctx.roundNumber}`,
        buildCompactionPrompt: (history) => `Compact ${history.length}`,
      };

      const agent = defineAgent(definition);

      expect(agent.definition).toBe(definition);
    });

    it('creates agent with readonly definition', () => {
      const schema = z.object({ result: z.string() });
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: () => 'prompt',
        buildCompactionPrompt: () => 'compact',
      };

      const agent = defineAgent(definition);

      expect(() => {
        // @ts-expect-error - readonly property
        agent.definition = {} as never;
      }).toThrow();
    });
  });

  describe('runRound', () => {
    it('uses chat completions API (not responses API) for AI Gateway compatibility', async () => {
      const schema = z.object({ result: z.string() });
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: () => 'What is 2+2?',
        buildCompactionPrompt: () => 'Compact',
      };
      const agent = defineAgent(definition);

      const { loadMessageHistory, getCurrentRoundNumber } = await import('../src/history.js');
      vi.mocked(loadMessageHistory).mockResolvedValue([]);
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(1);

      const { shouldCompact } = await import('../src/compaction.js');
      vi.mocked(shouldCompact).mockResolvedValue(false);

      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValue({
        object: { result: '4' },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as never);

      await runRound(agent);

      // Critical: Verify .chat() is called, not the provider directly
      // This ensures we use chat completions API which AI Gateway supports
      expect(mockOpenAIProvider.chat).toHaveBeenCalledWith('deepseek/deepseek-v3.2');
    });

    it('loads message history and current round number', async () => {
      const schema = z.object({ result: z.string() });
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: () => 'What is 2+2?',
        buildCompactionPrompt: () => 'Compact',
      };
      const agent = defineAgent(definition);

      const { loadMessageHistory, getCurrentRoundNumber } = await import('../src/history.js');
      vi.mocked(loadMessageHistory).mockResolvedValue([]);
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(1);

      const { shouldCompact } = await import('../src/compaction.js');
      vi.mocked(shouldCompact).mockResolvedValue(false);

      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValue({
        object: { result: '4' },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as never);

      await runRound(agent);

      expect(loadMessageHistory).toHaveBeenCalledWith('test-agent', undefined);
      expect(getCurrentRoundNumber).toHaveBeenCalledWith('test-agent');
    });

    it('saves prompt and output to history', async () => {
      const schema = z.object({ result: z.string() });
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: () => 'What is 2+2?',
        buildCompactionPrompt: () => 'Compact',
      };
      const agent = defineAgent(definition);

      const { loadMessageHistory, getCurrentRoundNumber, saveRoundPrompt, saveRoundOutput } =
        await import('../src/history.js');
      vi.mocked(loadMessageHistory).mockResolvedValue([]);
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(1);
      vi.mocked(saveRoundPrompt).mockResolvedValue(undefined);
      vi.mocked(saveRoundOutput).mockResolvedValue(undefined);

      const { shouldCompact } = await import('../src/compaction.js');
      vi.mocked(shouldCompact).mockResolvedValue(false);

      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValue({
        object: { result: '4' },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as never);

      await runRound(agent);

      expect(saveRoundPrompt).toHaveBeenCalledWith(
        'test-agent',
        'What is 2+2?',
        1,
        expect.any(String)
      );
      expect(saveRoundOutput).toHaveBeenCalledWith(
        'test-agent',
        expect.any(String),
        { result: '4' },
        1,
        expect.any(String)
      );
    });

    it('returns round result with output and usage', async () => {
      const schema = z.object({ result: z.string() });
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: () => 'What is 2+2?',
        buildCompactionPrompt: () => 'Compact',
      };
      const agent = defineAgent(definition);

      const { loadMessageHistory, getCurrentRoundNumber } = await import('../src/history.js');
      vi.mocked(loadMessageHistory).mockResolvedValue([]);
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(1);

      const { shouldCompact } = await import('../src/compaction.js');
      vi.mocked(shouldCompact).mockResolvedValue(false);

      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValue({
        object: { result: '4' },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as never);

      const result = await runRound(agent);

      expect(result.output).toEqual({ result: '4' });
      expect(result.roundNumber).toBe(1);
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
      expect(result.wasCompacted).toBe(false);
    });

    it('runs compaction when threshold met', async () => {
      const schema = z.object({ result: z.string() });
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: () => 'What is 2+2?',
        buildCompactionPrompt: () => 'Compact',
        compactionTrigger: { type: 'message-count', count: 5 },
      };
      const agent = defineAgent(definition);

      const { loadMessageHistory, getCurrentRoundNumber } = await import('../src/history.js');
      vi.mocked(loadMessageHistory).mockResolvedValue([
        { role: 'user', content: 'msg1' },
        { role: 'assistant', content: 'msg2' },
        { role: 'user', content: 'msg3' },
        { role: 'assistant', content: 'msg4' },
        { role: 'user', content: 'msg5' },
      ]);
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(3);

      const { shouldCompact, runCompaction } = await import('../src/compaction.js');
      vi.mocked(shouldCompact).mockResolvedValue(true);
      vi.mocked(runCompaction).mockResolvedValue('Compacted 5 messages');

      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValue({
        object: { result: '4' },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as never);

      const result = await runRound(agent);

      expect(runCompaction).toHaveBeenCalledWith(definition, undefined);
      expect(result.wasCompacted).toBe(true);
    });

    it('skips compaction when no trigger defined', async () => {
      const schema = z.object({ result: z.string() });
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: () => 'What is 2+2?',
        buildCompactionPrompt: () => 'Compact',
      };
      const agent = defineAgent(definition);

      const { loadMessageHistory, getCurrentRoundNumber } = await import('../src/history.js');
      vi.mocked(loadMessageHistory).mockResolvedValue([
        { role: 'user', content: 'msg1' },
        { role: 'assistant', content: 'msg2' },
      ]);
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(2);

      const { shouldCompact } = await import('../src/compaction.js');
      const shouldCompactSpy = vi.mocked(shouldCompact);

      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValue({
        object: { result: '4' },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as never);

      const result = await runRound(agent);

      expect(shouldCompactSpy).not.toHaveBeenCalled();
      expect(result.wasCompacted).toBe(false);
    });

    it('calls onRoundComplete callback if defined', async () => {
      const onRoundComplete = vi.fn();
      const schema = z.object({ result: z.string() });
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: () => 'What is 2+2?',
        buildCompactionPrompt: () => 'Compact',
        onRoundComplete,
      };
      const agent = defineAgent(definition);

      const { loadMessageHistory, getCurrentRoundNumber } = await import('../src/history.js');
      vi.mocked(loadMessageHistory).mockResolvedValue([]);
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(1);

      const { shouldCompact } = await import('../src/compaction.js');
      vi.mocked(shouldCompact).mockResolvedValue(false);

      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValue({
        object: { result: '4' },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as never);

      await runRound(agent);

      expect(onRoundComplete).toHaveBeenCalledWith({
        output: { result: '4' },
        roundNumber: 1,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        wasCompacted: false,
        traceId: expect.any(String),
      });
    });

    it('provides previousOutput in round context', async () => {
      const buildRoundPrompt = vi.fn().mockReturnValue('What is next?');
      const schema = z.object({ result: z.string() });
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt,
        buildCompactionPrompt: () => 'Compact',
      };
      const agent = defineAgent(definition);

      const { loadMessageHistory, getCurrentRoundNumber } = await import('../src/history.js');
      vi.mocked(loadMessageHistory).mockResolvedValue([
        { role: 'user', content: 'prompt' },
        { role: 'assistant', content: '{"result":"previous"}' },
      ]);
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(2);

      const { shouldCompact } = await import('../src/compaction.js');
      vi.mocked(shouldCompact).mockResolvedValue(false);

      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValue({
        object: { result: 'next' },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as never);

      await runRound(agent);

      expect(buildRoundPrompt).toHaveBeenCalledWith({
        roundNumber: 2,
        previousOutput: { result: 'previous' },
      });
    });

    it('generates traceId when not provided', async () => {
      const schema = z.object({ result: z.string() });
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: () => 'What is 2+2?',
        buildCompactionPrompt: () => 'Compact',
      };
      const agent = defineAgent(definition);

      const { loadMessageHistory, getCurrentRoundNumber, saveRoundPrompt, saveRoundOutput } =
        await import('../src/history.js');
      vi.mocked(loadMessageHistory).mockResolvedValue([]);
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(1);
      vi.mocked(saveRoundPrompt).mockResolvedValue(undefined);
      vi.mocked(saveRoundOutput).mockResolvedValue(undefined);

      const { shouldCompact } = await import('../src/compaction.js');
      vi.mocked(shouldCompact).mockResolvedValue(false);

      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValue({
        object: { result: '4' },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as never);

      const result = await runRound(agent);

      expect(result.traceId).toBeDefined();
      expect(typeof result.traceId).toBe('string');
      expect(result.traceId.length).toBeGreaterThan(0);

      // Verify traceId is passed to save functions
      expect(saveRoundPrompt).toHaveBeenCalledWith(
        'test-agent',
        'What is 2+2?',
        1,
        result.traceId
      );
      expect(saveRoundOutput).toHaveBeenCalledWith(
        'test-agent',
        expect.any(String),
        { result: '4' },
        1,
        result.traceId
      );
    });

    it('uses provided traceId when specified', async () => {
      const schema = z.object({ result: z.string() });
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: () => 'What is 2+2?',
        buildCompactionPrompt: () => 'Compact',
      };
      const agent = defineAgent(definition);

      const { loadMessageHistory, getCurrentRoundNumber, saveRoundPrompt, saveRoundOutput } =
        await import('../src/history.js');
      vi.mocked(loadMessageHistory).mockResolvedValue([]);
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(1);
      vi.mocked(saveRoundPrompt).mockResolvedValue(undefined);
      vi.mocked(saveRoundOutput).mockResolvedValue(undefined);

      const { shouldCompact } = await import('../src/compaction.js');
      vi.mocked(shouldCompact).mockResolvedValue(false);

      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValue({
        object: { result: '4' },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as never);

      const customTraceId = 'custom-trace-id-123';
      const result = await runRound(agent, { traceId: customTraceId });

      expect(result.traceId).toBe(customTraceId);

      // Verify traceId is passed to save functions
      expect(saveRoundPrompt).toHaveBeenCalledWith(
        'test-agent',
        'What is 2+2?',
        1,
        customTraceId
      );
      expect(saveRoundOutput).toHaveBeenCalledWith(
        'test-agent',
        expect.any(String),
        { result: '4' },
        1,
        customTraceId
      );
    });

    it('includes traceId in onRoundComplete callback', async () => {
      const onRoundComplete = vi.fn();
      const schema = z.object({ result: z.string() });
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: () => 'What is 2+2?',
        buildCompactionPrompt: () => 'Compact',
        onRoundComplete,
      };
      const agent = defineAgent(definition);

      const { loadMessageHistory, getCurrentRoundNumber } = await import('../src/history.js');
      vi.mocked(loadMessageHistory).mockResolvedValue([]);
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(1);

      const { shouldCompact } = await import('../src/compaction.js');
      vi.mocked(shouldCompact).mockResolvedValue(false);

      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValue({
        object: { result: '4' },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as never);

      const customTraceId = 'trace-123';
      await runRound(agent, { traceId: customTraceId });

      expect(onRoundComplete).toHaveBeenCalledWith({
        output: { result: '4' },
        roundNumber: 1,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        wasCompacted: false,
        traceId: customTraceId,
      });
    });

    it('passes since option to loadMessageHistory for session isolation', async () => {
      const schema = z.object({ result: z.string() });
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: () => 'What is 2+2?',
        buildCompactionPrompt: () => 'Compact',
      };
      const agent = defineAgent(definition);

      const { loadMessageHistory, getCurrentRoundNumber } = await import('../src/history.js');
      vi.mocked(loadMessageHistory).mockResolvedValue([]);
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(1);

      const { shouldCompact } = await import('../src/compaction.js');
      vi.mocked(shouldCompact).mockResolvedValue(false);

      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValue({
        object: { result: '4' },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as never);

      const sinceDate = new Date('2024-01-01T00:00:00Z');
      await runRound(agent, { since: sinceDate });

      expect(loadMessageHistory).toHaveBeenCalledWith('test-agent', { since: sinceDate });
    });

    it('uses provided modelId instead of environment variable', async () => {
      const schema = z.object({ result: z.string() });
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: () => 'What is 2+2?',
        buildCompactionPrompt: () => 'Compact',
      };
      const agent = defineAgent(definition);

      const { loadMessageHistory, getCurrentRoundNumber } = await import('../src/history.js');
      vi.mocked(loadMessageHistory).mockResolvedValue([]);
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(1);

      const { shouldCompact } = await import('../src/compaction.js');
      vi.mocked(shouldCompact).mockResolvedValue(false);

      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValue({
        object: { result: '4' },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as never);

      const customModelId = 'anthropic/claude-3-opus';
      await runRound(agent, { modelId: customModelId });

      expect(mockOpenAIProvider.chat).toHaveBeenCalledWith(customModelId);
    });

    it('isolates parallel runs with different agents using since option', async () => {
      const schema = z.object({ result: z.string() });

      const agent1 = defineAgent({
        id: 'agent-1',
        outputSchema: schema,
        buildRoundPrompt: () => 'Agent 1 prompt',
        buildCompactionPrompt: () => 'Compact',
      });

      const agent2 = defineAgent({
        id: 'agent-2',
        outputSchema: schema,
        buildRoundPrompt: () => 'Agent 2 prompt',
        buildCompactionPrompt: () => 'Compact',
      });

      const { loadMessageHistory, getCurrentRoundNumber, saveRoundPrompt, saveRoundOutput } =
        await import('../src/history.js');
      vi.mocked(loadMessageHistory).mockResolvedValue([]);
      vi.mocked(getCurrentRoundNumber).mockResolvedValue(1);
      vi.mocked(saveRoundPrompt).mockResolvedValue(undefined);
      vi.mocked(saveRoundOutput).mockResolvedValue(undefined);

      const { shouldCompact } = await import('../src/compaction.js');
      vi.mocked(shouldCompact).mockResolvedValue(false);

      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValue({
        object: { result: 'done' },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as never);

      const sharedSince = new Date('2024-06-01T12:00:00Z');

      await Promise.all([
        runRound(agent1, { modelId: 'model-a', since: sharedSince }),
        runRound(agent2, { modelId: 'model-b', since: sharedSince }),
      ]);

      expect(loadMessageHistory).toHaveBeenCalledWith('agent-1', { since: sharedSince });
      expect(loadMessageHistory).toHaveBeenCalledWith('agent-2', { since: sharedSince });

      expect(saveRoundPrompt).toHaveBeenCalledWith('agent-1', 'Agent 1 prompt', 1, expect.any(String));
      expect(saveRoundPrompt).toHaveBeenCalledWith('agent-2', 'Agent 2 prompt', 1, expect.any(String));

      expect(mockOpenAIProvider.chat).toHaveBeenCalledWith('model-a');
      expect(mockOpenAIProvider.chat).toHaveBeenCalledWith('model-b');
    });
  });
});
