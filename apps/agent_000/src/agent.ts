import { defineAgent } from '@nullagent/agent-core';
import { z } from 'zod';

import { getCurrentBoard, getOrCreateGameState } from './game-state';

const OutputSchema = z.object({
  letter: z.string().length(1).optional(),
  guess: z.string().optional(),
  reasoning: z.string().optional(),
});

export type AgentOutput = z.infer<typeof OutputSchema>;

export const agent = defineAgent({
  id: 'agent_000',

  outputSchema: OutputSchema,

  // Compact every 3 rounds to test compaction behavior
  compactionTrigger: {
    type: 'custom',
    shouldCompact: (context) => context.roundNumber > 0 && context.roundNumber % 3 === 0,
  },

  buildRoundPrompt: (context) => {
    // Get current game state for the prompt
    const gameState = getOrCreateGameState();
    const board = getCurrentBoard(gameState);
    const category = gameState.puzzle.category;
    const guessedLettersArray = [...gameState.guessedLetters];
    const guessedLetters = guessedLettersArray.length > 0 ? guessedLettersArray.join(', ') : 'none yet';

    const compactionSection =
      context.compactionSummary !== undefined && context.compactionSummary !== ''
        ? `Your past learnings:\n${context.compactionSummary}\n`
        : '';

    return `You are playing a word guessing game (like Wheel of Fortune).

Category: ${category}
Board: ${board}
Letters already guessed: ${guessedLetters}

${compactionSection}
Choose ONE action:
- Guess a letter (a-z) you think is in the puzzle
- Guess the full phrase if you're confident

Respond with ONLY ONE of these JSON formats:
{"letter": "e", "reasoning": "E is the most common letter"} - to guess a letter
{"guess": "HELLO WORLD", "reasoning": "Based on the pattern"} - to guess the phrase

A wrong phrase guess loses the game immediately!
Think carefully before guessing the full phrase.`;
  },

  buildCompactionPrompt: (history) => `
You've played ${String(history.length)} rounds of word guessing games.
Summarize patterns you've noticed about puzzle categories and common phrases.
What strategies have worked? What letter frequencies have you observed?
`,
});
