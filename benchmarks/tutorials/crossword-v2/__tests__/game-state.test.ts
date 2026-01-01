import { describe, test, expect, beforeEach } from 'vitest';
import {
  getCurrentBoard,
  getGameState,
  guessLetter,
  guessPhrase,
  isSolved,
  needsNewPuzzle,
  resetGameState,
  startNewGame,
  updateGameState,
} from '../src/game-state.js';

import type { PuzzleOutput } from '../src/puzzle-master.js';

describe('needsNewPuzzle', () => {
  beforeEach(() => {
    resetGameState();
  });

  test('returns true when no game state exists', () => {
    expect(needsNewPuzzle()).toBe(true);
  });

  test('returns true when game is solved', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO', category: 'Test' };
    startNewGame(puzzleOutput);
    const state = getGameState();
    if (state !== undefined) {
      state.solved = true;
      updateGameState(state);
    }
    expect(needsNewPuzzle()).toBe(true);
  });

  test('returns true when game is failed', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO', category: 'Test' };
    startNewGame(puzzleOutput);
    const state = getGameState();
    if (state !== undefined) {
      state.failed = true;
      updateGameState(state);
    }
    expect(needsNewPuzzle()).toBe(true);
  });

  test('returns false when game is in progress', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO', category: 'Test' };
    startNewGame(puzzleOutput);
    expect(needsNewPuzzle()).toBe(false);
  });
});

describe('startNewGame', () => {
  beforeEach(() => {
    resetGameState();
  });

  test('creates game state from puzzle output', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO WORLD', category: 'Greeting' };
    const state = startNewGame(puzzleOutput);

    expect(state.puzzle.phrase).toBe('HELLO WORLD');
    expect(state.puzzle.category).toBe('Greeting');
    expect(state.guessedLetters).toBeInstanceOf(Set);
    expect(state.guessedLetters.size).toBe(0);
    expect(state.solved).toBe(false);
    expect(state.failed).toBe(false);
  });

  test('converts phrase to uppercase', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'hello world', category: 'Test' };
    const state = startNewGame(puzzleOutput);

    expect(state.puzzle.phrase).toBe('HELLO WORLD');
  });

  test('updates the global game state', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'TEST', category: 'Test' };
    startNewGame(puzzleOutput);

    const state = getGameState();
    expect(state).toBeDefined();
    expect(state?.puzzle.phrase).toBe('TEST');
  });
});

describe('getGameState', () => {
  beforeEach(() => {
    resetGameState();
  });

  test('returns undefined when no game started', () => {
    expect(getGameState()).toBeUndefined();
  });

  test('returns game state after starting game', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'TEST', category: 'Test' };
    startNewGame(puzzleOutput);

    const state = getGameState();
    expect(state).toBeDefined();
    expect(state?.puzzle.phrase).toBe('TEST');
  });
});

describe('getCurrentBoard', () => {
  test('shows all underscores when no letters guessed', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = startNewGame(puzzleOutput);

    const board = getCurrentBoard(state);
    expect(board).toBe('_____ _____');
  });

  test('shows guessed letters in correct positions', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = startNewGame(puzzleOutput);
    state.guessedLetters.add('H');
    state.guessedLetters.add('L');
    state.guessedLetters.add('O');

    const board = getCurrentBoard(state);
    expect(board).toBe('H_LLO _O_L_');
  });

  test('preserves spaces in the board', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = startNewGame(puzzleOutput);
    state.guessedLetters.add('H');

    const board = getCurrentBoard(state);
    expect(board).toContain(' ');
  });

  test('shows all letters when all are guessed', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = startNewGame(puzzleOutput);
    'HELOWRD'.split('').forEach((letter) => state.guessedLetters.add(letter));

    const board = getCurrentBoard(state);
    expect(board).toBe('HELLO WORLD');
  });
});

