export interface Puzzle {
  phrase: string;
  category: string;
}

export interface GameState {
  puzzle: Puzzle;
  guessedLetters: Set<string>;
  solved: boolean;
  failed: boolean;
}

const CATEGORY_COMPUTER_SCIENCE = 'Computer Science';
const CATEGORY_TECHNOLOGY = 'Technology';

// Pre-defined puzzles for the game
const PUZZLES: Puzzle[] = [
  { phrase: 'HELLO WORLD', category: CATEGORY_COMPUTER_SCIENCE },
  { phrase: 'ARTIFICIAL INTELLIGENCE', category: CATEGORY_TECHNOLOGY },
  { phrase: 'THE QUICK BROWN FOX', category: 'Phrase' },
  { phrase: 'MACHINE LEARNING', category: CATEGORY_TECHNOLOGY },
  { phrase: 'DATABASE MANAGEMENT', category: CATEGORY_COMPUTER_SCIENCE },
];

/**
 * Select a random puzzle
 *
 * @returns A randomly selected puzzle
 */
export function selectPuzzle(): Puzzle {
  const randomIndex = Math.floor(Math.random() * PUZZLES.length);
  // eslint-disable-next-line security/detect-object-injection -- Array access with random index is intentional
  const puzzle = PUZZLES[randomIndex];
  if (puzzle === undefined) {
    throw new Error('No puzzles available');
  }
  return puzzle;
}

/**
 * Create initial game state for a puzzle
 *
 * @param puzzle - The puzzle to create game state for
 * @returns Initial game state
 */
export function createGameState(puzzle: Puzzle): GameState {
  return {
    puzzle,
    guessedLetters: new Set(),
    solved: false,
    failed: false,
  };
}

/**
 * Get the current board display (letters + underscores)
 * E.g., "H_LL_ W_RLD" for "HELLO WORLD" with guessed letters [H, L, R, D, W]
 *
 * @param state - Current game state
 * @returns Board string with guessed letters and underscores
 */
export function getCurrentBoard(state: GameState): string {
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- Only ASCII uppercase letters and spaces in puzzles
  return [...state.puzzle.phrase]
    .map((char) => {
      if (char === ' ') {
        return ' ';
      }
      return state.guessedLetters.has(char.toUpperCase()) ? char : '_';
    })
    .join('');
}

/**
 * Process a letter guess
 *
 * @param state - Current game state
 * @param letter - Letter to guess
 * @returns Updated game state
 */
export function guessLetter(state: GameState, letter: string): GameState {
  const newGuessedLetters = new Set(state.guessedLetters);
  newGuessedLetters.add(letter.toUpperCase());

  return {
    ...state,
    guessedLetters: newGuessedLetters,
  };
}

/**
 * Process a full phrase guess
 *
 * @param state - Current game state
 * @param guess - Full phrase guess
 * @returns Updated game state (solved=true if correct, failed=true if wrong)
 */
export function guessPhrase(state: GameState, guess: string): GameState {
  const normalizedGuess = guess.trim().toUpperCase();
  const normalizedPhrase = state.puzzle.phrase.toUpperCase();

  if (normalizedGuess === normalizedPhrase) {
    return {
      ...state,
      solved: true,
    };
  }

  return {
    ...state,
    failed: true,
  };
}

/**
 * Check if the puzzle is fully solved (all letters guessed)
 *
 * @param state - Current game state
 * @returns True if all letters have been guessed
 */
export function isSolved(state: GameState): boolean {
  const uniqueLetters = new Set(
    // eslint-disable-next-line @typescript-eslint/no-misused-spread -- Only ASCII uppercase letters and spaces in puzzles
    [...state.puzzle.phrase.toUpperCase()].filter((char) => char !== ' ')
  );

  for (const letter of uniqueLetters) {
    if (!state.guessedLetters.has(letter)) {
      return false;
    }
  }

  return true;
}
