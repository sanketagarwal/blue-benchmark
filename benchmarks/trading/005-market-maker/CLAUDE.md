# CLAUDE.md – 005 Market Maker Benchmark

## Purpose

This benchmark evaluates LLMs as **HFT-style market makers** with three evaluation legs:
1. **Fill probability**: predict limit order fills at bid/ask across horizons
2. **Delta-mid**: conditional price movement after fill
3. **EV vs PnL**: compare predicted expected value to realized profit/loss

Tests adverse selection, directional skill, and calibration.

## Commands

```bash
pnpm dev                  # Next.js dev server
pnpm build                # Next.js production build
pnpm start                # Start built server
pnpm benchmark            # Run model matrix benchmark (CLI)
pnpm test                 # Run tests once
pnpm test:watch           # Watch mode
pnpm test:coverage        # With coverage
pnpm lint                 # ESLint
pnpm check-types          # TypeScript check
```

## Architecture

- **`src/market-maker.ts`** – Agent with fill/delta-mid contracts and context
- **`src/matrix.ts`** – MODEL_MATRIX and BENCHMARK_ROUNDS
- **`src/clock-state.ts`** – Simulation time (advances 1h per round)
- **`src/ground-truth/fill-checker.ts`** – Computes fill ground truth from trades
- **`src/scorers/`** – Brier, log loss, EV/PnL calculation, quintile analysis
- **`src/benchmark.ts`** – CLI entrypoint for multi-model evaluation
- **`src/app/api/play/route.ts`** – Next.js API for interactive stepping

## Key Considerations

- Fill probabilities must obey monotonicity: `15m >= 5m >= 1m` per side
- Delta-mid clipped to ±3 ATR for EV calculation
- Global mutable state (clock, context) – no parallel execution in same process
- Next.js layer is for UI; core benchmark is CLI-based

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
