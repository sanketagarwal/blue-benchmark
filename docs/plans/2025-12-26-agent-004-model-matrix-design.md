# agent_004: Model Matrix Benchmark

## Overview

A CLI-based benchmark tool that runs the same forecasting scenario across multiple LLM models and compares their performance.

## Models in Matrix

```typescript
const MODEL_MATRIX = [
  'xai/grok-4-fast-reasoning',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-5-nano',
] as const;
```

## Execution Flow

```
pnpm run benchmark
        │
        ▼
┌─────────────────────────────────────────────────┐
│  Initialize clock from SIMULATION_START_TIME    │
└────────────────────┬────────────────────────────┘
                     │
        ┌────────────▼────────────┐
        │   FOR round = 1 to 3    │
        └────────────┬────────────┘
                     │
        ┌────────────▼────────────────────────────┐
        │  Fetch once per round:                  │
        │  • 2 chart signed URLs                  │
        │  • Orderbook snapshot                   │
        │  • Ground truth annotations             │
        └────────────┬────────────────────────────┘
                     │
        ┌────────────▼────────────────────────────┐
        │  FOR each model in matrix:              │
        │  • Set model ID on forecaster           │
        │  • Set agentId = model ID               │
        │  • Inject shared context (charts, etc.) │
        │  • runRound(forecaster)                 │
        │  • Score predictions                    │
        │  • Store results                        │
        └────────────┬────────────────────────────┘
                     │
        ┌────────────▼────────────┐
        │  Advance clock +1 hour  │
        └────────────┬────────────┘
                     │
                     ▼
              (repeat 3x)
                     │
        ┌────────────▼────────────────────────────┐
        │  Print summary table                    │
        └─────────────────────────────────────────┘
```

## Key Design Decisions

### Isolation Strategy
- Each model uses its model ID as the `agentId` in the database
- Same `agentMessages` table, naturally isolated by agentId column
- Each model maintains its own message history and compaction cycles

### Data Fetching Optimization
- External API data (charts, orderbook, annotations) fetched once per round
- All models receive the exact same market data for fair comparison

### Scoring
- **Brier Score**: Mean squared error of probabilities (lower = better)
- **Log Loss**: Cross-entropy loss (lower = better)
- **Accuracy**: Percentage correct at 0.5 threshold (higher = better)
- No monotonicity scoring

## Output Format

```
┌───────────────────────────────────────────────────────────────────┐
│              agent_004 Benchmark Results (3 rounds)               │
├─────────────────────────────────┬─────────┬─────────┬─────────────┤
│ Model                           │  Brier  │ LogLoss │  Accuracy   │
├─────────────────────────────────┼─────────┼─────────┼─────────────┤
│ xai/grok-4-fast-reasoning       │  0.142  │  0.431  │    77.8%    │
│ anthropic/claude-haiku-4.5      │  0.168  │  0.502  │    70.4%    │
│ openai/gpt-5-nano               │  0.201  │  0.589  │    63.0%    │
├─────────────────────────────────┴─────────┴─────────┴─────────────┤
│ Winner: xai/grok-4-fast-reasoning (lowest Brier score)            │
└───────────────────────────────────────────────────────────────────┘
```

## File Structure

```
apps/agent_004/
├── src/
│   ├── benchmark.ts          # CLI entry point
│   ├── matrix.ts             # Model matrix config
│   ├── forecaster.ts         # Agent definition (from agent_003)
│   ├── clock-state.ts        # Simulation time (from agent_003)
│   ├── replay-lab/           # API clients (from agent_003)
│   │   ├── client.ts
│   │   ├── charts.ts
│   │   ├── orderbook.ts
│   │   └── annotations.ts
│   └── scorers/              # Scoring (from agent_003, minus monotonicity)
│       ├── types.ts
│       ├── brier-scorer.ts
│       ├── log-loss-scorer.ts
│       └── aggregate-scorer.ts
├── package.json              # "benchmark": "tsx src/benchmark.ts"
├── tsconfig.json
└── .env.local                # Copy from agent_003
```

## Environment Variables

Inherited from agent_003 via `.env.local`:
- `SIMULATION_START_TIME` - Clock start time
- `AI_GATEWAY_BASE_URL` / `AI_GATEWAY_API_KEY` - LLM access
- `REPLAY_LAB_BASE_URL` / `REPLAY_LAB_API_KEY` - Market data
- `DATABASE_URL` - Message history persistence
- `SYMBOL_ID` - Trading pair (COINBASE_SPOT_ETH_USD)

No `MODEL_ID` env var - the matrix provides models programmatically.

## Configuration

```typescript
// src/matrix.ts
export const MODEL_MATRIX = [
  'xai/grok-4-fast-reasoning',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-5-nano',
] as const;

export const BENCHMARK_ROUNDS = 3;
```
