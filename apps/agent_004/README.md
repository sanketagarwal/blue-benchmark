# agent_004: Limit Order Fill Predictor

An LLM agent that predicts the fill probability of hypothetical limit orders, simulating an HFT market-maker's core competency.

## What It Does

Predicts the probability that a limit order placed RIGHT NOW at the current best bid or best ask would fill within various time horizons.

**6 Fill Probability Contracts:**

| Contract | Description |
|----------|-------------|
| `bid-fill-1m` | Limit BUY at best_bid fills within 1 minute |
| `bid-fill-5m` | Limit BUY at best_bid fills within 5 minutes |
| `bid-fill-15m` | Limit BUY at best_bid fills within 15 minutes |
| `ask-fill-1m` | Limit SELL at best_ask fills within 1 minute |
| `ask-fill-5m` | Limit SELL at best_ask fills within 5 minutes |
| `ask-fill-15m` | Limit SELL at best_ask fills within 15 minutes |

**Monotonicity Constraints:**
- `bid-fill-15m >= bid-fill-5m >= bid-fill-1m`
- `ask-fill-15m >= ask-fill-5m >= ask-fill-1m`

More time = more chances to fill.

## Why This Matters

From HFT research: *"The real-time model that estimates the expected value of placing, keeping, or canceling a limit order right now."*

This is the core of market-making:
- **Capturing spread** is easy
- **Avoiding adverse selection** (being filled then price moves against you) is hard
- **Fill probability** is the foundation for expected value calculations

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
cd apps/agent_004

# Normal mode (spinners only)
pnpm benchmark

# Verbose mode (detailed predictions and results)
pnpm benchmark --verbose
```

## Example Output

**Normal mode:**
```
agent_004 Benchmark
===================
Symbol: COINBASE_SPOT_ETH_USD
Model: xai/grok-4.1-fast-reasoning
Start Time: 2025-12-22T14:00:00.000Z

✓ Round 1/3: Complete
✓ Round 2/3: Complete
✓ Round 3/3: Complete

Results
-------
Model: xai/grok-4.1-fast-reasoning
Average Brier Score: 0.187
Average Log Loss: 0.542
Average Accuracy: 72.2%
```

**Verbose mode (`--verbose`):**
```
agent_004 Benchmark
===================
Round 1/3

Predictions:
  bid-fill-1m           0.150
  bid-fill-5m           0.350
  bid-fill-15m          0.550
  ask-fill-1m           0.250
  ask-fill-5m           0.500
  ask-fill-15m          0.700

Ground Truth:
  ✗ bid-fill-1m         (predicted 0.15)
  ✓ bid-fill-5m         (predicted 0.35)
  ✓ bid-fill-15m        (predicted 0.55)
  ✗ ask-fill-1m         (predicted 0.25)
  ✓ ask-fill-5m         (predicted 0.50)
  ✓ ask-fill-15m        (predicted 0.70)

Scores: Brier=0.187, LogLoss=0.542, Accuracy=66.7%
✓ Round 1/3: Complete
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

| Metric | Description | Range |
|--------|-------------|-------|
| **Brier Score** | Mean squared error of probabilities | 0 (perfect) to 1 (worst) |
| **Log Loss** | Cross-entropy loss | 0 (perfect) to +inf |
| **Accuracy** | Correct predictions at 0.5 threshold | 0% to 100% |
| **Monotonicity Violations** | Count of constraint breaches | 0 (perfect) |

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
    │   6 Fill Predictions    │                 │
    └───────────┬─────────────┘                 │
                │                               │
                ▼                               ▼
    ┌─────────────────────┐       ┌─────────────────────┐
    │     Predictions     │       │    Fill Checker     │
    │   (probabilities)   │       │   (ground truth)    │
    └─────────┬───────────┘       └─────────┬───────────┘
              │                             │
              └──────────────┬──────────────┘
                             │
                             ▼
               ┌─────────────────────────┐
               │     Forecast Scorer     │
               │  • Brier Score          │
               │  • Log Loss             │
               │  • Accuracy             │
               │  • Monotonicity Check   │
               └─────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `src/benchmark.ts` | CLI benchmark entry point with --verbose support |
| `src/market-maker.ts` | Market maker agent definition + output schema |
| `src/clock-state.ts` | Simulation time management |
| `src/ground-truth/fill-checker.ts` | **Fill simulation from trade data** |
| `src/replay-lab/client.ts` | Replay Lab API client |
| `src/replay-lab/trades.ts` | **Tick-by-tick trade data with taker_side** |
| `src/replay-lab/charts.ts` | Chart URL signing |
| `src/replay-lab/orderbook.ts` | Orderbook data (mid, spread, imbalance, bid, ask) |
| `src/scorers/` | Brier, log loss, monotonicity, aggregate scorers |
| `src/app/api/play/route.ts` | Next.js API route for web interface |

## Environment Variables

Create `.env.local`:

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

## Test Coverage

```
155 tests passing
97.39% line coverage
93.89% branch coverage
100% function coverage
```

## Future Extensions

Per the design document (`docs/plans/2025-12-29-agent-004-limit-order-value-design.md`):

- **Phase 2:** Price direction contracts (`price-up-1m`, `price-down-1m`)
- **Phase 3:** Expected value contracts (`bid-ev-1m`, `ask-ev-1m`)
- **Phase 4:** Adverse selection scoring
- **Phase 5:** Queue position modeling

## When to Use This Pattern

- Probability forecasting with deterministic ground truth from data
- Multi-output predictions with monotonicity constraints
- Integrating external data sources (charts, orderbooks, trades)
- Time-series simulation with clock management
- HFT/market-making strategy research
