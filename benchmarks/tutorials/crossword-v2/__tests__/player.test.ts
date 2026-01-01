import { describe, test, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock game-state module
vi.mock('../src/game-state.js', () => ({
  getGameState: vi.fn(() => ({
    puzzle: { phrase: 'HELLO WORLD', category: 'Greeting' },
    guessedLetters: new Set(['E', 'L']),
    solved: false,
    failed: false,
  })),
  getCurrentBoard: vi.fn(() => 'HELL_ W__L_'),
}));

// Import player after mocking
import { player } from '../src/player.js';

describe('player agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('has correct id', () => {
    expect(player.definition.id).toBe('player_001');
  });

  test('has outputSchema defined', () => {
    expect(player.definition.outputSchema).toBeDefined();
    expect(player.definition.outputSchema).toBeInstanceOf(z.ZodObject);
  });

  test('outputSchema accepts valid letter guess', () => {
    const result = player.definition.outputSchema.safeParse({
      letter: 'e',
      reasoning: 'E is common',
    });
    expect(result.success).toBe(true);
  });

  test('outputSchema accepts valid phrase guess', () => {
    const result = player.definition.outputSchema.safeParse({
      guess: 'HELLO WORLD',
      reasoning: 'Based on pattern',
    });
    expect(result.success).toBe(true);
  });

  test('outputSchema accepts optional reasoning', () => {
    const result = player.definition.outputSchema.safeParse({
      letter: 'e',
    });
    expect(result.success).toBe(true);
  });

  test('outputSchema rejects letter longer than 1 character', () => {
    const result = player.definition.outputSchema.safeParse({
      letter: 'abc',
    });
    expect(result.success).toBe(false);
  });

  test('outputSchema rejects invalid types', () => {
    const result = player.definition.outputSchema.safeParse({
      letter: 123,
    });
    expect(result.success).toBe(false);
  });

  test('has buildRoundPrompt function', () => {
    expect(player.definition.buildRoundPrompt).toBeDefined();
    expect(typeof player.definition.buildRoundPrompt).toBe('function');
  });

  test('buildRoundPrompt returns string', () => {
    const prompt = player.definition.buildRoundPrompt({
      roundNumber: 1,
    });
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  test('buildRoundPrompt includes game instructions', () => {
    const prompt = player.definition.buildRoundPrompt({
      roundNumber: 1,
    });
    expect(prompt).toContain('word guessing game');
    expect(prompt).toContain('letter');
    expect(prompt).toContain('phrase');
  });

  test('buildRoundPrompt includes current board', () => {
    const prompt = player.definition.buildRoundPrompt({
      roundNumber: 1,
    });
    expect(prompt).toContain('HELL_ W__L_');
  });

  test('buildRoundPrompt includes category', () => {
    const prompt = player.definition.buildRoundPrompt({
      roundNumber: 1,
    });
    expect(prompt).toContain('Category: Greeting');
  });

  test('buildRoundPrompt includes guessed letters', () => {
    const prompt = player.definition.buildRoundPrompt({
      roundNumber: 1,
    });
    expect(prompt).toContain('Letters already guessed');
    expect(prompt).toContain('E');
    expect(prompt).toContain('L');
  });

  test('buildRoundPrompt includes compaction summary when provided', () => {
    const summary = 'Previous learnings: E and T are common';
    const prompt = player.definition.buildRoundPrompt({
      roundNumber: 5,
      compactionSummary: summary,
    });
    expect(prompt).toContain(summary);
  });

  test('buildRoundPrompt works without compaction summary', () => {
    const prompt = player.definition.buildRoundPrompt({
      roundNumber: 1,
    });
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  test('has buildCompactionPrompt function', () => {
    expect(player.definition.buildCompactionPrompt).toBeDefined();
    expect(typeof player.definition.buildCompactionPrompt).toBe('function');
  });

  test('buildCompactionPrompt returns string', () => {
    const prompt = player.definition.buildCompactionPrompt([
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
    const prompt = player.definition.buildCompactionPrompt(history);
    expect(prompt).toContain('4');
  });

  test('buildCompactionPrompt asks for pattern summary', () => {
    const history = [
      { roundNumber: 1, prompt: 'test', output: {}, timestamp: '2024-01-01' },
      { roundNumber: 2, prompt: 'test2', output: {}, timestamp: '2024-01-01' },
    ];
    const prompt = player.definition.buildCompactionPrompt(history);
    expect(prompt.toLowerCase()).toContain('pattern');
    expect(prompt.toLowerCase()).toContain('strateg');
  });

  test('throws error when no game state exists', async () => {
    const { getGameState } = await import('../src/game-state.js');
    vi.mocked(getGameState).mockReturnValueOnce(undefined);

    expect(() =>
      player.definition.buildRoundPrompt({ roundNumber: 1 })
    ).toThrow('No active game');
  });
});
