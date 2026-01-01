import {
  createGameState,
  getCurrentBoard,
  guessLetter,
  guessPhrase,
  isSolved,
  selectPuzzle,
  type GameState,
} from './game';

// Simple in-memory game state (for demo purposes)
let currentGameState: GameState | undefined;

/**
 * Get the current game state, initializing a new game if needed
 * @returns The current or newly created game state
 */
export function getOrCreateGameState(): GameState {
  if (
    currentGameState === undefined ||
    currentGameState.solved ||
    currentGameState.failed
  ) {
    const puzzle = selectPuzzle();
    currentGameState = createGameState(puzzle);
  }
  return currentGameState;
}

/**
 * Reset the game state (for testing)
 */
export function resetGameState(): void {
  currentGameState = undefined;
}

/**
 * Get the current game state (may be undefined)
 * @returns The current game state or undefined if no game is active
 */
export function getCurrentGameState(): GameState | undefined {
  return currentGameState;
}

/**
 * Update game state after processing a move
 * @param newState - The new game state to set
 */
export function updateGameState(newState: GameState): void {
  currentGameState = newState;
}

// Re-export game functions for convenience
export { getCurrentBoard, guessLetter, guessPhrase, isSolved };