describe('guessLetter', () => {
  beforeEach(() => {
    resetGameState();
  });

  test('adds letter to guessed letters set', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = startNewGame(puzzleOutput);

    const newState = guessLetter(state, 'H');
    expect(newState.guessedLetters.has('H')).toBe(true);
  });

  test('converts lowercase letter to uppercase', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = startNewGame(puzzleOutput);

    const newState = guessLetter(state, 'h');
    expect(newState.guessedLetters.has('H')).toBe(true);
  });

  test('sets solved when all letters guessed', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO WORLD', category: 'Test' };
    let state = startNewGame(puzzleOutput);

    // Guess all letters except D
    'HELOWR'.split('').forEach((letter) => {
      state = guessLetter(state, letter);
    });

    // Guess final letter
    const finalState = guessLetter(state, 'D');
    expect(finalState.solved).toBe(true);
  });

  test('allows guessing same letter multiple times', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = startNewGame(puzzleOutput);

    const newState1 = guessLetter(state, 'H');
    const newState2 = guessLetter(newState1, 'H');
    expect(newState2.guessedLetters.has('H')).toBe(true);
    expect(newState2.guessedLetters.size).toBe(1);
  });
});

describe('guessPhrase', () => {
  beforeEach(() => {
    resetGameState();
  });

  test('sets solved to true when guess matches phrase', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = startNewGame(puzzleOutput);

    const newState = guessPhrase(state, 'HELLO WORLD');
    expect(newState.solved).toBe(true);
    expect(newState.failed).toBe(false);
  });

  test('sets failed to true when guess does not match phrase', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = startNewGame(puzzleOutput);

    const newState = guessPhrase(state, 'WRONG GUESS');
    expect(newState.solved).toBe(false);
    expect(newState.failed).toBe(true);
  });

  test('is case insensitive', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = startNewGame(puzzleOutput);

    const newState = guessPhrase(state, 'hello world');
    expect(newState.solved).toBe(true);
  });

  test('does not modify guessed letters', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = startNewGame(puzzleOutput);
    state.guessedLetters.add('H');

    const newState = guessPhrase(state, 'HELLO WORLD');
    expect(newState.guessedLetters.has('H')).toBe(true);
    expect(newState.guessedLetters.size).toBe(1);
  });
});

describe('isSolved', () => {
  beforeEach(() => {
    resetGameState();
  });

  test('returns true when all unique letters are guessed', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = startNewGame(puzzleOutput);
    // HELLO WORLD has letters: H, E, L, O, W, R, D
    'HELOWRD'.split('').forEach((letter) => state.guessedLetters.add(letter));

    expect(isSolved(state)).toBe(true);
  });

  test('returns false when some letters are missing', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = startNewGame(puzzleOutput);
    'HELO'.split('').forEach((letter) => state.guessedLetters.add(letter));

    expect(isSolved(state)).toBe(false);
  });

  test('returns false when no letters are guessed', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = startNewGame(puzzleOutput);

    expect(isSolved(state)).toBe(false);
  });

  test('ignores spaces in puzzle', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO WORLD', category: 'Test' };
    const state = startNewGame(puzzleOutput);
    // Not including space character, only letters
    'HELOWRD'.split('').forEach((letter) => state.guessedLetters.add(letter));

    expect(isSolved(state)).toBe(true);
  });

  test('handles duplicate letters in phrase', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'HELLO', category: 'Test' };
    const state = startNewGame(puzzleOutput);
    // HELLO has letters: H, E, L, O (L appears twice but only counts once)
    'HELO'.split('').forEach((letter) => state.guessedLetters.add(letter));

    expect(isSolved(state)).toBe(true);
  });
});

describe('resetGameState', () => {
  test('clears the game state', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'TEST', category: 'Test' };
    startNewGame(puzzleOutput);

    expect(getGameState()).toBeDefined();

    resetGameState();

    expect(getGameState()).toBeUndefined();
  });
});

describe('updateGameState', () => {
  beforeEach(() => {
    resetGameState();
  });

  test('updates the global game state', () => {
    const puzzleOutput: PuzzleOutput = { phrase: 'TEST', category: 'Test' };
    const state = startNewGame(puzzleOutput);

    state.guessedLetters.add('T');
    updateGameState(state);

    const updatedState = getGameState();
    expect(updatedState?.guessedLetters.has('T')).toBe(true);
  });
});
