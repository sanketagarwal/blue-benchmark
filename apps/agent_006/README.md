# agent_006: One-Sided Execution EV Estimator

A production-grade benchmark for evaluating LLM capability at limit order fill prediction, conditional price movement estimation, and expected value calculation—the core competencies of HFT market-making.

**What this is:**
- A one-sided execution EV estimator
- With out-of-sample realized PnL validation
- And confidence-aware diagnostics
- Suitable for feeding into a meta-allocator or strategy selector

This is the measurement layer that model-selection and ensemble systems depend on.

## Why This Matters

From HFT research: *"The real-time model that estimates the expected value of placing, keeping, or canceling a limit order right now."*

This benchmark tells uncomfortable truths about model capability:
- **Capturing spread** is easy
- **Avoiding adverse selection** (being filled then price moves against you) is hard
- **Directional skill vs hallucinated magnitude** is what separates research from capital-deployable

## Key Design Decisions

### ATR-Normalized Delta-Mid Clipping

**Critical constraint:** Delta-mid predictions are clipped to `[-3, +3] ATR` before EV calculation.

Without this, models can hallucinate arbitrarily large values that dominate EV calculations, making directional skill meaningless. This mirrors real trading systems where position limits and risk controls prevent unbounded exposure.

```
MAX_ATR_MULTIPLE = 3
clipped_delta = clip(raw_delta, -3*ATR, +3*ATR)
```

### Bid/Ask Split Reporting

All metrics are reported separately for bid and ask sides:
- MAE (Mean Absolute Error) per side
- EV (Expected Value) per side
- PnL (Profit/Loss) per side

This reveals asymmetric model behavior that aggregate metrics hide.

### Low Sample Warnings

Metrics with fewer than 10 fills per side are marked with `†` and dimmed. This prevents over-interpretation of noisy data.

### EV Quintile Analysis

After the main results, a separate table shows EV calibration across prediction confidence buckets:
- Q1 (lowest predicted EV) through Q5 (highest)
- Mean predicted EV vs mean realized PnL per bucket
- Gap analysis reveals where models are miscalibrated

## Three Evaluation Legs

### Leg 1: Fill Probability (Binary Classification)

| Contract | Description |
|----------|-------------|
| `bid-fill-1m/5m/15m` | Limit BUY at best_bid fills within horizon |
| `ask-fill-1m/5m/15m` | Limit SELL at best_ask fills within horizon |

**Metrics:** Brier Score (lower=better), Accuracy

**Monotonicity enforced:** `fill-15m >= fill-5m >= fill-1m`

### Leg 2: Conditional Price Movement (Regression)

| Contract | Description |
|----------|-------------|
| `bid-delta-mid-*` | Expected mid price change IF bid fills |
| `ask-delta-mid-*` | Expected mid price change IF ask fills |

**Only scored when fill actually occurs.**

**Metrics:**
- Normalized MAE (error / ATR) - comparable across assets and timeframes
- Per-side breakdown reveals asymmetric model behavior

### Leg 3: Realized PnL (Ground Truth)

Deterministic calculation of profit/loss:

```
Bid fills:  PnL = exit_mid - fill_price - fee
Ask fills:  PnL = fill_price - exit_mid - fee
No fill:    PnL = 0

Fixed fee: 1 basis point (0.0001)
```

### Derived EV

Expected Value is computed from predictions, not predicted directly:

```
EV = p_fill × clipped_delta_mid - fees
```

**EV-PnL Gap** reveals model calibration:
- **Large positive gap**: Model overestimates value (optimistic)
- **Large negative gap**: Model underestimates value (conservative)
- **Near zero**: Well-calibrated model

## Usage

```bash
cd apps/agent_006

# Run model matrix benchmark
pnpm benchmark

# Verbose mode
pnpm benchmark --verbose
```

### Example Output

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                          agent_006 EV Benchmark Results (3 rounds)                            │
├──────────────────────┬────────┬────────┬──────────┬──────────┬──────────┬──────────┬──────────┤
│                      │   Leg 1: Fill   │  Leg 2: Δ MAE   │   Leg 3: EV    │  Leg 3: PnL  │ Gap  │
├──────────────────────┼────────┼────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Model                │ Brier↓ │  Acc↑  │   Bid↓   │   Ask↓   │   Bid    │   Ask    │   →0     │
├──────────────────────┼────────┼────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ xai/grok-4-reasoning │  0.187 │  72.2% │     0.45 │     0.52 │  +0.0012 │  -0.0008 │  +0.0002 │
│ anthropic/haiku-4.5  │  0.201 │  68.5% │     0.58†│     0.61†│  +0.0008†│  -0.0005†│  +0.0001 │
│ openai/gpt-5-nano    │  0.195 │  70.1% │     0.51 │     0.55 │  +0.0010 │  -0.0006 │  +0.0003 │
├──────────────────────┴────────┴────────┴──────────┴──────────┴──────────┴──────────┴──────────┤
│ Realized PnL: +0.0005  │  Winner: xai/grok-4-reasoning                                        │
│ † Low sample size (<10 fills) - interpret with caution                                        │
└──────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│    EV Quintile Analysis: xai/grok-4-reasoning   │
├──────────────┬─────────┬─────────┬───────┬──────┤
│   Quintile   │ Mean EV │ Mean PnL│  Gap  │   N  │
├──────────────┼─────────┼─────────┼───────┼──────┤
│ Q1 (lowest)  │  -0.002 │  -0.001 │ -0.001│   12 │
│ Q2           │  +0.000 │  +0.000 │ +0.000│   14 │
│ Q3           │  +0.001 │  +0.001 │ +0.000│   11 │
│ Q4           │  +0.002 │  +0.001 │ +0.001│   13 │
│ Q5 (highest) │  +0.003 │  +0.002 │ +0.001│   10 │
└──────────────┴─────────┴─────────┴───────┴──────┘
```

## How Fill Detection Works

Ground truth uses tick-by-tick trade data with `taker_side`:

```
Limit BUY at best_bid fills when:
  trade.taker_side = SELL AND trade.price <= best_bid

