# agent_003: Market Forecaster

An LLM agent that forecasts cryptocurrency price movements using technical chart analysis and orderbook data.

## What It Does

Predicts probabilities for 9 different "dump" contracts over 15-minute and 1-hour horizons:

**Simple Dump Contracts** (absolute price drops):
- `dump-simple-15m-1pct` / `3pct` / `5pct` - Price drops within 15 minutes
- `dump-simple-1h-0.5pct` / `1pct` - Price drops within 1 hour

**Volatility-Adjusted Contracts** (z-score based):
- `dump-vol-adjusted-15m-z2` / `1h-z2` - 2 standard deviation moves

**Drawdown Contracts** (from recent peak):
- `dump-drawdown-1pct` / `3pct` - Falls from highest point in window

## Usage

Run the benchmark with:

```bash
cd apps/agent_003
pnpm benchmark
```

This runs 3 forecast rounds, scoring each prediction against ground truth.

## Chart Analysis

The forecaster receives two signed chart URLs with full technical indicators:

| Chart | Lookback | Timeframe | Purpose |
|-------|----------|-----------|---------|
| 4h/5m | 4 hours | 5-minute candles | Short-term momentum |
| 24h/15m | 24 hours | 15-minute candles | Medium-term trend |

**Indicators included**: SMA(20), EMA(20), Bollinger Bands(20,2), VWAP, SuperTrend(10,3), RSI(14), MACD(12,26,9), Stochastic RSI(14,3,3), ADX(14), CMF(20), Choppiness(14), Volume, Volume Ratio(20)

### Example Charts

**4-Hour Chart (5-minute candles):**
![4h Chart](https://replay-lab-delta.preview.recall.network/api/charts/COINBASE_SPOT_ETH_USD/image?timeframe=5m&from=2025-12-26T17%3A26%3A16.282Z&to=2025-12-26T21%3A26%3A16.282Z&layers=candles%2Csma%3A20%2Cema%3A20%2Cbb%3A20%3A2%2Cvwap%2Cvolume&width=1200&height=800&expires=1782336376&userId=uakn2PdwRJzHyFRFzmXcgkZ7tNmTMjvP&sig=WSipQ_URJkWAyWwWq2g-kfvMmrt1RJKBDojeF9ZoX5o)

**24-Hour Chart (15-minute candles):**
![24h Chart](https://replay-lab-delta.preview.recall.network/api/charts/COINBASE_SPOT_ETH_USD/image?timeframe=15m&from=2025-12-25T21%3A26%3A16.282Z&to=2025-12-26T21%3A26%3A16.282Z&layers=candles%2Csma%3A20%2Cema%3A20%2Cbb%3A20%3A2%2Cvwap%2Cvolume&width=1200&height=800&expires=1782336376&userId=uakn2PdwRJzHyFRFzmXcgkZ7tNmTMjvP&sig=I5ianPjsAVDUOrfrZouGDIxEoiJKB4dZ6xMDVzBAZZM)

## Scoring Metrics

| Metric | Description | Range |
|--------|-------------|-------|
| **Brier Score** | Mean squared error of probabilities | 0 (perfect) to 1 (worst) |
| **Log Loss** | Cross-entropy loss | 0 (perfect) to +inf |
| **Accuracy** | Correct predictions at 0.5 threshold | 0 to 1 |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     pnpm benchmark                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │     Clock State           │
              │  (simulation time mgmt)   │
              └─────────────┬─────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  Replay Lab   │  │  Replay Lab   │  │  Replay Lab   │
│  Charts API   │  │  Replay API   │  │ Annotations   │
│  (signed URLs)│  │  (orderbook)  │  │ (ground truth)│
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │       Forecaster        │
              │  ┌───────────────────┐  │
              │  │ Chart Images (2x) │  │  ← 4h/5m + 24h/15m
              │  │ Orderbook Data    │  │
              │  │ Full Indicators   │  │
              │  └───────────────────┘  │
              └───────────┬─────────────┘
                          │
                          ▼
              ┌─────────────────────────┐
              │    Forecast Scorer      │
              │  • Brier Score          │
              │  • Log Loss             │
              │  • Accuracy @ 0.5       │
              └─────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `src/benchmark.ts` | CLI benchmark entry point |
| `src/forecaster.ts` | Forecaster agent definition + output schema |
| `src/clock-state.ts` | Simulation time management |
| `src/replay-lab/client.ts` | Replay Lab API client |
| `src/replay-lab/charts.ts` | Chart URL signing |
| `src/replay-lab/orderbook.ts` | Orderbook data fetching |
| `src/replay-lab/annotations.ts` | Ground truth fetching |
| `src/scorers/` | Brier, log loss, accuracy scorers |

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

## Example Output

```
agent_003 Benchmark - Market Forecaster
=======================================

Round 1/3 - 2025-12-22T14:00:00.000Z
Prediction:
  dump-simple-15m-1pct: 0.15
  dump-simple-15m-3pct: 0.08
  dump-simple-15m-5pct: 0.03
  ...
Scores:
  Brier: 0.12
  LogLoss: 0.38
  Accuracy: 0.78

Round 2/3 - 2025-12-22T15:00:00.000Z
...

Summary:
  Avg Brier: 0.14
  Avg LogLoss: 0.42
  Avg Accuracy: 0.72
```

## When to Use This Pattern

- Probability forecasting with ground truth validation
- Multi-output predictions with constraint validation
- Integrating external data sources (charts, orderbooks)
- Time-series simulation with clock management
- Comprehensive scoring with multiple metrics
