/* eslint-disable no-console -- CLI benchmark tool requires console output */
import { runRound } from '@nullagent/agent-core';

import { agent } from './agent.js';
import {
  getCurrentBoard,
  getOrCreateGameState,
  guessLetter,
  guessPhrase,
  isSolved,
  resetGameState,
} from './game-state.js';

import type { AgentOutput } from './agent.js';
import type { GameState } from './game.js';

const BENCHMARK_ROUNDS = 3;
const TABLE_SEPARATOR = '-----|---------------------|--------|--------';

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

  console.log(`\nGame ${String(gameNumber)}: "${category}"`);
  console.log(`Board: ${getCurrentBoard(gameState)}`);

  // Play until solved or failed (max 26 guesses to prevent infinite loops)
  while (!gameState.solved && !gameState.failed && guessCount < 26) {
    const result = await runRound(agent);
    const output = result.output as AgentOutput;
    guessCount++;

    let message: string;
    const guessValue = output.guess;
    const letterValue = output.letter;

    if (guessValue !== undefined && guessValue !== '') {
      const processResult = processPhraseGuess(gameState, guessValue);
      gameState = processResult.newState;
      message = processResult.message;
      console.log(`  Guess #${String(guessCount)}: Phrase "${guessValue}" - ${message}`);
    } else if (letterValue !== undefined && letterValue !== '') {
      const processResult = processLetterGuess(gameState, letterValue);
      gameState = processResult.newState;
      message = processResult.message;
      console.log(`  Guess #${String(guessCount)}: Letter "${letterValue}" - ${message}`);
    } else {
      console.log(`  Guess #${String(guessCount)}: Invalid move (no letter or phrase)`);
    }
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
  console.log('agent_000 Benchmark - Word Guessing Game');
  console.log('========================================');

  const results: RoundResult[] = [];

  for (let round = 1; round <= BENCHMARK_ROUNDS; round++) {
    const result = await playGame(round);
    results.push(result);
  }

  // Print summary table
  console.log('\n\nResults Summary');
  console.log('---------------');
  console.log('Game | Category            | Solved | Guesses');
  console.log(TABLE_SEPARATOR);

  for (const result of results) {
    const solved = result.solved ? 'Yes' : 'No';
    const category = result.category.padEnd(19).slice(0, 19);
    console.log(`  ${String(result.roundNumber)}  | ${category} | ${solved.padEnd(6)} | ${String(result.guessCount)}`);
  }

  const wins = results.filter((r) => r.solved).length;
  const totalGuesses = results.reduce((sum, r) => sum + r.guessCount, 0);
  const avgGuesses = totalGuesses / results.length;

  console.log(TABLE_SEPARATOR);
  console.log(`Win Rate: ${String(wins)}/${String(BENCHMARK_ROUNDS)} (${((wins / BENCHMARK_ROUNDS) * 100).toFixed(0)}%)`);
  console.log(`Average Guesses: ${avgGuesses.toFixed(1)}`);
}

await main()
  .then(() => {
    // eslint-disable-next-line unicorn/no-process-exit -- CLI must exit explicitly to close DB connections
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('Benchmark failed:', error);
    // eslint-disable-next-line unicorn/no-process-exit -- CLI exit code
    process.exit(1);
  });
/* eslint-enable no-console -- Re-enable console rule after CLI benchmark output */
