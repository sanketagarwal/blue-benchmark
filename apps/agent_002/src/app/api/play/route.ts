import { runRound } from '@nullagent/agent-core';
import { saveScore } from '@nullagent/scorers';
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
import { playerRoundScorer } from '../../../scorers/player-round-scorer';

import type { GameState } from '../../../game-state';
import type { PlayerOutput } from '../../../player';
import type { PuzzleOutput } from '../../../puzzle-master';
import type { PlayerRoundInput } from '../../../scorers/player-round-scorer';

type MoveOutcome = 'found' | 'not_found' | 'solved' | 'failed' | 'invalid';

interface MoveResult {
  message: string;
  outcome: MoveOutcome;
}

interface PuzzleCreationResult {
  created: boolean;
  roundNumber?: number;
  traceId?: string;
}

async function ensurePuzzleExists(traceId: string): Promise<PuzzleCreationResult> {
  if (!needsNewPuzzle()) {
    return { created: false };
  }

  const puzzleResult = await runRound(puzzleMaster, { traceId });
  const puzzleOutput = puzzleResult.output as PuzzleOutput;
  startNewGame(puzzleOutput);
  return { created: true, roundNumber: puzzleResult.roundNumber, traceId: puzzleResult.traceId };
}

function processPhraseGuess(state: GameState, guess: string): MoveResult {
  const newState = guessPhrase(state, guess);
  updateGameState(newState);

  if (newState.solved) {
    return {
      message: `Correct! The phrase was "${newState.puzzle.phrase}"`,
      outcome: 'solved',
    };
  }

  return {
    message: `Wrong guess! Game over. The phrase was "${newState.puzzle.phrase}"`,
    outcome: 'failed',
  };
}

function processLetterGuess(state: GameState, letter: string): MoveResult {
  const previousBoard = getCurrentBoard(state);
  const newState = guessLetter(state, letter);
  updateGameState(newState);
  const newBoard = getCurrentBoard(newState);

  if (newBoard === previousBoard) {
    return {
      message: `No "${letter}" in the puzzle`,
      outcome: 'not_found',
    };
  }

  if (isSolved(newState)) {
    newState.solved = true;
    return {
      message: `Solved! The phrase was "${newState.puzzle.phrase}"`,
      outcome: 'solved',
    };
  }

  return {
    message: `Found "${letter}"!`,
    outcome: 'found',
  };
}

function processPlayerMove(state: GameState, output: PlayerOutput): MoveResult {
  const guessValue = output.guess;
  const letterValue = output.letter;

  if (guessValue !== undefined && guessValue !== '') {
    return processPhraseGuess(state, guessValue);
  }

  if (letterValue !== undefined && letterValue !== '') {
    return processLetterGuess(state, letterValue);
  }

  return {
    message: 'Invalid move - must guess a letter or phrase',
    outcome: 'invalid',
  };
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
    const traceId = crypto.randomUUID();

    const puzzleResult = await ensurePuzzleExists(traceId);
    const currentGameState = getRequiredGameState();
    const category = currentGameState.puzzle.category;

    // Capture board state BEFORE the move
    const boardBeforeMove = getCurrentBoard(currentGameState);

    const playerResult = await runRound(player, { traceId });
    const playerOutput = playerResult.output as PlayerOutput;
    const moveResult = processPlayerMove(currentGameState, playerOutput);

    const updatedState = getRequiredGameState();
    const boardAfterMove = getCurrentBoard(updatedState);

    // Score the player's move
    const move: { letter?: string; guess?: string } = {};
    if (playerOutput.letter !== undefined) {
      move.letter = playerOutput.letter;
    }
    if (playerOutput.guess !== undefined) {
      move.guess = playerOutput.guess;
    }

    const scoreInput: PlayerRoundInput = {
      puzzlePhrase: currentGameState.puzzle.phrase,
      boardBefore: boardBeforeMove,
      boardAfter: boardAfterMove,
      move,
      result: moveResult.outcome,
    };

    const scoreResult = await Promise.resolve(playerRoundScorer.score(scoreInput));

    // Save score to database
    await saveScore({
      traceId,
      agentId: player.definition.id,
      roundNumber: playerResult.roundNumber,
      scorerId: playerRoundScorer.id,
      result: scoreResult,
    });

    return NextResponse.json({
      success: true,
      traceId,
      puzzleCreated: puzzleResult.created,
      puzzleMasterRound: puzzleResult.roundNumber,
      playerRound: playerResult.roundNumber,
      board: boardAfterMove,
      category,
      move: playerOutput,
      message: moveResult.message,
      gameState: {
        solved: updatedState.solved,
        failed: updatedState.failed,
        guessedLetters: [...updatedState.guessedLetters],
      },
      score: scoreResult,
      usage: playerResult.usage,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
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
