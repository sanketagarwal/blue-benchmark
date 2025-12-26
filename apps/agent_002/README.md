# agent_002: Scored Puzzle Game

Extends agent_001 with per-move scoring to evaluate the quality of each guess.

## What It Does

Like agent_001, uses two agents (Puzzle Master + Player), but adds detailed scoring:
- **Letter reveals**: Points based on letters uncovered
- **Strategic guesses**: Bonus for efficient solving
- **Wrong guesses**: Penalties for misses

This enables quantitative comparison between different models or strategies.

## Usage

Run the benchmark with:

```bash
cd apps/agent_002
pnpm benchmark
```

This runs scored puzzle games, tracking wins, moves, and average score per move.

## Scoring Metrics

| Metric | Description |
|--------|-------------|
| **Letter Found** | +1.0 base, bonus for multiple occurrences |
| **Letter Not Found** | -0.5 penalty for wrong letter |
| **Phrase Solved** | +5.0 bonus for correct full guess |
| **Phrase Failed** | -3.0 penalty for wrong phrase guess |

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
└───────┬───────┘           │           └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │    Player Scorer        │
              │  ┌───────────────────┐  │
              │  │ Board before      │  │
              │  │ Board after       │  │
              │  │ Move type/result  │  │
              │  └───────────────────┘  │
              └───────────┬─────────────┘
                          │
                          ▼
              ┌─────────────────────────┐
              │   Scored Results        │
              │  • Score per move       │
              │  • Average score        │
              │  • Win statistics       │
              └─────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `src/benchmark.ts` | CLI benchmark entry point |
| `src/puzzle-master.ts` | Agent that creates puzzles with categories |
| `src/player.ts` | Agent that guesses letters/phrases |
| `src/game-state.ts` | State management between agents |
| `src/scorers/player-round-scorer.ts` | Per-move scoring logic |

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
agent_002 Benchmark (Puzzle Game with Scoring)
==============================================

Game 1/1
────────────────────────────────────────
Category: Famous Phrases
Board: _ _ _   _ _ _ _ _   _ _ _ _   _ _ _ _ _ _ _   _ _ _   _ _ _ _
  Move 1: letter "E" → score 1.50
  Move 2: letter "A" → score 1.00
  Move 3: letter "T" → score 1.50
  Move 4: letter "R" → score 1.00
  Move 5: letter "S" → score -0.50
  Move 6: letter "I" → score 1.00
  ...
  Move 10: phrase "THE EARLY BIRD CATCHES THE WORM" → score 5.00 [SOLVED]
Result: WON in 10 moves
Phrase: THE EARLY BIRD CATCHES THE WORM


┌─────────────────────────────────────────────────────────────┐
│          agent_002 Benchmark Results (1 game)               │
├─────────┬────────────┬───────────┬─────────────────────────┤
│  Game   │   Result   │   Moves   │         Phrase          │
├─────────┼────────────┼───────────┼─────────────────────────┤
│    1    │    WON     │    10     │ THE EARLY BIRD CATCHE...│
├─────────┴────────────┴───────────┴─────────────────────────┤
│ Summary: 1/1 won (100.0%), avg 10.0 moves, avg score 1.35  │
└─────────────────────────────────────────────────────────────┘
```

## When to Use This Pattern

- Quantitative evaluation of LLM decisions
- A/B testing different models on same task
- Training data generation with quality scores
- Detailed move-by-move analysis
