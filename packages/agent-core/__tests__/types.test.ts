import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type {
  CompactionTrigger,
  CompactionContext,
  RoundContext,
  RoundHistory,
  RoundResult,
  AgentDefinition,
  Agent,
} from '../src/types.js';

describe('types', () => {
  describe('CompactionTrigger', () => {
    it('message-count trigger has correct structure', () => {
      const trigger: CompactionTrigger = {
        type: 'message-count',
        count: 10,
      };
      expect(trigger.type).toBe('message-count');
      expect(trigger.count).toBe(10);
    });

    it('context-window trigger has correct structure', () => {
      const trigger: CompactionTrigger = {
        type: 'context-window',
        modelId: 'openai/gpt-4o',
        threshold: 0.8,
      };
      expect(trigger.type).toBe('context-window');
      expect(trigger.modelId).toBe('openai/gpt-4o');
      expect(trigger.threshold).toBe(0.8);
    });

    it('custom trigger has correct structure', () => {
      const shouldCompact = (ctx: CompactionContext) => ctx.messageCount > 5;
      const trigger: CompactionTrigger = {
        type: 'custom',
        shouldCompact,
      };
      expect(trigger.type).toBe('custom');
      expect(trigger.shouldCompact).toBe(shouldCompact);
    });
  });

  describe('CompactionContext', () => {
    it('has required fields', () => {
      const ctx: CompactionContext = {
        roundNumber: 5,
        messageCount: 20,
        estimatedTokens: 5000,
        contextWindowSize: 128000,
      };
      expect(ctx.roundNumber).toBe(5);
      expect(ctx.messageCount).toBe(20);
      expect(ctx.estimatedTokens).toBe(5000);
      expect(ctx.contextWindowSize).toBe(128000);
    });

    it('has optional fields', () => {
      const ctx: CompactionContext = {
        roundNumber: 5,
        messageCount: 20,
        estimatedTokens: 5000,
        contextWindowSize: 128000,
        lastCompactionRound: 3,
        previousOutput: { result: 'test' },
      };
      expect(ctx.lastCompactionRound).toBe(3);
      expect(ctx.previousOutput).toEqual({ result: 'test' });
    });
  });

  describe('RoundContext', () => {
    it('has required fields', () => {
      const ctx: RoundContext<{ status: string }> = {
        roundNumber: 1,
      };
      expect(ctx.roundNumber).toBe(1);
    });

    it('has optional fields', () => {
      const ctx: RoundContext<{ status: string }> = {
        roundNumber: 2,
        previousOutput: { status: 'completed' },
        compactionSummary: 'Compacted 100 messages',
      };
      expect(ctx.roundNumber).toBe(2);
      expect(ctx.previousOutput).toEqual({ status: 'completed' });
      expect(ctx.compactionSummary).toBe('Compacted 100 messages');
    });
  });

  describe('RoundHistory', () => {
    it('has correct structure', () => {
      const history: RoundHistory<{ answer: string }> = {
        roundNumber: 1,
        prompt: 'What is 2+2?',
        output: { answer: '4' },
        timestamp: '2024-01-01T00:00:00Z',
      };
      expect(history.roundNumber).toBe(1);
      expect(history.prompt).toBe('What is 2+2?');
      expect(history.output).toEqual({ answer: '4' });
      expect(history.timestamp).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('RoundResult', () => {
    it('has correct structure', () => {
      const result: RoundResult<{ data: string }> = {
        output: { data: 'test' },
        roundNumber: 3,
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        wasCompacted: false,
      };
      expect(result.output).toEqual({ data: 'test' });
      expect(result.roundNumber).toBe(3);
      expect(result.usage.promptTokens).toBe(100);
      expect(result.usage.completionTokens).toBe(50);
      expect(result.usage.totalTokens).toBe(150);
      expect(result.wasCompacted).toBe(false);
    });
  });

  describe('AgentDefinition', () => {
    it('has required fields', () => {
      const schema = z.object({ result: z.string() });
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: (ctx) => `Round ${ctx.roundNumber}`,
        buildCompactionPrompt: (history) => `Compact ${history.length} items`,
      };
      expect(definition.id).toBe('test-agent');
      expect(definition.outputSchema).toBe(schema);
      expect(definition.buildRoundPrompt({ roundNumber: 1 })).toBe('Round 1');
      expect(definition.buildCompactionPrompt([])).toBe('Compact 0 items');
    });

    it('has optional fields', () => {
      const schema = z.object({ result: z.string() });
      const onRoundComplete = async (result: RoundResult<{ result: string }>) => {
        // do nothing
      };
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: (ctx) => `Round ${ctx.roundNumber}`,
        buildCompactionPrompt: (history) => `Compact ${history.length} items`,
        compactionTrigger: { type: 'message-count', count: 10 },
        systemPrompt: 'You are a helpful assistant',
        onRoundComplete,
      };
      expect(definition.compactionTrigger).toEqual({ type: 'message-count', count: 10 });
      expect(definition.systemPrompt).toBe('You are a helpful assistant');
      expect(definition.onRoundComplete).toBe(onRoundComplete);
    });
  });

  describe('Agent', () => {
    it('has readonly definition', () => {
      const schema = z.object({ result: z.string() });
      const definition: AgentDefinition<{ result: string }> = {
        id: 'test-agent',
        outputSchema: schema,
        buildRoundPrompt: (ctx) => `Round ${ctx.roundNumber}`,
        buildCompactionPrompt: (history) => `Compact ${history.length} items`,
      };
      const agent: Agent<{ result: string }> = {
        definition,
      };
      expect(agent.definition).toBe(definition);
    });
  });
});
