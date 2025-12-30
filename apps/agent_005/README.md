# agent_005: Limit Order Fill and Expected Value Predictor

An LLM agent that predicts fill probability, post-fill price movement, and expected value of hypothetical limit orders, simulating an HFT market-maker's core competencies.

**Now with Three-Leg EV Benchmark:** Evaluate models on fill probability, conditional price movement, and realized PnL with derived expected value calculations.

## What It Does

Predicts fill probability, expected price movement after fill, and enables expected value calculation for limit orders placed at the current best bid or best ask.

**6 Fill Probability Contracts:**

| Contract | Description |
|----------|-------------|
| `bid-fill-1m` | Limit BUY at best_bid fills within 1 minute |
| `bid-fill-5m` | Limit BUY at best_bid fills within 5 minutes |
| `bid-fill-15m` | Limit BUY at best_bid fills within 15 minutes |
| `ask-fill-1m` | Limit SELL at best_ask fills within 1 minute |
| `ask-fill-5m` | Limit SELL at best_ask fills within 5 minutes |
| `ask-fill-15m` | Limit SELL at best_ask fills within 15 minutes |

**6 Delta-Mid Contracts (Conditional Price Movement):**

| Contract | Description |
|----------|-------------|
| `bid-delta-mid-1m` | Expected mid price change if bid fills within 1m |
| `bid-delta-mid-5m` | Expected mid price change if bid fills within 5m |
| `bid-delta-mid-15m` | Expected mid price change if bid fills within 15m |
| `ask-delta-mid-1m` | Expected mid price change if ask fills within 1m |
| `ask-delta-mid-5m` | Expected mid price change if ask fills within 5m |
| `ask-delta-mid-15m` | Expected mid price change if ask fills within 15m |

**Monotonicity Constraints (Fill Probability):**
- `bid-fill-15m >= bid-fill-5m >= bid-fill-1m`
- `ask-fill-15m >= ask-fill-5m >= ask-fill-1m`

More time = more chances to fill.

## Why This Matters

From HFT research: *"The real-time model that estimates the expected value of placing, keeping, or canceling a limit order right now."*

This is the core of market-making:
- **Capturing spread** is easy
- **Avoiding adverse selection** (being filled then price moves against you) is hard
- **Fill probability** is the foundation for expected value calculations

## Three Evaluation Legs

The benchmark evaluates models on three complementary dimensions:

### Leg 1: Fill Probability

Binary prediction of whether a limit order fills within each horizon.

| Metric | Description |
|--------|-------------|
| **Brier Score** | Mean squared error of probabilities (0 = perfect) |
| **Log Loss** | Cross-entropy loss (0 = perfect) |
| **Accuracy** | Correct predictions at 0.5 threshold |

### Leg 2: Conditional Price Move

Predicted mid price change after fill. **Only scored when fill actually occurs.**

| Metric | Description |
|--------|-------------|
| **Delta MAE** | Mean absolute error of delta-mid predictions |
| **Delta MSE** | Mean squared error |
| **Delta Bias** | Mean signed error (systematic over/under prediction) |

Ground truth: `delta_mid = mid(t_fill + H) - mid(t_fill)`

### Leg 3: Realized PnL

Deterministic calculation of profit/loss per decision.

**Bid fills at price p:**
```
PnL = exit_mid - fill_price - fee
```

**Ask fills at price p:**
```
PnL = fill_price - exit_mid - fee
```

**No fill:** `PnL = 0`

## Derived Expected Value (EV)

EV is computed from the model's predictions, not predicted directly:

```
EV = p_fill x e_delta_mid - fees
```

| Metric | Description |
|--------|-------------|
| **Mean EV** | Derived expected value per decision |
| **Mean PnL** | Realized profit/loss per decision |
| **EV-PnL Gap** | Difference between predicted and realized value |

**Fixed fee:** 1 basis point (0.0001)

The EV-PnL gap reveals model calibration issues:
- **Large positive gap**: Model overestimates value (optimistic)
- **Large negative gap**: Model underestimates value (conservative)
- **Near zero**: Well-calibrated model

## How Fill Detection Works

The ground truth uses tick-by-tick trade data with `taker_side`:

```
Limit BUY at best_bid fills when:
  trade.taker_side = SELL AND trade.price <= best_bid

Limit SELL at best_ask fills when:
  trade.taker_side = BUY AND trade.price >= best_ask
```

This mirrors real exchange mechanics—a limit BUY fills when someone sells into it.

## Usage

