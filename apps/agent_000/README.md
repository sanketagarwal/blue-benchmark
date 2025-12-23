# agent_000: Single Agent with Memory

A single LLM agent playing Wheel of Fortune, demonstrating persistent memory and compaction.

## What It Does

The agent plays a word-guessing game (Wheel of Fortune style):
- Sees a board with hidden letters: `_ _ L L O   _ O R L D`
- Guesses letters one at a time, or attempts to solve the whole phrase
- Learns from past games through persistent message history

## Architecture

```
┌─────────────────────────────────────────┐
│              POST /api/play             │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│              Agent (agent_000)          │
│  ┌───────────────────────────────────┐  │
│  │         Message History           │  │
│  │  (prompts, outputs, compaction)   │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Key Concepts

**Persistent Memory**: Every prompt and response is stored in the database. The agent sees its full history when making decisions, allowing it to learn patterns across games.

**Compaction**: Every 3 rounds, the agent's history is summarized by the LLM itself, preserving key learnings while reducing token usage.

**Hardcoded Puzzles**: Uses a static puzzle list. The focus here is demonstrating agent memory, not puzzle generation.

## Files

| File | Purpose |
|------|---------|
| `src/agent.ts` | Agent definition (schema, prompts, compaction trigger) |
| `src/game.ts` | Puzzle selection and game logic |
| `src/game-state.ts` | In-memory game state management |
| `src/app/api/play/route.ts` | API endpoint |

## Usage

```bash
pnpm dev --filter=agent_000
curl -X POST http://localhost:3001/api/play
```

## Example Response

```json
{
  "success": true,
  "board": "H E L L O   _ O R L D",
  "move": { "letter": "w", "reasoning": "W is likely given the pattern" },
  "message": "Found \"w\"!",
  "roundNumber": 3,
  "wasCompacted": false
}
```

## When to Use This Pattern

- Single-purpose agents with learning over time
- Simple request-response workflows
- Experimenting with memory and compaction strategies
