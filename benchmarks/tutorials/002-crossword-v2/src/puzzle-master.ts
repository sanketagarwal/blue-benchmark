import { defineAgent } from '@nullagent/agent-core';
import { z } from 'zod';

const PuzzleSchema = z.object({
  phrase: z.string().min(3).max(50),
  category: z.string().min(3).max(30),
  reasoning: z.string().optional(),
});

export type PuzzleOutput = z.infer<typeof PuzzleSchema>;

export const puzzleMaster = defineAgent({
  id: 'puzzle_master_001',

  outputSchema: PuzzleSchema,

  // Compact every 10 puzzles to learn from past creations
  compactionTrigger: {
    type: 'custom',
    shouldCompact: (context) => context.roundNumber > 0 && context.roundNumber % 10 === 0,
  },

  buildRoundPrompt: (context) => {
    const compactionSection =
      context.compactionSummary !== undefined && context.compactionSummary !== ''
        ? `Your past learnings about puzzle creation:\n${context.compactionSummary}\n\n`
        : '';

    return `You are a Puzzle Master for a word guessing game (like Wheel of Fortune).

${compactionSection}Create a new puzzle for the player to solve.

Requirements:
- The phrase should be a well-known saying, idiom, movie title, famous quote, or common expression
- Choose from categories like: Phrase, Movie, Song, Famous Quote, Food, Technology, Science, Sports, Geography
- Make it challenging but solvable - avoid obscure references
- Use phrases between 2-5 words
- All letters should be A-Z (no numbers or special characters except spaces)

Respond with a JSON object containing:
- phrase: The puzzle phrase in UPPERCASE (e.g., "HELLO WORLD")
- category: The category name (e.g., "Greeting")
- reasoning: Brief explanation of why this is a good puzzle`;
  },

  buildCompactionPrompt: (history) => `
You've created ${String(history.length)} puzzles for word guessing games.

Review the puzzles you've created and summarize:
1. Which categories have you used most/least?
2. What phrase lengths work well?
3. Any patterns to avoid (too easy, too hard, repeated themes)?
4. Ideas for fresh, engaging puzzles going forward

Keep your summary concise and actionable for future puzzle creation.
`,
});