```bash
cd apps/agent_005

# Run model matrix benchmark (default: 3 models, 3 rounds each)
pnpm benchmark

# Verbose mode (detailed predictions and results per model)
pnpm benchmark --verbose
```

### Model Matrix

The benchmark runs multiple LLMs and compares their performance:

```typescript
// src/matrix.ts
export const MODEL_MATRIX = [
  'xai/grok-4-fast-reasoning',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-5-nano',
] as const;

export const BENCHMARK_ROUNDS = 3;
```

Each model gets isolated message history via a unique agent ID:
- `market_maker_xai_grok-4-fast-reasoning`
- `market_maker_anthropic_claude-haiku-4.5`
- `market_maker_openai_gpt-5-nano`

## Example Output

**Normal mode:**
```
agent_005 Model Matrix Benchmark
================================

Symbol: COINBASE_SPOT_ETH_USD
Start Time: 2025-12-22T14:00:00.000Z
Models: xai/grok-4-fast-reasoning, anthropic/claude-haiku-4.5, openai/gpt-5-nano
Rounds: 3

Round 1/3 (2025-12-22T14:00:00.000Z)
  xai/grok-4-fast-reasoning: Brier=0.187, DeltaMAE=0.0012, EV=0.0003, PnL=0.0002
  anthropic/claude-haiku-4.5: Brier=0.201, DeltaMAE=0.0015, EV=0.0002, PnL=0.0001
  openai/gpt-5-nano: Brier=0.195, DeltaMAE=0.0011, EV=0.0004, PnL=0.0003

Round 2/3 (2025-12-22T14:15:00.000Z)
  ...

+----------------------------------------------------------------------+
|           agent_005 Benchmark Results (3 rounds)                      |
+---------------------------+-------+--------+--------+--------+--------+
|           Model           | Brier |DeltaMAE| Mean EV|Mean PnL| EV-PnL |
+---------------------------+-------+--------+--------+--------+--------+
| xai/grok-4-fast-reasoning | 0.187 | 0.0012 | 0.0003 | 0.0002 | +0.0001|
| anthropic/claude-haiku-4.5| 0.201 | 0.0015 | 0.0002 | 0.0001 | +0.0001|
| openai/gpt-5-nano         | 0.195 | 0.0011 | 0.0004 | 0.0003 | +0.0001|
+---------------------------+-------+--------+--------+--------+--------+
| Winner: xai/grok-4-fast-reasoning (lowest Brier score)                |
+----------------------------------------------------------------------+
```

**Verbose mode (`--verbose`):**
```
agent_005 Model Matrix Benchmark
================================

Round 1/3 (2025-12-22T14:00:00.000Z)

  xai/grok-4-fast-reasoning:
    Fill Predictions: {"bid-fill-1m":0.15,"bid-fill-5m":0.35,...}
    Delta Predictions: {"bid-delta-mid-1m":0.0005,"bid-delta-mid-5m":0.0012,...}
    Brier=0.187, DeltaMAE=0.0012, EV=0.0003, PnL=0.0002

  anthropic/claude-haiku-4.5:
    Fill Predictions: {"bid-fill-1m":0.12,"bid-fill-5m":0.30,...}
    Delta Predictions: {"bid-delta-mid-1m":0.0003,"bid-delta-mid-5m":0.0008,...}
    Brier=0.201, DeltaMAE=0.0015, EV=0.0002, PnL=0.0001
  ...
```

## Orderbook Interpretation

The agent receives orderbook state and learns to interpret:

| Signal | Meaning | Fill Implication |
|--------|---------|------------------|
| **Positive imbalance (+)** | More bid depth, buying pressure | Asks more likely to fill |
| **Negative imbalance (-)** | More ask depth, selling pressure | Bids more likely to fill |
| **Tight spread** | Stable prices | Lower fill probability |
| **Wide spread** | Higher volatility | Higher fill probability |

## Chart Analysis

The agent receives two signed chart URLs with full technical indicators:

| Chart | Lookback | Timeframe | Purpose |
|-------|----------|-----------|---------|
| 4h/5m | 4 hours | 5-minute candles | Short-term momentum |
| 24h/15m | 24 hours | 15-minute candles | Medium-term trend |

**Indicators:** SMA(20), EMA(20), Bollinger Bands(20,2), VWAP, SuperTrend(10,3), RSI(14), MACD(12,26,9), Stochastic RSI(14,3,3), ADX(14), CMF(20), Choppiness(14), Volume, Volume Ratio(20)

## Scoring Metrics

**Fill Probability (Leg 1):**

