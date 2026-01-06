# CLAUDE.md – 002 Crossword V2 Benchmark

## Purpose

This benchmark extends the crossword game with **per-move scoring**:
- Two agents: Puzzle Master (creator) and Player (solver)
- Each move is scored quantitatively using `@nullagent/scorers`
- Scores based on correctness and difficulty (fraction of letters still hidden)

## Commands

```bash
pnpm benchmark            # Run the benchmark
pnpm benchmark -- --verbose  # Verbose logging
pnpm test                 # Run tests once
pnpm test:watch           # Watch mode
pnpm test:coverage        # With coverage
pnpm lint                 # ESLint
pnpm check-types          # TypeScript check
```

## Architecture

- **`src/puzzle-master.ts`** – Puzzle Master agent (compacts every 10 rounds)
- **`src/player.ts`** – Player agent (compacts every 5 rounds)
- **`src/game-state.ts`** – In-memory singleton game state manager
- **`src/scorers/player-round-scorer.ts`** – Per-move scoring (correctness × difficulty)
- **`src/benchmark.ts`** – CLI entrypoint with scoring integration

## Key Considerations

- Scoring: `score = correctness * (0.5 + difficulty * 0.5)` where difficulty = hidden letters ratio
- Global `currentGameState` singleton – call `resetGameState()` between tests
- Player must output exactly one of `letter` or `guess` per move
- Max 26 guesses per game

## Environment

Requires `.env.local`:
```bash
DATABASE_URL=postgresql://localhost:5432/nullagent
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
AI_GATEWAY_API_KEY=your-key
MODEL_ID=xai/grok-4.1-fast-reasoning
```
