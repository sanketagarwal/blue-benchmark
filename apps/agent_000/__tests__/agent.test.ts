import { describe, test, expect, vi } from 'vitest';
import { z } from 'zod';

// Mock game-state module
vi.mock('../src/game-state.js', () => ({
  getOrCreateGameState: vi.fn(() => ({
    puzzle: { phrase: 'HELLO WORLD', category: 'Greeting' },
    guessedLetters: new Set(['E', 'L']),
    solved: false,
    failed: false,
  })),
  getCurrentBoard: vi.fn(() => 'HELL_ W__L_'),
}));

// Import agent after mocking
import { agent } from '../src/agent.js';

describe('agent', () => {
  test('has correct id', () => {
    expect(agent.definition.id).toBe('agent_000');
  });

  test('has outputSchema defined', () => {
    expect(agent.definition.outputSchema).toBeDefined();
    expect(agent.definition.outputSchema).toBeInstanceOf(z.ZodObject);
  });

  test('outputSchema accepts valid letter guess', () => {
    const result = agent.definition.outputSchema.safeParse({
      letter: 'e',
      reasoning: 'E is common',
    });
    expect(result.success).toBe(true);
  });

  test('outputSchema accepts valid phrase guess', () => {
    const result = agent.definition.outputSchema.safeParse({
      guess: 'HELLO WORLD',
      reasoning: 'Based on pattern',
    });
    expect(result.success).toBe(true);
  });

  test('outputSchema accepts optional reasoning', () => {
    const result = agent.definition.outputSchema.safeParse({
      letter: 'e',
    });
    expect(result.success).toBe(true);
  });

  test('outputSchema rejects letter longer than 1 character', () => {
    const result = agent.definition.outputSchema.safeParse({
      letter: 'abc',
    });
    expect(result.success).toBe(false);
  });

  test('outputSchema rejects invalid types', () => {
    const result = agent.definition.outputSchema.safeParse({
      letter: 123,
    });
    expect(result.success).toBe(false);
  });

  test('has buildRoundPrompt function', () => {
    expect(agent.definition.buildRoundPrompt).toBeDefined();
    expect(typeof agent.definition.buildRoundPrompt).toBe('function');
  });

  test('buildRoundPrompt returns string', () => {
    const prompt = agent.definition.buildRoundPrompt({
      roundNumber: 1,
    });
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  test('buildRoundPrompt includes game instructions', () => {
    const prompt = agent.definition.buildRoundPrompt({
      roundNumber: 1,
    });
    expect(prompt).toContain('word guessing game');
    expect(prompt).toContain('letter');
    expect(prompt).toContain('phrase');
  });

  test('buildRoundPrompt includes current board', () => {
    const prompt = agent.definition.buildRoundPrompt({
      roundNumber: 1,
    });
    expect(prompt).toContain('HELL_ W__L_');
  });

  test('buildRoundPrompt includes category', () => {
    const prompt = agent.definition.buildRoundPrompt({
      roundNumber: 1,
    });
    expect(prompt).toContain('Category: Greeting');
  });

  test('buildRoundPrompt includes guessed letters', () => {
    const prompt = agent.definition.buildRoundPrompt({
      roundNumber: 1,
    });
    expect(prompt).toContain('Letters already guessed');
    expect(prompt).toContain('E');
    expect(prompt).toContain('L');
  });

  test('buildRoundPrompt includes compaction summary when provided', () => {
    const summary = 'Previous learnings: E and T are common';
    const prompt = agent.definition.buildRoundPrompt({
      roundNumber: 5,
      compactionSummary: summary,
    });
    expect(prompt).toContain(summary);
  });

  test('buildRoundPrompt works without compaction summary', () => {
    const prompt = agent.definition.buildRoundPrompt({
      roundNumber: 1,
    });
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  test('has buildCompactionPrompt function', () => {
    expect(agent.definition.buildCompactionPrompt).toBeDefined();
    expect(typeof agent.definition.buildCompactionPrompt).toBe('function');
  });

  test('buildCompactionPrompt returns string', () => {
    const prompt = agent.definition.buildCompactionPrompt([
      { roundNumber: 1, prompt: 'test', output: {}, timestamp: '2024-01-01' },
      { roundNumber: 2, prompt: 'test2', output: {}, timestamp: '2024-01-01' },
    ]);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  test('buildCompactionPrompt references history length', () => {
    const history = [
      { roundNumber: 1, prompt: 'test1', output: {}, timestamp: '2024-01-01' },
      { roundNumber: 2, prompt: 'test2', output: {}, timestamp: '2024-01-01' },
      { roundNumber: 3, prompt: 'test3', output: {}, timestamp: '2024-01-01' },
      { roundNumber: 4, prompt: 'test4', output: {}, timestamp: '2024-01-01' },
    ];
    const prompt = agent.definition.buildCompactionPrompt(history);
    expect(prompt).toContain('4');
  });

  test('buildCompactionPrompt asks for pattern summary', () => {
    const history = [
      { roundNumber: 1, prompt: 'test', output: {}, timestamp: '2024-01-01' },
      { roundNumber: 2, prompt: 'test2', output: {}, timestamp: '2024-01-01' },
    ];
    const prompt = agent.definition.buildCompactionPrompt(history);
    expect(prompt.toLowerCase()).toContain('pattern');
    expect(prompt.toLowerCase()).toContain('strateg');
  });
});
