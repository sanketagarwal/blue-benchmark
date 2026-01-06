# CLAUDE.md – 001 Crossword V1 Benchmark

## Purpose

This benchmark demonstrates a **two-agent crossword-style word guessing game**:
- **Puzzle Master**: generates a phrase and category
- **Player**: iteratively guesses letters or the full phrase

Tests multi-agent coordination, stateful game orchestration, schema-constrained outputs, and agent compaction.

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

- **`src/puzzle-master.ts`** – Puzzle Master agent (generates puzzles, compacts every 10 rounds)
- **`src/player.ts`** – Player agent (guesses letters/phrases, compacts every 5 rounds)
- **`src/game-state.ts`** – In-memory singleton game state manager
- **`src/benchmark.ts`** – CLI entrypoint orchestrating both agents

## Key Considerations

- Global `currentGameState` singleton – call `resetGameState()` between tests
- Player agent expects an active game – always call `startNewGame()` before player rounds
- Puzzle phrases: 3-50 chars, uppercase A-Z + spaces, 2-5 words
- Max 50 moves per game to prevent infinite loops

## Environment

Requires `.env.local`:
```bash
DATABASE_URL=postgresql://localhost:5432/nullagent
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
AI_GATEWAY_API_KEY=your-key
MODEL_ID=xai/grok-4.1-fast-reasoning
```
