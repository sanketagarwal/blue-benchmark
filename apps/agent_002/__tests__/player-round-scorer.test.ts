import { describe, test, expect } from 'vitest';

import { playerRoundScorer } from '../src/scorers/player-round-scorer.js';

import type { PlayerRoundInput, PlayerRoundResult } from '../src/scorers/player-round-scorer.js';

/**
 * Helper to ensure synchronous scorer result
 */
function scoreSync(input: PlayerRoundInput): PlayerRoundResult {
  const result = playerRoundScorer.score(input);
  if (result instanceof Promise) {
    throw new Error('Expected synchronous result');
  }
  return result;
}

describe('playerRoundScorer', () => {
  test('has correct id and name', () => {
    expect(playerRoundScorer.id).toBe('player_round_scorer');
    expect(playerRoundScorer.name).toBe('Player Round Scorer');
  });

  test('scores correct easy guess as 0.5', () => {
    const result = scoreSync({
      puzzlePhrase: 'HELLO',
      boardBefore: 'HELLO',  // all revealed = easy (difficulty 0)
      boardAfter: 'HELLO',
      move: { letter: 'O' },
      result: 'found',
    });

    expect(result.correctness).toBe(1);
    expect(result.difficulty).toBe(0);
    expect(result.score).toBe(0.5);
  });

  test('scores correct hard guess as 1.0', () => {
    const result = scoreSync({
      puzzlePhrase: 'HELLO',
      boardBefore: '_____',  // all hidden = hard (difficulty 1)
      boardAfter: '____O',
      move: { letter: 'O' },
      result: 'found',
    });

    expect(result.correctness).toBe(1);
    expect(result.difficulty).toBe(1);
    expect(result.score).toBe(1);
  });

  test('scores correct medium difficulty guess', () => {
    const result = scoreSync({
      puzzlePhrase: 'HELLO',
      boardBefore: 'HE___',  // 3/5 hidden = 0.6 difficulty
      boardAfter: 'HELL_',
      move: { letter: 'L' },
      result: 'found',
    });

    expect(result.correctness).toBe(1);
    expect(result.difficulty).toBeCloseTo(0.6);
    expect(result.score).toBeCloseTo(0.8);  // 0.5 + 0.6 * 0.5 = 0.8
  });

  test('scores incorrect guess as 0', () => {
    const result = scoreSync({
      puzzlePhrase: 'HELLO',
      boardBefore: '_____',
      boardAfter: '_____',
      move: { letter: 'X' },
      result: 'not_found',
    });

    expect(result.correctness).toBe(0);
    expect(result.difficulty).toBe(1);
    expect(result.score).toBe(0);
  });

  test('scores failed phrase guess as 0', () => {
    const result = scoreSync({
      puzzlePhrase: 'HELLO',
      boardBefore: 'H____',
      boardAfter: 'H____',
      move: { guess: 'WORLD' },
      result: 'failed',
    });

    expect(result.correctness).toBe(0);
    expect(result.score).toBe(0);
  });

  test('scores solved puzzle correctly', () => {
    const result = scoreSync({
      puzzlePhrase: 'HELLO',
      boardBefore: 'HELL_',
      boardAfter: 'HELLO',
      move: { guess: 'HELLO' },
      result: 'solved',
    });

    expect(result.correctness).toBe(1);
    expect(result.difficulty).toBeCloseTo(0.2);  // 1/5 hidden
    expect(result.score).toBeCloseTo(0.6);  // 0.5 + 0.2 * 0.5
  });

  test('handles invalid moves', () => {
    const result = scoreSync({
      puzzlePhrase: 'HELLO',
      boardBefore: '_____',
      boardAfter: '_____',
      move: {},
      result: 'invalid',
    });

    expect(result.correctness).toBe(0);
    expect(result.score).toBe(0);
  });

  test('handles phrases with spaces correctly', () => {
    const result = scoreSync({
      puzzlePhrase: 'HELLO WORLD',
      boardBefore: '_____ _____',  // 10 letters, all hidden
      boardAfter: '____O _O___',
      move: { letter: 'O' },
      result: 'found',
    });

    expect(result.correctness).toBe(1);
    expect(result.difficulty).toBe(1);  // 10/10 hidden
    expect(result.score).toBe(1);
  });
});
