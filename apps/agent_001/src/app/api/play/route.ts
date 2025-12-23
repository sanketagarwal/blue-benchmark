import { runRound } from '@nullagent/agent-core';
import { NextResponse } from 'next/server';

import {
  getCurrentBoard,
  getGameState,
  guessLetter,
  guessPhrase,
  isSolved,
  needsNewPuzzle,
  startNewGame,
  updateGameState,
} from '../../../game-state';
import { player } from '../../../player';
import { puzzleMaster } from '../../../puzzle-master';

import type { GameState } from '../../../game-state';
import type { PlayerOutput } from '../../../player';
import type { PuzzleOutput } from '../../../puzzle-master';

interface PuzzleCreationResult {
  created: boolean;
  roundNumber?: number;
}

async function ensurePuzzleExists(): Promise<PuzzleCreationResult> {
  if (!needsNewPuzzle()) {
    return { created: false };
  }

  const puzzleResult = await runRound(puzzleMaster);
  const puzzleOutput = puzzleResult.output as PuzzleOutput;
  startNewGame(puzzleOutput);
  return { created: true, roundNumber: puzzleResult.roundNumber };
}

function processPhraseGuess(state: GameState, guess: string): string {
  const newState = guessPhrase(state, guess);
  updateGameState(newState);
  return newState.solved
    ? `Correct! The phrase was "${newState.puzzle.phrase}"`
    : `Wrong guess! Game over. The phrase was "${newState.puzzle.phrase}"`;
}

function processLetterGuess(state: GameState, letter: string): string {
  const previousBoard = getCurrentBoard(state);
  const newState = guessLetter(state, letter);
  updateGameState(newState);
  const newBoard = getCurrentBoard(newState);

  if (newBoard === previousBoard) {
    return `No "${letter}" in the puzzle`;
  }

  if (isSolved(newState)) {
    newState.solved = true;
    return `Solved! The phrase was "${newState.puzzle.phrase}"`;
  }

  return `Found "${letter}"!`;
}

function processPlayerMove(state: GameState, output: PlayerOutput): string {
  const guessValue = output.guess;
  const letterValue = output.letter;

  if (guessValue !== undefined && guessValue !== '') {
    return processPhraseGuess(state, guessValue);
  }

  if (letterValue !== undefined && letterValue !== '') {
    return processLetterGuess(state, letterValue);
  }

  return 'Invalid move - must guess a letter or phrase';
}

function getRequiredGameState(): GameState {
  const state = getGameState();
  if (state === undefined) {
    throw new Error('Game state should exist after puzzle creation');
  }
  return state;
}

export async function POST(): Promise<NextResponse> {
  try {
    const puzzleResult = await ensurePuzzleExists();
    const currentGameState = getRequiredGameState();
    const category = currentGameState.puzzle.category;

    const playerResult = await runRound(player);
    const playerOutput = playerResult.output as PlayerOutput;
    const message = processPlayerMove(currentGameState, playerOutput);

    const updatedState = getRequiredGameState();

    return NextResponse.json({
      success: true,
      puzzleCreated: puzzleResult.created,
      puzzleMasterRound: puzzleResult.roundNumber,
      playerRound: playerResult.roundNumber,
      board: getCurrentBoard(updatedState),
      category,
      move: playerOutput,
      message,
      gameState: {
        solved: updatedState.solved,
        failed: updatedState.failed,
        guessedLetters: [...updatedState.guessedLetters],
      },
      usage: playerResult.usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// GET to see current game state
export function GET(): NextResponse {
  const state = getGameState();
  if (state === undefined) {
    return NextResponse.json({ message: 'No active game. POST to /api/play to start.' });
  }

  return NextResponse.json({
    board: getCurrentBoard(state),
    category: state.puzzle.category,
    guessedLetters: [...state.guessedLetters],
    solved: state.solved,
    failed: state.failed,
  });
}
