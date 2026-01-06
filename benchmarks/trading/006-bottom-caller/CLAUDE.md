# CLAUDE.md – 006 Bottom Caller Benchmark

## Purpose

This benchmark is a **4-phase elimination tournament** testing whether vision LLMs can detect **structural market bottoms** on BTC/USD:
- Phase 0: Sanity filter (degenerate models)
- Phase 1: Relative performance (bottom-quartile elimination)
- Phase 2: Stability & regret (variance/worst-window filtering)
- Phase 3: Final ranking

Tests 24+ vision models across 4 horizons (15m, 1h, 4h, 24h).

## Commands

```bash
pnpm benchmark            # Full benchmark
pnpm benchmark --verbose  # With detailed documentation
pnpm benchmark --quick    # Quick mode (3 rounds)
pnpm dev                  # Next.js dev server
pnpm build                # Next.js production build
pnpm test                 # Run tests (353 tests)
pnpm test:watch           # Watch mode
pnpm test:coverage        # With coverage
pnpm lint                 # ESLint
pnpm check-types          # TypeScript check
```

## Architecture

- **`src/bottom-caller.ts`** – Multimodal agent with 4 chart images per round
- **`src/matrix.ts`** – Loads model matrix from `models.json`
- **`src/clock-state.ts`** – Simulation time (advances 15min per round)
- **`src/phases/phase-runner.ts`** – Phase orchestration
- **`src/scorers/`** – Phase 0-3 scoring, log loss, Brier, timing metrics
- **`src/ground-truth/no-new-low.ts`** – Ground truth resolver
- **`src/diagnostics/`** – Label balance, prediction diversity, parse failures
- **`src/reports/`** – Leaderboards, model profiles, separability analysis
- **`src/benchmark.ts`** – Main CLI entrypoint (~2k LOC)

## Key Considerations

- Must call `setBottomCallerContext()` before rounds, `clearBottomCallerContext()` after
- Output schema: per-horizon `{ noNewLow: boolean, confidence: 0.5-1.0 }`
- Global clock state – call `resetClockState()` between runs
- Quick mode uses `QUICK_SIMULATION_START_TIME` for faster iteration
- Hardcoded to `COINBASE_SPOT_BTC_USD`

## Environment

Requires `.env.local`:
```bash
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
AI_GATEWAY_API_KEY=your-key
REPLAY_LAB_API_KEY=rn_...
REPLAY_LAB_BASE_URL=https://replay-lab-delta.preview.recall.network
SIMULATION_START_TIME=2025-12-18T18:00:00Z
QUICK_SIMULATION_START_TIME=2025-12-18T19:30:00Z
```
