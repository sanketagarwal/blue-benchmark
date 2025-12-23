# agent_001: Multi-Agent Orchestration

Two LLM agents collaborating on Wheel of Fortune - one creates puzzles, one solves them.

## What It Does

**Puzzle Master** generates creative phrases with categories:
- "BREAK A LEG" (Theater)
- "PIECE OF CAKE" (Food Idioms)

**Player** solves the puzzles:
- Sees the board: `_ _ _ _ _   _   _ _ _`
- Guesses letters strategically based on category hints
- Can attempt to solve the whole phrase

Each agent has its own memory. Puzzle Master learns what makes good puzzles. Player learns solving strategies. Neither sees the other's history.

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
       └──────────────────┘
```

## Key Concepts

**Separate Memories**: Each agent maintains independent message history. Puzzle Master's compaction summarizes "what puzzles worked well." Player's compaction summarizes "what strategies worked."

**Conditional Orchestration**: Puzzle Master only runs when needed (no active game, or previous game ended). Player runs every request.

**Agent-to-Agent Data Flow**: Puzzle Master's output becomes Player's input, but through game state - not direct message passing.

## Files

| File | Purpose |
|------|---------|
| `src/puzzle-master.ts` | Generates puzzles (phrase + category) |
| `src/player.ts` | Solves puzzles (letter/phrase guesses) |
| `src/game-state.ts` | Shared state between agents |
| `src/app/api/play/route.ts` | Orchestration logic |
| `src/app/api/debug/route.ts` | View both agents' message histories |

## Usage

```bash
pnpm dev --filter=agent_001
curl -X POST http://localhost:3002/api/play  # Creates puzzle + makes move
curl http://localhost:3002/api/debug          # View message histories
```

## Example Response

```json
{
  "success": true,
  "puzzleCreated": true,
  "category": "Movie Quotes",
  "board": "_ _ _ _ _   _ _   _ _ _ _   _ _ _ _",
  "move": { "letter": "e", "reasoning": "E is most common in English" },
  "message": "Found \"e\"!",
  "gameState": { "solved": false, "failed": false, "guessedLetters": ["E"] }
}
```

## When to Use This Pattern

- Separation of concerns (generator vs consumer)
- Agents that learn different things from the same workflow
- Different compaction strategies per agent role
