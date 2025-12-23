import { describe, test, expect } from 'vitest';
import {
  selectPuzzle,
  createGameState,
  getCurrentBoard,
  guessLetter,
  guessPhrase,
  isSolved,
  type Puzzle,
} from '../src/game.js';

describe('selectPuzzle', () => {
  test('returns a puzzle with phrase and category', () => {
    const puzzle = selectPuzzle();
    expect(puzzle).toHaveProperty('phrase');
    expect(puzzle).toHaveProperty('category');
    expect(typeof puzzle.phrase).toBe('string');
    expect(typeof puzzle.category).toBe('string');
    expect(puzzle.phrase.length).toBeGreaterThan(0);
  });

  test('returns different puzzles on multiple calls', () => {
    const puzzles = new Set();
    for (let i = 0; i < 10; i++) {
      puzzles.add(selectPuzzle().phrase);
    }
    // With 5 puzzles, we should get at least 2 different ones in 10 tries
    expect(puzzles.size).toBeGreaterThan(1);
  });
});

describe('createGameState', () => {
  test('creates initial game state with empty guessed letters', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);

    expect(state.puzzle).toEqual(puzzle);
    expect(state.guessedLetters).toBeInstanceOf(Set);
    expect(state.guessedLetters.size).toBe(0);
    expect(state.solved).toBe(false);
    expect(state.failed).toBe(false);
  });
});

describe('getCurrentBoard', () => {
  test('shows all underscores when no letters guessed', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);

    const board = getCurrentBoard(state);
    expect(board).toBe('_____ _____');
  });

  test('shows guessed letters in correct positions', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);
    state.guessedLetters.add('H');
    state.guessedLetters.add('L');
    state.guessedLetters.add('O');

    const board = getCurrentBoard(state);
    expect(board).toBe('H_LLO _O_L_');
  });

  test('preserves spaces in the board', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);
    state.guessedLetters.add('H');

    const board = getCurrentBoard(state);
    expect(board).toContain(' ');
  });

  test('shows all letters when all are guessed', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);
    'HELOWRD'.split('').forEach((letter) => state.guessedLetters.add(letter));

    const board = getCurrentBoard(state);
    expect(board).toBe('HELLO WORLD');
  });
});

describe('guessLetter', () => {
  test('adds letter to guessed letters set', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);

    const newState = guessLetter(state, 'H');
    expect(newState.guessedLetters.has('H')).toBe(true);
  });

  test('converts lowercase letter to uppercase', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);

    const newState = guessLetter(state, 'h');
    expect(newState.guessedLetters.has('H')).toBe(true);
  });

  test('does not modify solved or failed status', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);

    const newState = guessLetter(state, 'H');
    expect(newState.solved).toBe(false);
    expect(newState.failed).toBe(false);
  });

  test('allows guessing same letter multiple times', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);

    const newState1 = guessLetter(state, 'H');
    const newState2 = guessLetter(newState1, 'H');
    expect(newState2.guessedLetters.has('H')).toBe(true);
    expect(newState2.guessedLetters.size).toBe(1);
  });
});

describe('guessPhrase', () => {
  test('sets solved to true when guess matches phrase', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);

    const newState = guessPhrase(state, 'HELLO WORLD');
    expect(newState.solved).toBe(true);
    expect(newState.failed).toBe(false);
  });

  test('sets failed to true when guess does not match phrase', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);

    const newState = guessPhrase(state, 'WRONG GUESS');
    expect(newState.solved).toBe(false);
    expect(newState.failed).toBe(true);
  });

  test('is case insensitive', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);

    const newState = guessPhrase(state, 'hello world');
    expect(newState.solved).toBe(true);
  });

  test('ignores leading and trailing whitespace', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);

    const newState = guessPhrase(state, '  HELLO WORLD  ');
    expect(newState.solved).toBe(true);
  });

  test('does not modify guessed letters', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);
    state.guessedLetters.add('H');

    const newState = guessPhrase(state, 'HELLO WORLD');
    expect(newState.guessedLetters.has('H')).toBe(true);
    expect(newState.guessedLetters.size).toBe(1);
  });
});

describe('isSolved', () => {
  test('returns true when all unique letters are guessed', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);
    // HELLO WORLD has letters: H, E, L, O, W, R, D
    'HELOWRD'.split('').forEach((letter) => state.guessedLetters.add(letter));

    expect(isSolved(state)).toBe(true);
  });

  test('returns false when some letters are missing', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);
    'HELO'.split('').forEach((letter) => state.guessedLetters.add(letter));

    expect(isSolved(state)).toBe(false);
  });

  test('returns false when no letters are guessed', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);

    expect(isSolved(state)).toBe(false);
  });

  test('ignores spaces in puzzle', () => {
    const puzzle: Puzzle = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = createGameState(puzzle);
    // Not including space character, only letters
    'HELOWRD'.split('').forEach((letter) => state.guessedLetters.add(letter));

    expect(isSolved(state)).toBe(true);
  });

  test('handles duplicate letters in phrase', () => {
    const puzzle: Puzzle = { phrase: 'HELLO', category: 'Test' };
    const state = createGameState(puzzle);
    // HELLO has letters: H, E, L, O (L appears twice but only counts once)
    'HELO'.split('').forEach((letter) => state.guessedLetters.add(letter));

    expect(isSolved(state)).toBe(true);
  });
});