| Metric | Description | Range |
|--------|-------------|-------|
| **Brier Score** | Mean squared error of probabilities | 0 (perfect) to 1 (worst) |
| **Log Loss** | Cross-entropy loss | 0 (perfect) to +inf |
| **Accuracy** | Correct predictions at 0.5 threshold | 0% to 100% |
| **Monotonicity Violations** | Count of constraint breaches | 0 (perfect) |

**Conditional Price Move (Leg 2):**

| Metric | Description | Range |
|--------|-------------|-------|
| **Delta MAE** | Mean absolute error of delta-mid predictions | 0 (perfect) to +inf |
| **Delta MSE** | Mean squared error | 0 (perfect) to +inf |
| **Delta Bias** | Mean signed error (systematic over/under prediction) | -inf to +inf (0 = unbiased) |

**Expected Value and PnL (Leg 3 + Derived):**

| Metric | Description | Range |
|--------|-------------|-------|
| **Mean EV** | Derived expected value per decision | -inf to +inf |
| **Mean PnL** | Realized profit/loss per decision | -inf to +inf |
| **EV-PnL Gap** | Difference between predicted and realized value | -inf to +inf (0 = calibrated) |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     pnpm benchmark                          │
│                    (--verbose flag)                         │
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
    │  │ (mid, spread,     │  │                 │
    │  │  imbalance, bid,  │  │                 │
    │  │  ask)             │  │                 │
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
│  • Brier Score  │ │  • MAE          │ │  • Per-decision │
│  • Log Loss     │ │  • MSE          │ │  • Aggregated   │
│  • Accuracy     │ │  • Bias         │ │                 │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                             ▼
               ┌─────────────────────────┐
               │    EV Calculator        │
               │  EV = p_fill × delta    │
               │       - fees            │
               └───────────┬─────────────┘
                           │
                           ▼
               ┌─────────────────────────┐
               │   Combined Results      │
               │  • Brier, DeltaMAE      │
               │  • Mean EV, Mean PnL    │
               │  • EV-PnL Gap           │
               └─────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `src/benchmark.ts` | CLI benchmark entry point with matrix + --verbose support |
| `src/matrix.ts` | **Model matrix configuration (MODEL_MATRIX, BENCHMARK_ROUNDS)** |
| `src/market-maker.ts` | Market maker agent definition + `createMarketMaker()` factory |
| `src/results.ts` | **Benchmark result types and summary calculations** |
| `src/table.ts` | **ASCII table formatter for comparison output** |
| `src/clock-state.ts` | Simulation time management |
| `src/ground-truth/fill-checker.ts` | **Fill simulation from trade data** |
| `src/replay-lab/client.ts` | Replay Lab API client |
| `src/replay-lab/trades.ts` | **Tick-by-tick trade data with taker_side** |
| `src/replay-lab/mid-price.ts` | **Mid price computation from trade data** |
| `src/replay-lab/charts.ts` | Chart URL signing |
| `src/replay-lab/orderbook.ts` | Orderbook data (mid, spread, imbalance, bid, ask) |
| `src/scorers/` | Brier, log loss, monotonicity, aggregate scorers |
| `src/scorers/delta-mid-scorer.ts` | **MAE, MSE, bias for delta-mid predictions** |
| `src/scorers/pnl-calculator.ts` | **PnL calculation logic** |
| `src/scorers/ev-calculator.ts` | **EV derivation from predictions** |
| `src/app/api/play/route.ts` | Next.js API route for web interface |

## Environment Variables

Create `.env.local`:

```bash
DATABASE_URL=postgresql://localhost:5432/nullagent
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
AI_GATEWAY_API_KEY=your-key
REPLAY_LAB_API_KEY=rn_...
REPLAY_LAB_BASE_URL=https://replay-lab-delta.preview.recall.network
SIMULATION_START_TIME=2025-12-22T14:00:00Z
SYMBOL_ID=COINBASE_SPOT_ETH_USD
```

**Note:** `MODEL_ID` is no longer required when using the matrix benchmark. The benchmark iterates through models defined in `src/matrix.ts`.

## Test Coverage

```
155 tests passing
97.39% line coverage
93.89% branch coverage
100% function coverage
```

## Future Extensions

Per the design document (`docs/plans/2025-12-29-agent-005-ev-benchmark-design.md`):

- **Phase 4:** Adverse selection scoring (measure systematic losses when filled)
- **Phase 5:** Queue position modeling (realistic fill timing based on queue depth)

## When to Use This Pattern

- Probability forecasting with deterministic ground truth from data
- Multi-output predictions with monotonicity constraints
- Integrating external data sources (charts, orderbooks, trades)
- Time-series simulation with clock management
- HFT/market-making strategy research
