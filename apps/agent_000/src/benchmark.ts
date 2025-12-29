import { runRound } from '@nullagent/agent-core';
import { createBenchmarkLogger } from '@nullagent/cli-utils';

import { agent } from './agent.js';
import {
  getCurrentBoard,
  getOrCreateGameState,
  guessLetter,
  guessPhrase,
  isSolved,
  resetGameState,
  updateGameState,
} from './game-state.js';

import type { AgentOutput } from './agent.js';
import type { GameState } from './game.js';

const BENCHMARK_ROUNDS = 1;
const logger = createBenchmarkLogger(process.argv.includes('--verbose'));

interface RoundResult {
  roundNumber: number;
  puzzle: string;
  category: string;
  solved: boolean;
  failed: boolean;
  guessCount: number;
}

function processLetterGuess(state: GameState, letter: string): { newState: GameState; message: string } {
  const previousBoard = getCurrentBoard(state);
  const newState = guessLetter(state, letter);
  const newBoard = getCurrentBoard(newState);

  if (newBoard === previousBoard) {
    return { newState, message: `No "${letter}" in the puzzle` };
  }

  if (isSolved(newState)) {
    return {
      newState: { ...newState, solved: true },
      message: `Solved! The phrase was "${newState.puzzle.phrase}"`,
    };
  }

  return { newState, message: `Found "${letter}"!` };
}

function processPhraseGuess(state: GameState, guess: string): { newState: GameState; message: string } {
  const newState = guessPhrase(state, guess);
  const message = newState.solved
    ? `Correct! The phrase was "${newState.puzzle.phrase}"`
    : `Wrong guess! Game over. The phrase was "${newState.puzzle.phrase}"`;
  return { newState, message };
}

async function playGame(gameNumber: number): Promise<RoundResult> {
  resetGameState();
  let gameState = getOrCreateGameState();
  const puzzle = gameState.puzzle.phrase;
  const category = gameState.puzzle.category;
  let guessCount = 0;

  logger.log(`\nGame ${String(gameNumber)}: "${category}"`);
  logger.logGameState(`Board: ${getCurrentBoard(gameState)}`);

  // Play until solved or failed (max 26 guesses to prevent infinite loops)
  while (!gameState.solved && !gameState.failed && guessCount < 26) {
    logger.startSpinner(`Game ${String(gameNumber)}: Getting move from LLM...`);
    const result = await runRound(agent);
    logger.succeedSpinner(`Game ${String(gameNumber)}: Move received`);

    const output = result.output as AgentOutput;
    guessCount++;

    let message: string;
    const guessValue = output.guess;
    const letterValue = output.letter;

    if (guessValue !== undefined && guessValue !== '') {
      const processResult = processPhraseGuess(gameState, guessValue);
      gameState = processResult.newState;
      updateGameState(gameState);
      message = processResult.message;
      logger.logMove(`Phrase "${guessValue}"`, message);
    } else if (letterValue !== undefined && letterValue !== '') {
      const processResult = processLetterGuess(gameState, letterValue);
      gameState = processResult.newState;
      updateGameState(gameState);
      message = processResult.message;
      logger.logMove(`Letter "${letterValue}"`, message);
    } else {
      logger.logMove('Invalid', 'no letter or phrase');
    }

    logger.logGameState(`Board: ${getCurrentBoard(gameState)}`);
  }

  return {
    roundNumber: gameNumber,
    puzzle,
    category,
    solved: gameState.solved,
    failed: gameState.failed,
    guessCount,
  };
}

async function main(): Promise<void> {
  logger.header('agent_000 Benchmark - Word Guessing Game');

  const results: RoundResult[] = [];

  for (let round = 1; round <= BENCHMARK_ROUNDS; round++) {
    const result = await playGame(round);
    results.push(result);
  }

  const wins = results.filter((r) => r.solved).length;
  const totalGuesses = results.reduce((sum, r) => sum + r.guessCount, 0);
  const avgGuesses = totalGuesses / results.length;
  const winRate = (wins / BENCHMARK_ROUNDS) * 100;

  logger.summary({
    'Games Played': BENCHMARK_ROUNDS,
    'Win Rate': `${String(wins)}/${String(BENCHMARK_ROUNDS)} (${winRate.toFixed(0)}%)`,
    'Average Guesses': avgGuesses.toFixed(1),
  });
}

await main()
  .then(() => {
    // eslint-disable-next-line unicorn/no-process-exit -- CLI must exit explicitly to close DB connections
    process.exit(0);
  })
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console -- Error logging for CLI must use console.error
    console.error('Benchmark failed:', error);
    // eslint-disable-next-line unicorn/no-process-exit -- CLI exit code
    process.exit(1);
  });
