# agent_000: Word Guessing Game

A single LLM agent that plays a word guessing game similar to Wheel of Fortune.

## What It Does

The agent receives a partially revealed board (e.g., `_ _ L L O   W O R _ _`) and must strategically guess letters or solve the entire phrase. Each guess reveals more of the puzzle or ends the game.

**Game Rules:**
- Guess individual letters to reveal their positions
- Guess the full phrase to win (or lose if wrong)
- Wrong phrase guesses end the game immediately
- The agent sees the category hint and remaining blanks

## Usage

Run the benchmark with:

```bash
cd apps/agent_000
pnpm benchmark
```

This runs the word guessing game, tracking wins, losses, and average guesses needed.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     pnpm benchmark                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │       Game State          │
              │  • Random puzzle select   │
              │  • Board state tracking   │
              │  • Win/fail detection     │
              └─────────────┬─────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │        Agent            │
              │  ┌───────────────────┐  │
              │  │ Category hint     │  │
              │  │ Current board     │  │
              │  │ Letters guessed   │  │
              │  └───────────────────┘  │
              └───────────┬─────────────┘
                          │
                          ▼
              ┌─────────────────────────┐
              │   Output: letter OR     │
              │   guess (full phrase)   │
              └─────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `src/benchmark.ts` | CLI benchmark entry point |
| `src/agent.ts` | Agent definition with prompt and output schema |
| `src/game.ts` | Puzzle definitions and game logic |
| `src/game-state.ts` | State management for the current game |

## Environment Variables

Create `.env.local`:

```bash
DATABASE_URL=postgresql://localhost:5432/nullagent
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
AI_GATEWAY_API_KEY=your-key
MODEL_ID=xai/grok-4.1-fast-reasoning
```

## Example Output

```
agent_000 Benchmark - Word Guessing Game
========================================

Game 1: "Famous Phrases"
Board: _ _ _ _   _ _ _ _   _ _ _   _ _ _ _
  Guess #1: Letter "E" - Found "E"!
  Guess #2: Letter "A" - Found "A"!
  Guess #3: Letter "T" - Found "T"!
  ...
  Guess #8: Phrase "THAT SHIP HAS SAILED" - Solved!


Results Summary
---------------
Game | Category            | Solved | Guesses
-----|---------------------|--------|--------
  1  | Famous Phrases      | Yes    | 8
-----|---------------------|--------|--------
Win Rate: 1/1 (100%)
Average Guesses: 8.0
```

## When to Use This Pattern

- Single-agent decision making
- Sequential game play with state feedback
- Simple prompt → action loops
- Testing LLM reasoning on word puzzles
