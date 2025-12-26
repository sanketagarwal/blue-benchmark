# agent_001: Two-Agent Puzzle Game

A two-agent system where one LLM creates puzzles and another solves them.

## What It Does

Uses two specialized agents:
1. **Puzzle Master**: Creates phrases with categories (e.g., "Famous Phrases", "Movie Titles")
2. **Player**: Strategically guesses letters or solves the puzzle

This demonstrates multi-agent coordination where agents have distinct roles.

## Usage

Run the benchmark with:

```bash
cd apps/agent_001
pnpm benchmark
```

This runs complete puzzle games, tracking wins, losses, and average moves.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     pnpm benchmark                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │       Game State          │
              │  • Puzzle storage         │
              │  • Board state tracking   │
              │  • Win/fail detection     │
              └─────────────┬─────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   │                   ▼
┌───────────────┐           │           ┌───────────────┐
│ Puzzle Master │           │           │    Player     │
│  (creates)    │           │           │   (solves)    │
│               │           │           │               │
│ Output:       │           │           │ Output:       │
│ • phrase      │           │           │ • letter OR   │
│ • category    │           │           │ • guess       │
└───────┬───────┘           │           └───────┬───────┘
        │                   │                   │
        └───────────────────┴───────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │   Results Summary       │
              │  • Win/loss per game    │
              │  • Move counts          │
              │  • Win rate statistics  │
              └─────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `src/benchmark.ts` | CLI benchmark entry point |
| `src/puzzle-master.ts` | Agent that creates puzzles with categories |
| `src/player.ts` | Agent that guesses letters/phrases |
| `src/game-state.ts` | State management between agents |

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
Starting agent_001 benchmark...
Running 1 complete puzzle games

Game 1: "THE EARLY BIRD CATCHES THE WORM" (Famous Phrases)
Board: _ _ _   _ _ _ _ _   _ _ _ _   _ _ _ _ _ _ _   _ _ _   _ _ _ _
  Move 1: tried "E" => T H E   E _ _ L _   _ _ _ _   _ _ T _ H E _   T H E   _ _ _ _
  Move 2: tried "A" => T H E   E A _ L _   _ _ _ _   _ A T _ H E _   T H E   _ _ _ _
  ...
  Move 12: guessed "THE EARLY BIRD CATCHES THE WORM"
  SOLVED in 12 moves!


+-----------------------------------------------------------------+
|          agent_001 Benchmark Results (1 games)                  |
+---------+------------+-----------+-----------------------------+
|  Game   |   Result   |   Moves   |           Phrase            |
+---------+------------+-----------+-----------------------------+
|    1    |    WON     |    12     | THE EARLY BIRD CATCHES THE  |
+---------+------------+-----------+-----------------------------+
| Summary: 1/1 won (100.0%), avg 12.0 moves                       |
+-----------------------------------------------------------------+
```

## When to Use This Pattern

- Multi-agent coordination
- Creator/solver game dynamics
- Separate concerns between agents
- Testing LLM collaboration
