import { runRound } from '@nullagent/agent-core';

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

const TOTAL_GAMES = 3;
const MAX_MOVES_PER_GAME = 50;
const BORDER_LINE = '+-----------------------------------------------------------------+';
const HEADER_SEPARATOR = '+---------+------------+-----------+-----------------------------+';

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
  const puzzleResult = await runRound(puzzleMaster);
  const puzzleOutput = puzzleResult.output as PuzzleOutput;
  startNewGame(puzzleOutput);

  const phrase = puzzleOutput.phrase;
  let moves = 0;
  let gameState = getGameState();

  if (gameState === undefined) {
    throw new Error('Game state should exist after puzzle creation');
  }

  // eslint-disable-next-line no-console -- CLI benchmark requires console output
  console.log(`\nGame ${String(gameNumber)}: "${phrase}" (${puzzleOutput.category})`);
  // eslint-disable-next-line no-console -- CLI benchmark requires console output
  console.log(`Board: ${getCurrentBoard(gameState)}`);

  while (!gameState.solved && !gameState.failed && moves < MAX_MOVES_PER_GAME) {
    const playerResult = await runRound(player);
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
    // eslint-disable-next-line no-console -- CLI benchmark requires console output
    console.log(`  Move ${String(moves)}: ${action} => ${board}`);

    if (gameState.solved) {
      // eslint-disable-next-line no-console -- CLI benchmark requires console output
      console.log(`  SOLVED in ${String(moves)} moves!`);
    } else if (gameState.failed) {
      // eslint-disable-next-line no-console -- CLI benchmark requires console output
      console.log(`  FAILED - wrong phrase guess`);
    }
  }

  if (!gameState.solved && !gameState.failed) {
    // eslint-disable-next-line no-console -- CLI benchmark requires console output
    console.log(`  TIMEOUT - exceeded ${String(MAX_MOVES_PER_GAME)} moves`);
  }

  return {
    game: gameNumber,
    won: gameState.solved,
    moves,
    phrase,
  };
}

function padCenter(text: string, width: number): string {
  const padding = width - text.length;
  const padLeft = Math.floor(padding / 2);
  const padRight = padding - padLeft;
  return ' '.repeat(padLeft) + text + ' '.repeat(padRight);
}

function printResults(results: GameResult[]): void {
  const wins = results.filter((result) => result.won).length;
  const totalMoves = results.reduce((sum, result) => sum + result.moves, 0);
  const averageMoves = totalMoves / results.length;
  const winRate = (wins / results.length) * 100;

  const titleText = `agent_001 Benchmark Results (${String(TOTAL_GAMES)} games)`;

  // eslint-disable-next-line no-console -- CLI benchmark requires console output
  console.log('\n');
  // eslint-disable-next-line no-console -- CLI benchmark requires console output
  console.log(BORDER_LINE);
  // eslint-disable-next-line no-console -- CLI benchmark requires console output
  console.log(`|${padCenter(titleText, 65)}|`);
  // eslint-disable-next-line no-console -- CLI benchmark requires console output
  console.log(HEADER_SEPARATOR);
  // eslint-disable-next-line no-console -- CLI benchmark requires console output
  console.log('|  Game   |   Result   |   Moves   |           Phrase            |');
  // eslint-disable-next-line no-console -- CLI benchmark requires console output
  console.log(HEADER_SEPARATOR);

  for (const result of results) {
    const gameString = padCenter(String(result.game), 7);
    const resultString = padCenter(result.won ? 'WON' : 'LOST', 10);
    const movesString = padCenter(String(result.moves), 9);
    const phraseString =
      result.phrase.length > 27 ? result.phrase.slice(0, 24) + '...' : result.phrase.padEnd(27);
    // eslint-disable-next-line no-console -- CLI benchmark requires console output
    console.log(`|${gameString}|${resultString}|${movesString}| ${phraseString}|`);
  }

  // eslint-disable-next-line no-console -- CLI benchmark requires console output
  console.log(HEADER_SEPARATOR);
  const summaryText = `Summary: ${String(wins)}/${String(results.length)} won (${winRate.toFixed(1)}%), avg ${averageMoves.toFixed(1)} moves`;
  // eslint-disable-next-line no-console -- CLI benchmark requires console output
  console.log(`| ${summaryText.padEnd(63)}|`);
  // eslint-disable-next-line no-console -- CLI benchmark requires console output
  console.log(BORDER_LINE);
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console -- CLI benchmark requires console output
  console.log('Starting agent_001 benchmark...');
  // eslint-disable-next-line no-console -- CLI benchmark requires console output
  console.log(`Running ${String(TOTAL_GAMES)} complete puzzle games\n`);

  const results: GameResult[] = [];

  for (let gameIndex = 1; gameIndex <= TOTAL_GAMES; gameIndex++) {
    const result = await runSingleGame(gameIndex);
    results.push(result);
  }

  printResults(results);

  // eslint-disable-next-line unicorn/no-process-exit -- CLI benchmark must exit cleanly with status code
  process.exit(0);
}

async function run(): Promise<void> {
  try {
    await main();
  } catch (error: unknown) {
    // eslint-disable-next-line no-console -- CLI benchmark requires console output for errors
    console.error('Benchmark failed:', error);
    // eslint-disable-next-line unicorn/no-process-exit -- CLI benchmark must exit with error code on failure
    process.exit(1);
  }
}

// eslint-disable-next-line unicorn/prefer-top-level-await -- Entry point wrapper
void run();
