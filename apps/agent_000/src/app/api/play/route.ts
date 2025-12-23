import { runRound } from '@nullagent/agent-core';
import { NextResponse } from 'next/server';

import { agent } from '../../../agent';
import {
  getCurrentBoard,
  getCurrentGameState,
  getOrCreateGameState,
  guessLetter,
  guessPhrase,
  isSolved,
  updateGameState,
} from '../../../game-state';

import type { AgentOutput } from '../../../agent';
import type { GameState } from '../../../game';

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

export async function POST(): Promise<NextResponse> {
  try {
    const currentGameState = getOrCreateGameState();
    const category = currentGameState.puzzle.category;

    // Run a round with the agent
    const result = await runRound(agent);
    const output = result.output as AgentOutput;

    // Process the agent's move
    let message: string;
    const guessValue = output.guess;
    const letterValue = output.letter;

    if (guessValue !== undefined && guessValue !== '') {
      message = processPhraseGuess(currentGameState, guessValue);
    } else if (letterValue !== undefined && letterValue !== '') {
      message = processLetterGuess(currentGameState, letterValue);
    } else {
      message = 'Invalid move - must guess a letter or phrase';
    }

    // Get updated state after processing
    const updatedState = getCurrentGameState();
    if (updatedState === undefined) {
      throw new Error('Game state lost after processing');
    }

    return NextResponse.json({
      success: true,
      round: result.roundNumber,
      board: getCurrentBoard(updatedState),
      category,
      move: output,
      message,
      gameState: {
        solved: updatedState.solved,
        failed: updatedState.failed,
        guessedLetters: [...updatedState.guessedLetters],
      },
      usage: result.usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// GET to see current game state
export function GET(): NextResponse {
  const state = getCurrentGameState();
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
