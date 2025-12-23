import { describe, test, expect } from 'vitest';

import { defineScorer } from '../src/define-scorer.js';

import type { ScorerResult } from '../src/types.js';

interface TestInput {
  value: number;
}

interface TestResult extends ScorerResult {
  score: number;
  doubled: number;
}

describe('defineScorer', () => {
  test('creates a scorer with the provided definition', () => {
    const scorer = defineScorer<TestInput, TestResult>({
      id: 'test_scorer',
      name: 'Test Scorer',
      score(input) {
        return {
          score: input.value / 100,
          doubled: input.value * 2,
        };
      },
    });

    expect(scorer.id).toBe('test_scorer');
    expect(scorer.name).toBe('Test Scorer');
  });

  test('score function returns correct result', () => {
    const scorer = defineScorer<TestInput, TestResult>({
      id: 'test_scorer',
      name: 'Test Scorer',
      score(input) {
        return {
          score: input.value / 100,
          doubled: input.value * 2,
        };
      },
    });

    const result = scorer.score({ value: 50 });
    expect(result.score).toBe(0.5);
    expect(result.doubled).toBe(100);
  });

  test('supports async score functions', async () => {
    const scorer = defineScorer<TestInput, TestResult>({
      id: 'async_scorer',
      name: 'Async Scorer',
      async score(input) {
        return {
          score: input.value / 100,
          doubled: input.value * 2,
        };
      },
    });

    const result = await scorer.score({ value: 75 });
    expect(result.score).toBe(0.75);
    expect(result.doubled).toBe(150);
  });
});
