import { runRound } from '@nullagent/agent-core';
import { createBenchmarkLogger } from '@nullagent/cli-utils';

import {
  startNewGame,
  getCurrentBoard,
  guessLetter,
  guessPhrase,
  resetGameState,
  updateGameState,
} from './game-state.js';
import { player } from './player.js';
import { puzzleMaster } from './puzzle-master.js';
import { playerRoundScorer } from './scorers/player-round-scorer.js';

import type { GameState } from './game-state.js';
import type { PlayerOutput } from './player.js';
import type { PuzzleOutput } from './puzzle-master.js';

const BENCHMARK_GAMES = 1;
const MAX_GUESSES = 26;
const logger = createBenchmarkLogger(process.argv.includes('--verbose'));

interface GameResult {
  gameNumber: number;
  won: boolean;
  moves: number;
  phrase: string;
  totalScore: number;
}

/**
 * Process a player move and return the new game state and result
 * @param gameState - The current game state
 * @param playerOutput - The player's output from the agent
 * @param boardBefore - The board state before the move
 * @returns The new game state and move result
 */
function processPlayerMove(
  gameState: GameState,
  playerOutput: PlayerOutput,
  boardBefore: string,
): { newState: GameState; moveResult: 'found' | 'not_found' | 'solved' | 'failed' | 'invalid' } {
  if (playerOutput.letter !== undefined) {
    const letter = playerOutput.letter.toUpperCase();
    const newState = guessLetter(gameState, letter);
    updateGameState(newState);

    const boardAfter = getCurrentBoard(newState);
    const revealed = boardAfter !== boardBefore;

    let moveResult: 'found' | 'not_found' | 'solved' | 'failed' | 'invalid';
    if (newState.solved) {
      moveResult = 'solved';
    } else {
      moveResult = revealed ? 'found' : 'not_found';
    }
    return { newState, moveResult };
  }

  if (playerOutput.guess !== undefined) {
    const newState = guessPhrase(gameState, playerOutput.guess);
    updateGameState(newState);
    const moveResult = newState.solved ? 'solved' : 'failed';
    return { newState, moveResult };
  }

  return { newState: gameState, moveResult: 'invalid' };
}

/**
 * Get display string for move status
 * @param state - The game state
 * @returns The status string for display
 */
function getMoveStatus(state: GameState): string {
  if (state.solved) {
    return ' [SOLVED]';
  }
  if (state.failed) {
    return ' [FAILED]';
  }
  return '';
}

async function runGame(gameNumber: number): Promise<GameResult> {
  logger.log(`\nGame ${String(gameNumber)}/${String(BENCHMARK_GAMES)}`);

  resetGameState();

  logger.startSpinner(`Game ${String(gameNumber)}: Creating puzzle...`);
  const puzzleResult = await runRound(puzzleMaster);
  const puzzleOutput = puzzleResult.output as PuzzleOutput;

  let gameState: GameState = startNewGame(puzzleOutput);
  logger.succeedSpinner(`Game ${String(gameNumber)}: Puzzle created`);

  logger.log(`Category: ${puzzleOutput.category}`);
  logger.logGameState(`Board: ${getCurrentBoard(gameState)}`);

  let moves = 0;
  let totalScore = 0;

  while (!gameState.solved && !gameState.failed && moves < MAX_GUESSES) {
    updateGameState(gameState);

    const boardBefore = getCurrentBoard(gameState);

    logger.startSpinner(`Game ${String(gameNumber)}: Getting player move...`);
    const playerResult = await runRound(player);
    logger.succeedSpinner(`Game ${String(gameNumber)}: Move received`);
    const playerOutput = playerResult.output as PlayerOutput;

    const { newState, moveResult } = processPlayerMove(gameState, playerOutput, boardBefore);
    moves++;
    gameState = newState;

    const moveInput = {
      puzzlePhrase: gameState.puzzle.phrase,
      boardBefore,
      boardAfter: getCurrentBoard(gameState),
      move: {
        ...(playerOutput.letter !== undefined && { letter: playerOutput.letter }),
        ...(playerOutput.guess !== undefined && { guess: playerOutput.guess }),
      },
      result: moveResult,
    };
    const scoreResult = playerRoundScorer.score(moveInput);
    const resolvedScore = scoreResult instanceof Promise ? await scoreResult : scoreResult;

    totalScore += resolvedScore.score;

    const guess = playerOutput.letter ?? playerOutput.guess ?? '?';
    const guessType = playerOutput.letter === undefined ? 'phrase' : 'letter';
    const status = getMoveStatus(gameState);
    logger.logMove(`${guessType} "${guess}"`, `score ${resolvedScore.score.toFixed(2)}${status}`);
    logger.logGameState(`Board: ${getCurrentBoard(gameState)}`);
  }

  const won = gameState.solved;
  logger.log(`Result: ${won ? 'WON' : 'LOST'} in ${String(moves)} moves`);
  logger.log(`Phrase: ${gameState.puzzle.phrase}`);

  return {
    gameNumber,
    won,
    moves,
    phrase: gameState.puzzle.phrase,
    totalScore: moves > 0 ? totalScore / moves : 0,
  };
}

async function main(): Promise<void> {
  logger.header('agent_002 Benchmark (Puzzle Game with Scoring)');

  const results: GameResult[] = [];

  for (let game = 1; game <= BENCHMARK_GAMES; game++) {
    const result = await runGame(game);
    results.push(result);
  }

  const wins = results.filter((r) => r.won).length;
  const avgMoves = results.reduce((sum, r) => sum + r.moves, 0) / results.length;
  const avgScore =
    results.reduce((sum, r) => sum + r.totalScore, 0) / results.length;
  const winRate = (wins / BENCHMARK_GAMES) * 100;

  logger.summary({
    'Games Played': BENCHMARK_GAMES,
    'Win Rate': `${String(wins)}/${String(BENCHMARK_GAMES)} (${winRate.toFixed(1)}%)`,
    'Average Moves': avgMoves.toFixed(1),
    'Average Score': avgScore.toFixed(2),
  });
}

await main()
  .then(() => {
    // eslint-disable-next-line unicorn/no-process-exit -- CLI must exit explicitly
    process.exit(0);
  })
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console -- Error logging for CLI must use console.error
    console.error('Benchmark failed:', error);
    // eslint-disable-next-line unicorn/no-process-exit -- CLI exit code
    process.exit(1);
  });
