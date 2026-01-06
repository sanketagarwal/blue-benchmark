# CLAUDE.md – 004 Matrix Eval Benchmark

## Purpose

This benchmark evaluates **multiple LLMs on the same forecasting task** and compares performance:
- Model matrix: runs multiple models (e.g., grok, claude-haiku, gpt-5-nano)
- Each model predicts dump probabilities from charts and orderbook
- Aggregates Brier score, log loss, accuracy per model
- Prints ASCII comparison table with winner

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

- **`src/matrix.ts`** – MODEL_MATRIX and BENCHMARK_ROUNDS configuration
- **`src/forecaster.ts`** – Agent factory `createForecaster(modelId)` with isolated history
- **`src/clock-state.ts`** – Simulation time management
- **`src/results.ts`** – Aggregation and winner calculation
- **`src/table.ts`** – ASCII summary table rendering
- **`src/benchmark.ts`** – CLI entrypoint orchestrating multi-model evaluation

## Key Considerations

- **Do not set MODEL_ID in .env.local** – benchmark sets it dynamically per model
- Each model gets its own agent ID and history (no cross-contamination)
- Must call `setForecastContext()` before rounds
- Clock advances 1h per round; all models see identical data per round

## Environment

Requires `.env.local`:
```bash
DATABASE_URL=postgresql://localhost:5432/nullagent
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
AI_GATEWAY_API_KEY=your-key
REPLAY_LAB_API_KEY=rn_...
REPLAY_LAB_BASE_URL=https://replay-lab-delta.preview.recall.network
SIMULATION_START_TIME=2025-12-22T14:00:00Z
SYMBOL_ID=COINBASE_SPOT_ETH_USD
```
