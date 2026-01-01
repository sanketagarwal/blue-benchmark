import { describe, test, expect } from 'vitest';
import { z } from 'zod';

import { puzzleMaster } from '../src/puzzle-master.js';

describe('puzzleMaster agent', () => {
  test('has correct id', () => {
    expect(puzzleMaster.definition.id).toBe('puzzle_master_001');
  });

  test('has outputSchema defined', () => {
    expect(puzzleMaster.definition.outputSchema).toBeDefined();
    expect(puzzleMaster.definition.outputSchema).toBeInstanceOf(z.ZodObject);
  });

  test('outputSchema accepts valid puzzle', () => {
    const result = puzzleMaster.definition.outputSchema.safeParse({
      phrase: 'HELLO WORLD',
      category: 'Greeting',
      reasoning: 'A common phrase',
    });
    expect(result.success).toBe(true);
  });

  test('outputSchema accepts puzzle without reasoning', () => {
    const result = puzzleMaster.definition.outputSchema.safeParse({
      phrase: 'HELLO WORLD',
      category: 'Greeting',
    });
    expect(result.success).toBe(true);
  });

  test('outputSchema rejects too short phrase', () => {
    const result = puzzleMaster.definition.outputSchema.safeParse({
      phrase: 'HI',
      category: 'Greeting',
    });
    expect(result.success).toBe(false);
  });

  test('outputSchema rejects too long phrase', () => {
    const result = puzzleMaster.definition.outputSchema.safeParse({
      phrase: 'A'.repeat(51),
      category: 'Test',
    });
    expect(result.success).toBe(false);
  });

  test('outputSchema rejects too short category', () => {
    const result = puzzleMaster.definition.outputSchema.safeParse({
      phrase: 'HELLO',
      category: 'HI',
    });
    expect(result.success).toBe(false);
  });

  test('outputSchema rejects too long category', () => {
    const result = puzzleMaster.definition.outputSchema.safeParse({
      phrase: 'HELLO',
      category: 'A'.repeat(31),
    });
    expect(result.success).toBe(false);
  });

  test('outputSchema rejects missing phrase', () => {
    const result = puzzleMaster.definition.outputSchema.safeParse({
      category: 'Test',
    });
    expect(result.success).toBe(false);
  });

  test('outputSchema rejects missing category', () => {
    const result = puzzleMaster.definition.outputSchema.safeParse({
      phrase: 'HELLO',
    });
    expect(result.success).toBe(false);
  });

  test('has buildRoundPrompt function', () => {
    expect(puzzleMaster.definition.buildRoundPrompt).toBeDefined();
    expect(typeof puzzleMaster.definition.buildRoundPrompt).toBe('function');
  });

  test('buildRoundPrompt returns string', () => {
    const prompt = puzzleMaster.definition.buildRoundPrompt({
      roundNumber: 1,
    });
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  test('buildRoundPrompt includes puzzle creation instructions', () => {
    const prompt = puzzleMaster.definition.buildRoundPrompt({
      roundNumber: 1,
    });
    expect(prompt).toContain('Puzzle Master');
    expect(prompt).toContain('word guessing game');
  });

  test('buildRoundPrompt mentions categories', () => {
    const prompt = puzzleMaster.definition.buildRoundPrompt({
      roundNumber: 1,
    });
    expect(prompt.toLowerCase()).toContain('categor');
    expect(prompt).toContain('Phrase');
  });

  test('buildRoundPrompt mentions requirements', () => {
    const prompt = puzzleMaster.definition.buildRoundPrompt({
      roundNumber: 1,
    });
    expect(prompt.toLowerCase()).toContain('phrase');
    expect(prompt.toLowerCase()).toContain('category');
  });

  test('buildRoundPrompt includes compaction summary when provided', () => {
    const summary = 'Previous puzzle learnings: varied categories work well';
    const prompt = puzzleMaster.definition.buildRoundPrompt({
      roundNumber: 5,
      compactionSummary: summary,
    });
    expect(prompt).toContain(summary);
  });

  test('buildRoundPrompt works without compaction summary', () => {
    const prompt = puzzleMaster.definition.buildRoundPrompt({
      roundNumber: 1,
    });
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  test('has buildCompactionPrompt function', () => {
    expect(puzzleMaster.definition.buildCompactionPrompt).toBeDefined();
    expect(typeof puzzleMaster.definition.buildCompactionPrompt).toBe('function');
  });

  test('buildCompactionPrompt returns string', () => {
    const prompt = puzzleMaster.definition.buildCompactionPrompt([
      { roundNumber: 1, prompt: 'test', output: { phrase: 'HELLO', category: 'Test' }, timestamp: '2024-01-01' },
      { roundNumber: 2, prompt: 'test2', output: { phrase: 'WORLD', category: 'Test' }, timestamp: '2024-01-01' },
    ]);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  test('buildCompactionPrompt references history length', () => {
    const history = [
      { roundNumber: 1, prompt: 'test1', output: { phrase: 'A', category: 'A' }, timestamp: '2024-01-01' },
      { roundNumber: 2, prompt: 'test2', output: { phrase: 'B', category: 'B' }, timestamp: '2024-01-01' },
      { roundNumber: 3, prompt: 'test3', output: { phrase: 'C', category: 'C' }, timestamp: '2024-01-01' },
    ];
    const prompt = puzzleMaster.definition.buildCompactionPrompt(history);
    expect(prompt).toContain('3');
  });

  test('buildCompactionPrompt asks about puzzle creation patterns', () => {
    const history = [
      { roundNumber: 1, prompt: 'test', output: { phrase: 'HELLO', category: 'Test' }, timestamp: '2024-01-01' },
      { roundNumber: 2, prompt: 'test2', output: { phrase: 'WORLD', category: 'Test' }, timestamp: '2024-01-01' },
    ];
    const prompt = puzzleMaster.definition.buildCompactionPrompt(history);
    expect(prompt.toLowerCase()).toContain('categor');
  });

  test('has compactionTrigger defined', () => {
    expect(puzzleMaster.definition.compactionTrigger).toBeDefined();
    expect(puzzleMaster.definition.compactionTrigger?.type).toBe('custom');
  });
});
