import { runRound } from '@nullagent/agent-core';
import { createBenchmarkLogger } from '@nullagent/cli-utils';

import {
  getCurrentBoard,
  getGameState,
  guessLetter,
  guessPhrase,
  resetGameState,
  startNewGame,
  updateGameState,
} from './game-state';
import { player } from './player';
import { puzzleMaster } from './puzzle-master';

import type { GameState } from './game-state';
import type { PlayerOutput } from './player';
import type { PuzzleOutput } from './puzzle-master';

const TOTAL_GAMES = 1;
const MAX_MOVES_PER_GAME = 50;
const logger = createBenchmarkLogger(process.argv.includes('--verbose'));

interface GameResult {
  game: number;
  won: boolean;
  moves: number;
  phrase: string;
}

function processPlayerMove(state: GameState, output: PlayerOutput): GameState {
  const guessValue = output.guess;
  const letterValue = output.letter;

  if (guessValue !== undefined && guessValue !== '') {
    return guessPhrase(state, guessValue);
  }

  if (letterValue !== undefined && letterValue !== '') {
    return guessLetter(state, letterValue);
  }

  // Invalid move - return state unchanged
  return state;
}

async function runSingleGame(gameNumber: number): Promise<GameResult> {
  // Reset and create new puzzle
  resetGameState();

  logger.startSpinner(`Game ${String(gameNumber)}: Creating puzzle...`);
  const puzzleResult = await runRound(puzzleMaster);
  const puzzleOutput = puzzleResult.output as PuzzleOutput;
  startNewGame(puzzleOutput);
  logger.succeedSpinner(`Game ${String(gameNumber)}: Puzzle created`);

  const phrase = puzzleOutput.phrase;
  let moves = 0;
  let gameState = getGameState();

  if (gameState === undefined) {
    throw new Error('Game state should exist after puzzle creation');
  }

  logger.log(`\nGame ${String(gameNumber)}: "${phrase}" (${puzzleOutput.category})`);
  logger.logGameState(`Board: ${getCurrentBoard(gameState)}`);

  while (!gameState.solved && !gameState.failed && moves < MAX_MOVES_PER_GAME) {
    logger.startSpinner(`Game ${String(gameNumber)}: Getting player move...`);
    const playerResult = await runRound(player);
    logger.succeedSpinner(`Game ${String(gameNumber)}: Move received`);
    const playerOutput = playerResult.output as PlayerOutput;
    moves++;

    const newState = processPlayerMove(gameState, playerOutput);
    updateGameState(newState);
    gameState = newState;

    const board = getCurrentBoard(gameState);
    const action =
      playerOutput.guess === undefined
        ? `tried "${playerOutput.letter ?? 'unknown'}"`
        : `guessed "${playerOutput.guess}"`;
    logger.logMove(action, board);

    if (gameState.solved) {
      logger.log(`  SOLVED in ${String(moves)} moves!`);
    } else if (gameState.failed) {
      logger.log(`  FAILED - wrong phrase guess`);
    }
  }

  if (!gameState.solved && !gameState.failed) {
    logger.log(`  TIMEOUT - exceeded ${String(MAX_MOVES_PER_GAME)} moves`);
  }

  return {
    game: gameNumber,
    won: gameState.solved,
    moves,
    phrase,
  };
}

async function main(): Promise<void> {
  logger.header('agent_001 Benchmark');
  logger.log(`Running ${String(TOTAL_GAMES)} complete puzzle games\n`);

  const results: GameResult[] = [];

  for (let gameIndex = 1; gameIndex <= TOTAL_GAMES; gameIndex++) {
    const result = await runSingleGame(gameIndex);
    results.push(result);
  }

  const wins = results.filter((result) => result.won).length;
  const totalMoves = results.reduce((sum, result) => sum + result.moves, 0);
  const averageMoves = totalMoves / results.length;
  const winRate = (wins / results.length) * 100;

  logger.summary({
    'Games Played': TOTAL_GAMES,
    'Win Rate': `${String(wins)}/${String(results.length)} (${winRate.toFixed(1)}%)`,
    'Average Moves': averageMoves.toFixed(1),
  });
}

await main()
  .then(() => {
    // eslint-disable-next-line unicorn/no-process-exit -- CLI benchmark must exit cleanly with status code
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('Benchmark failed:', error);
    // eslint-disable-next-line unicorn/no-process-exit -- CLI benchmark must exit with error code on failure
    process.exit(1);
  });
