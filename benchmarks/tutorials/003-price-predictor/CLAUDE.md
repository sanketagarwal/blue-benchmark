# CLAUDE.md – 003 Price Predictor Benchmark

## Purpose

This benchmark evaluates LLM agents forecasting **cryptocurrency price dump probabilities**:
- Uses technical chart images and orderbook snapshots
- Predicts 9 binary contracts (dump events at various thresholds/horizons)
- Scores with Brier score, log loss, and accuracy
- Enforces monotonicity constraints across thresholds

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

- **`src/forecaster.ts`** – Forecaster agent with ForecastContext and output schema
- **`src/clock-state.ts`** – Simulation time management (advances 1h per round)
- **`src/benchmark.ts`** – CLI entrypoint orchestrating rounds and scoring
- **`src/scorers/`** – Brier, log loss, and aggregate scoring
- **`src/replay-lab/`** – Integration with Replay Lab (charts, orderbook, annotations)

## Key Considerations

- Must call `setForecastContext()` before `runRound()`, then `clearForecastContext()`
- Monotonicity: larger drops less likely, shorter windows less likely than longer ones
- Compaction triggers every 10 rounds
- Clock state is global – call `resetClockState()` before new runs

## Environment

Requires `.env.local`:
```bash
DATABASE_URL=postgresql://localhost:5432/nullagent
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
AI_GATEWAY_API_KEY=your-key
MODEL_ID=xai/grok-4.1-fast-reasoning
REPLAY_LAB_API_KEY=rn_...
REPLAY_LAB_BASE_URL=https://replay-lab-delta.preview.recall.network
SIMULATION_START_TIME=2025-12-22T14:00:00Z
SYMBOL_ID=COINBASE_SPOT_ETH_USD
```
