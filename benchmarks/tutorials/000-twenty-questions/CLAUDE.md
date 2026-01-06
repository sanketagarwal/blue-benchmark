# CLAUDE.md – 000 Twenty Questions Benchmark

## Purpose

This benchmark tests a single LLM agent playing a **word guessing game** (Wheel-of-Fortune style). It evaluates:
- Basic reasoning & strategy (common letters first, pattern inference)
- Stateful sequential interaction (using feedback, not repeating letters)
- Context compaction behavior (triggered every 3 rounds)
- Structured output compliance (JSON with letter or guess)

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

- **`src/agent.ts`** – Agent definition with output schema and compaction
- **`src/game.ts`** – Pure game logic (puzzles, board, guessing)
- **`src/game-state.ts`** – In-memory singleton game state manager
- **`src/benchmark.ts`** – CLI entrypoint and evaluation harness

## Key Considerations

- Uses module-level singleton for game state (call `resetGameState()` between tests)
- Agent must output valid JSON: `{"letter": "e"}` or `{"guess": "FULL PHRASE"}`
- Wrong phrase guess immediately ends the game with failure
- Max 26 guesses per game to prevent infinite loops

## Environment

Requires `.env.local`:
```bash
DATABASE_URL=postgresql://localhost:5432/nullagent
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
AI_GATEWAY_API_KEY=your-key
MODEL_ID=xai/grok-4.1-fast-reasoning
```
