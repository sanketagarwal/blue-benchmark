import { defineScorer } from '@nullagent/scorers';

import type { ScorerResult } from '@nullagent/scorers';

/**
 * Input for scoring a player round
 */
export interface PlayerRoundInput {
  puzzlePhrase: string;
  boardBefore: string;
  boardAfter: string;
  move: { letter?: string; guess?: string };
  result: 'found' | 'not_found' | 'solved' | 'failed' | 'invalid';
}

/**
 * Result from scoring a player round
 */
export interface PlayerRoundResult extends ScorerResult {
  score: number;
  correctness: number;
  difficulty: number;
}

/**
 * Scorer for evaluating player rounds in the word guessing game.
 *
 * Dimensions:
 * - correctness: 1 if the move revealed letters or solved, 0 otherwise
 * - difficulty: Proportion of letters hidden when move was made (0-1)
 * - score: correctness * (0.5 + difficulty * 0.5)
 *   - Correct easy guess: 0.5
 *   - Correct hard guess: up to 1.0
 *   - Incorrect: 0
 */
export const playerRoundScorer = defineScorer<PlayerRoundInput, PlayerRoundResult>({
  id: 'player_round_scorer',
  name: 'Player Round Scorer',
  score(input) {
    // Correctness: did the move reveal letters or solve?
    const correctness = ['found', 'solved'].includes(input.result) ? 1 : 0;

    // Difficulty: proportion of letters still hidden when move was made
    const totalLetters = input.puzzlePhrase.replaceAll(/\s/g, '').length;
    const hiddenBefore = (input.boardBefore.match(/_/g) ?? []).length;
    const difficulty = totalLetters > 0 ? hiddenBefore / totalLetters : 0;

    // Overall score: correct moves score 0.5-1.0 based on difficulty
    const score = correctness * (0.5 + difficulty * 0.5);

    return { score, correctness, difficulty };
  },
});
