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

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     POST /api/play                          │
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
              │  • Monotonicity Check   │
              │  • Accuracy @ 0.5       │
              └─────────────────────────┘
```

## Chart Analysis

The forecaster receives two signed chart URLs with full technical indicators:

| Chart | Lookback | Timeframe | Purpose |
|-------|----------|-----------|---------|
| 4h/5m | 4 hours | 5-minute candles | Short-term momentum |
| 24h/15m | 24 hours | 15-minute candles | Medium-term trend |

**Indicators included**: SMA(20), EMA(20), Bollinger Bands(20,2), VWAP, SuperTrend(10,3), RSI(14), MACD(12,26,9), Stochastic RSI(14,3,3), ADX(14), CMF(20), Choppiness(14), Volume, Volume Ratio(20)

## Scoring Metrics

| Metric | Description | Range |
|--------|-------------|-------|
| **Brier Score** | Mean squared error of probabilities | 0 (perfect) to 1 (worst) |
| **Log Loss** | Cross-entropy loss | 0 (perfect) to +∞ |
| **Accuracy** | Correct predictions at 0.5 threshold | 0 to 1 |
| **Monotonicity Violations** | Logical constraint violations | 0 (none) to N |

**Monotonicity Constraints** - predictions must respect:
- Larger drops less likely: P(5%) ≤ P(3%) ≤ P(1%)
- Longer horizons more likely: P(15m) ≤ P(1h) for same magnitude

## Replay Lab Integration

Uses three Replay Lab API endpoints:

```
# Signed chart URLs (2 requests)
POST /api/signed-url
  → https://replay-lab-delta.preview.recall.network/api/charts/{symbol}/image?...

# Orderbook snapshot (1 request with nearest=true)
GET /api/replay/{symbol}?from=...&to=...&nearest=true

# Ground truth annotations (1 batch request)
GET /api/annotations/{symbol}?sources=contract1,contract2,...&from=...&to=...
```

## Files

| File | Purpose |
|------|---------|
| `src/forecaster.ts` | Forecaster agent definition + output schema |
| `src/clock-state.ts` | Simulation time management |
| `src/replay-lab/client.ts` | Replay Lab API client |
| `src/replay-lab/charts.ts` | Chart URL signing |
| `src/replay-lab/orderbook.ts` | Orderbook data fetching |
| `src/replay-lab/annotations.ts` | Ground truth fetching |
| `src/scorers/` | Brier, log loss, monotonicity, aggregate scorers |
| `src/app/api/play/route.ts` | Round orchestration |
| `src/app/api/debug/route.ts` | Clock state + message history |

## Environment Variables

```bash
REPLAY_LAB_API_KEY=rn_...
REPLAY_LAB_BASE_URL=https://replay-lab-delta.preview.recall.network
SIMULATION_START_TIME=2025-12-22T14:00:00Z
SYMBOL_ID=COINBASE_SPOT_ETH_USD
```

## Usage

```bash
pnpm dev --filter=agent_003

# Run a forecast round
curl -X POST http://localhost:3004/api/play

# Reset clock to start time
curl -X DELETE http://localhost:3004/api/debug

# View current state
curl http://localhost:3004/api/debug
```

## Example Response

```json
{
  "success": true,
  "roundNumber": 0,
  "simulationTime": "2025-12-22T14:00:00.000Z",
  "symbolId": "COINBASE_SPOT_ETH_USD",
  "chartUrls": {
    "chart4h5m": "https://replay-lab-delta.preview.recall.network/api/charts/...",
    "chart24h15m": "https://replay-lab-delta.preview.recall.network/api/charts/..."
  },
  "predictions": {
    "dump-simple-15m-1pct": 0.15,
    "dump-simple-15m-3pct": 0.08,
    "dump-simple-15m-5pct": 0.03,
    "dump-simple-1h-0.5pct": 0.25,
    "dump-simple-1h-1pct": 0.18,
    "dump-vol-adjusted-15m-z2": 0.05,
    "dump-vol-adjusted-1h-z2": 0.12,
    "dump-drawdown-1pct": 0.20,
    "dump-drawdown-3pct": 0.08
  },
  "reasoning": "RSI showing oversold conditions with bullish divergence...",
  "groundTruth": {
    "dump-simple-15m-1pct": false,
    "dump-simple-15m-3pct": false,
    "...": "..."
  }
}
```

## When to Use This Pattern

- Probability forecasting with ground truth validation
- Multi-output predictions with logical constraints
- Integrating external data sources (charts, orderbooks)
- Time-series simulation with clock management
- Comprehensive scoring with multiple metrics
