# agent_004: Model Matrix Forecaster

A benchmark tool that runs multiple LLM models in parallel on the same forecasting scenario, comparing their performance.

## What It Does

Runs the same forecasting task across a matrix of models:
- `xai/grok-4-fast-reasoning`
- `anthropic/claude-haiku-4.5`
- `openai/gpt-5-nano`

Each model maintains its own isolated agent (separate message history, compaction). After 3 rounds, a comparison table shows which model performed best.

## Usage

Run the benchmark with:

```bash
cd apps/agent_004
pnpm benchmark
```

## Chart Analysis

Each model receives the same two signed chart URLs with full technical indicators:

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
              │       Matrix Config       │
              │   [model1, model2, ...]   │
              └─────────────┬─────────────┘
                            │
              ┌─────────────┴─────────────┐
              │     For each round:       │
              │   1. Fetch data once      │
              │   2. Run all models       │
              │   3. Score all models     │
              │   4. Advance clock        │
              └─────────────┬─────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   Model A     │  │   Model B     │  │   Model C     │
│  (isolated)   │  │  (isolated)   │  │  (isolated)   │
└───────────────┘  └───────────────┘  └───────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │   Comparison Table      │
              │   (winner highlighted)  │
              └─────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `src/benchmark.ts` | CLI benchmark entry point |
| `src/matrix.ts` | Model matrix configuration |
| `src/forecaster.ts` | Forecaster factory (creates per-model agents) |
| `src/clock-state.ts` | Simulation time management |
| `src/results.ts` | Result aggregation |
| `src/table.ts` | ASCII table formatting |
| `src/replay-lab/` | Replay Lab API clients |
| `src/scorers/` | Brier, log loss, accuracy scorers |

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

Note: `MODEL_ID` is not needed - the matrix defines all models.

## Example Output

```
agent_004 Matrix Benchmark - Model Comparison
=============================================

Round 1/3 - 2025-12-22T14:00:00.000Z

  xai/grok-4-fast-reasoning:
    dump-simple-15m-1pct: 0.15
    ...
    Brier: 0.12, LogLoss: 0.38, Accuracy: 0.78

  anthropic/claude-haiku-4.5:
    dump-simple-15m-1pct: 0.18
    ...
    Brier: 0.14, LogLoss: 0.41, Accuracy: 0.72

  openai/gpt-5-nano:
    dump-simple-15m-1pct: 0.12
    ...
    Brier: 0.11, LogLoss: 0.35, Accuracy: 0.81

...

┌────────────────────────────┬─────────┬─────────┬──────────┐
│           Model            │  Brier  │ LogLoss │ Accuracy │
├────────────────────────────┼─────────┼─────────┼──────────┤
│ xai/grok-4-fast-reasoning  │  0.132  │  0.401  │  0.741   │
│ anthropic/claude-haiku-4.5 │  0.145  │  0.428  │  0.704   │
│ openai/gpt-5-nano       *  │  0.118  │  0.362  │  0.796   │
└────────────────────────────┴─────────┴─────────┴──────────┘
* Winner (lowest Brier score)
```

## When to Use This Pattern

- Comparing multiple models on identical tasks
- A/B testing LLM providers
- Finding the best model for a specific use case
- Benchmarking cost vs. performance tradeoffs