Limit SELL at best_ask fills when:
  trade.taker_side = BUY AND trade.price >= best_ask
```

This mirrors real exchange mechanics—a limit BUY fills when someone sells into it.

## Model Matrix

```typescript
// src/matrix.ts
export const MODEL_MATRIX = [
  'xai/grok-4-fast-reasoning',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-5-nano',
] as const;

export const BENCHMARK_ROUNDS = 3;
```

Each model gets isolated message history via a unique agent ID.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     pnpm benchmark                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │       Clock State         │
              │   (simulation time mgmt)  │
              └─────────────┬─────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  Replay Lab   │  │  Replay Lab   │  │  Replay Lab   │
│  Charts API   │  │  Orderbook    │  │  Trades API   │
│ (signed URLs) │  │  (bid/ask)    │  │ (taker_side)  │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                   │                   │
        └─────────┬─────────┘                   │
                  │                             │
                  ▼                             │
    ┌─────────────────────────┐                 │
    │      Market Maker       │                 │
    │  ┌───────────────────┐  │                 │
    │  │ Chart Images (2x) │  │                 │
    │  │ Orderbook State   │  │                 │
    │  └───────────────────┘  │                 │
    │           │             │                 │
    │           ▼             │                 │
    │  12 Predictions:        │                 │
    │  • 6 Fill Probabilities │                 │
    │  • 6 Delta-Mid Values   │                 │
    └───────────┬─────────────┘                 │
                │                               │
                ▼                               ▼
    ┌─────────────────────┐       ┌─────────────────────┐
    │     Predictions     │       │   Ground Truth      │
    │  • Fill probs       │       │  • Fill events      │
    │  • Delta-mid values │       │  • Mid prices       │
    │    (ATR-clipped)    │       │  • ATR per horizon  │
    └─────────┬───────────┘       └─────────┬───────────┘
              │                             │
              └──────────────┬──────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   LEG 1: Fill   │ │  LEG 2: Delta   │ │   LEG 3: PnL    │
│   Probability   │ │   Mid Scorer    │ │   Calculator    │
│  • Brier Score  │ │  • Normalized   │ │  • Per-decision │
│  • Accuracy     │ │    MAE (÷ATR)   │ │  • Per-side     │
│                 │ │  • Per-side     │ │                 │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                             ▼
               ┌─────────────────────────┐
               │    EV Calculator        │
               │  EV = p_fill × δ_clipped│
               │       - fees            │
               └───────────┬─────────────┘
                           │
                           ▼
               ┌─────────────────────────┐
               │   Quintile Analyzer     │
               │  Calibration by EV      │
               │  confidence bucket      │
               └───────────┬─────────────┘
                           │
                           ▼
               ┌─────────────────────────┐
               │   Results + Tables      │
               │  • Main summary         │
               │  • Per-model quintiles  │
               └─────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `src/benchmark.ts` | CLI benchmark entry point |
| `src/matrix.ts` | Model matrix configuration |
| `src/market-maker.ts` | Market maker agent definition |
| `src/results.ts` | Result types and summary calculations |
| `src/table.ts` | ASCII table formatter with bid/ask split |
| `src/clock-state.ts` | Simulation time management |
| `src/ground-truth/fill-checker.ts` | Fill simulation from trade data |
| `src/replay-lab/atr-calculator.ts` | **ATR calculation for normalization** |
| `src/replay-lab/trades.ts` | Tick-by-tick trade data |
| `src/replay-lab/mid-price.ts` | Mid price computation |
| `src/scorers/delta-mid-scorer.ts` | **Normalized MAE with per-side breakdown** |
| `src/scorers/pnl-calculator.ts` | PnL calculation logic |
| `src/scorers/ev-calculator.ts` | **EV with ATR clipping ([-3,+3] ATR)** |
| `src/scorers/quintile-analyzer.ts` | **EV calibration analysis** |

## Environment Variables

```bash
DATABASE_URL=postgresql://localhost:5432/nullagent
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
AI_GATEWAY_API_KEY=your-key
REPLAY_LAB_API_KEY=rn_...
REPLAY_LAB_BASE_URL=https://replay-lab-delta.preview.recall.network
SIMULATION_START_TIME=2025-12-22T14:00:00Z
SYMBOL_ID=COINBASE_SPOT_ETH_USD
```

## Test Coverage

```
289 tests passing
94%+ line coverage
```

## What This Is Not

This is not:
- Overengineered
- Academic
- A demo

This is a correct, honest system that tells uncomfortable truths about model capability. It's the substrate required for model-vs-model performance learning and meta-allocation systems.
