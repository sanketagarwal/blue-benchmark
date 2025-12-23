# agent_002: Multi-Agent with Scoring

Two LLM agents playing Wheel of Fortune, with deterministic scoring after each move.

## What It Does

Same as agent_001 (Puzzle Master + Player), but adds **scoring** to evaluate each move:

- **Correctness** (0 or 1): Did the guess find letters or solve the puzzle?
- **Difficulty** (0-1): What proportion of letters were still hidden?
- **Score** (0-1): Combined metric: `correctness * (0.5 + difficulty * 0.5)`

Scores are persisted to a `scorer_results` table and correlated via `trace_id`.

## Architecture

```
┌─────────────────────────────────────────┐
│              POST /api/play             │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        │  needsNewPuzzle?  │
        └─────────┬─────────┘
                  │
       ┌──────────┴──────────┐
       │ yes                 │ no
       ▼                     │
┌──────────────────┐         │
│  Puzzle Master   │         │
│  ┌────────────┐  │         │
│  │  Memory A  │  │         │
│  └────────────┘  │         │
└────────┬─────────┘         │
         │                   │
         ▼                   │
    startNewGame()           │
         │                   │
         └───────┬───────────┘
                 │
                 ▼
       ┌──────────────────┐
       │      Player      │
       │  ┌────────────┐  │
       │  │  Memory B  │  │
       │  └────────────┘  │
       └────────┬─────────┘
                │
                ▼
       ┌──────────────────┐
       │  playerRound     │
       │  Scorer          │  ← Deterministic function
       │  (no memory)     │     not an LLM agent
       └────────┬─────────┘
                │
                ▼
         ┌────────────┐
         │ scorer_    │
         │ results DB │
         └────────────┘
```

## Scoring Logic

The `playerRoundScorer` evaluates each move:

```typescript
correctness = move found letters or solved? 1 : 0
difficulty  = hiddenLettersBefore / totalLetters  // 0-1 scale
score       = correctness * (0.5 + difficulty * 0.5)
```

**Why this formula?**
- Correct guesses when most letters hidden (hard) score ~1.0
- Correct guesses when few letters hidden (easy) score ~0.5
- Incorrect guesses always score 0

## Trace Correlation

Every request generates a `trace_id` (UUID) that links:
- All `agent_messages` for that round
- The `scorer_results` entry

Query scores with: `SELECT * FROM scorer_results WHERE trace_id = '...'`

## Files

| File | Purpose |
|------|---------|
| `src/puzzle-master.ts` | Generates puzzles (phrase + category) |
| `src/player.ts` | Solves puzzles (letter/phrase guesses) |
| `src/scorers/player-round-scorer.ts` | Deterministic scoring function |
| `src/game-state.ts` | Shared state between agents |
| `src/app/api/play/route.ts` | Orchestration + scoring logic |
| `src/app/api/debug/route.ts` | View agents' message histories |

## Usage

```bash
pnpm dev --filter=agent_002
curl -X POST http://localhost:3003/api/play
```

## Example Response

```json
{
  "success": true,
  "traceId": "3d2e7d30-fffd-4112-a84f-07eb11935983",
  "puzzleCreated": true,
  "category": "Movie",
  "board": "_ _ E   _ _ _ _   _ _ _ _ _ _",
  "move": { "letter": "e", "reasoning": "E is most common" },
  "message": "Found \"e\"!",
  "gameState": { "solved": false, "failed": false, "guessedLetters": ["E"] },
  "score": { "score": 1, "correctness": 1, "difficulty": 1 }
}
```

## When to Use This Pattern

- Measuring agent performance over time
- A/B testing different agent prompts or models
- Building dashboards for agent quality metrics
- Creating training data with quality labels
