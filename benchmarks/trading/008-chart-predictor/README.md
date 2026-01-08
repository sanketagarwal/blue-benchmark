# 008 Chart Predictor Benchmark

**Test vision LLMs' ability to PREDICT future chart patterns from current market state.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

Models see a chart at time **T** and predict what the patterns will be at time **T+1**. We validate predictions against actual data from Replay Labs.

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   Chart at T    │    →    │ Model Predicts  │    →    │ Validate vs T+1 │
│   (input)       │         │ T+1 Patterns    │         │ Ground Truth    │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

## The Core Question

**Can models extrapolate market behavior from visual chart patterns?**

This is fundamentally different from **007 Chart Reader** which tests observation:

| Benchmark | Question | Skill Level |
|-----------|----------|-------------|
| 007 Chart Reader | What do you see NOW? | Perception + Synthesis |
| **008 Chart Predictor** | What will happen NEXT? | **Temporal Reasoning** |

---

## What We're Predicting

We reuse the **same 6 fields from 007** — but models predict values for the NEXT time period:

| Field | Current Chart (007) | Next Chart (008) |
|-------|---------------------|------------------|
| `uptrend_pullback_to_vwap` | Is it happening now? | **Will it happen next?** |
| `volatility_direction_combo` | What is it now? | **What will it be?** |
| `tested_and_held_support` | Did it just happen? | **Will it happen?** |
| `breakout_with_volume` | Is there a breakout? | **Will there be one?** |
| `potential_reversal_at_support` | Is reversal forming? | **Will reversal form?** |
| `overall_bias` | Current bias | **Next period's bias** |

---

## Base Prompt

### System Prompt

```
You are an expert technical analyst making PREDICTIONS about future chart patterns.

Your task is to analyze the CURRENT chart and PREDICT what the patterns will be 
in the NEXT time period.

This requires:
1. Understanding current trend direction and momentum
2. Identifying where price is relative to key indicators (VWAP, Bollinger Bands)
3. Recognizing pattern formations that suggest future moves
4. Extrapolating likely outcomes based on technical analysis

Think step by step. Base your predictions on what the current chart suggests will happen next.
Return ONLY valid JSON matching the schema.
```

### Round Prompt (sent with each chart image)

```
You are viewing a {timeframe} candlestick chart for {symbolId}.
The chart shows the last {candlesVisible} candles.
Current time: {currentTime}

**YOUR TASK: PREDICT what will happen in the NEXT {predictionHorizon}**

The chart shows:
- Candlesticks (green = bullish, red = bearish)
- VWAP (Volume Weighted Average Price) - purple line
- Bollinger Bands (upper, middle, lower) - blue bands
- SMA(20) and EMA(20)
- Volume bars at bottom

Based on what you see NOW, predict what will happen NEXT:

1. **uptrend_pullback_to_vwap** (boolean)
   - Look at current trend: Is it bullish? Is it losing momentum?
   - Where is price relative to VWAP now?
   - PREDICT: In the next {predictionHorizon}, will price be in an uptrend AND pulling back to VWAP?

2. **volatility_direction_combo** (enum)
   - Current volatility: Large or small candles?
   - Current direction: Trending up, down, or sideways?
   - PREDICT: What will the volatility + direction combination be in the next period?
   - Options: high_vol_bullish, high_vol_bearish, low_vol_drift_up, low_vol_drift_down, consolidation

3. **tested_and_held_support** (boolean)
   - Is price approaching lower Bollinger Band or support?
   - Is there buying pressure (volume, wick rejections)?
   - PREDICT: Will price test support AND hold (bounce) in the next period?

4. **breakout_with_volume** (boolean)
   - Is price approaching upper Bollinger Band or resistance?
   - Is volume building up?
   - PREDICT: Will price break above resistance WITH above-average volume?

5. **potential_reversal_at_support** (boolean)
   - Is price at or near a support level?
   - Are there signs of reversal forming (hammer, engulfing)?
   - PREDICT: Will a bullish reversal pattern form at support?

6. **overall_bias** (enum)
   - Count current bullish signals vs bearish signals
   - Consider momentum and trend strength
   - PREDICT: What will the overall market bias be?
   - Options: strongly_bullish, mildly_bullish, neutral, mildly_bearish, strongly_bearish

Also provide:
- **meta**: Read base_quote, venue, timeframe from chart title
- **active_readout**: Current OHLC values (from info ribbon)

Return ONLY valid JSON. Do not include commentary.
```

**+ Chart image** is sent as a multimodal `image` part alongside the text prompt.

---

## Test Matrix

### Vary Chart Length (How Much History Model Sees)

| Length | Candles Visible | Tests |
|--------|-----------------|-------|
| Short | 20 candles | Can model predict with minimal context? |
| Medium | 50 candles | Standard context |
| Long | 100 candles | Does more history help predictions? |

### Vary Timeframe (Prediction Horizon)

| Timeframe | Prediction Horizon | Tests |
|-----------|-------------------|-------|
| 5m | Next 5 minutes | Short-term prediction |
| 15m | Next 15 minutes | Medium-term |
| 1h | Next 1 hour | Longer-term |
| 4h | Next 4 hours | Strategic prediction |

### Full Matrix

**Quick Mode:** 1 length × 2 timeframes × 1 sample = **2 frames**  
**Full Mode:** 3 lengths × 4 timeframes × 2 samples = **24 frames per model**

---

## Data Pipeline

```
For each test case:

1. Pick timestamp T
2. Fetch chart image at T (with N candles of history)
3. Fetch OHLCV data for T+1 period
4. Compute ground truth using 007's logic on T+1 data
5. Show model chart at T, ask for T+1 predictions
6. Score prediction against ground truth
```

### Ground Truth Computation

Ground truth for T+1 is computed the **exact same way** as 007:

- **Bollinger Bands**: 20-period SMA ± 2 standard deviations (at T+1)
- **VWAP**: Cumulative (Typical Price × Volume) / Cumulative Volume (at T+1)
- **Trend**: Price change over last 10 candles (ending at T+1)
- **Volatility**: Average candle range as % of price (at T+1)
- **Support Test**: Candle wicked below lower BB but closed above (at T+1)
- **Breakout**: Broke above upper BB with volume >120% of average (at T+1)

---

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL running locally
- API keys for [Vercel AI Gateway](https://vercel.com/ai-gateway) and [Replay Labs](https://replay-lab-delta.preview.recall.network)

### Installation

```bash
# From the monorepo root
git clone https://github.com/sanketagarwal/blue-benchmark.git
cd blue-benchmark

# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Navigate to the benchmark
cd benchmarks/trading/008-chart-predictor
```

### Configuration

Create a `.env.local` file:

```bash
# Database (local postgres)
DATABASE_URL=postgresql://localhost:5432/nullagent_008

# AI Gateway
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
AI_GATEWAY_API_KEY=your-ai-gateway-key

# Replay Lab API (for chart images and OHLCV data)
REPLAY_LAB_BASE_URL=https://replay-lab-delta.preview.recall.network
REPLAY_LAB_API_KEY=your-replay-lab-key

# Benchmark defaults
SYMBOL_ID=COINBASE_SPOT_BTC_USD
SIMULATION_START_TIME=2025-12-20T12:00:00Z
```

### Database Setup

```bash
# Create the database
createdb nullagent_008

# Run migrations (from monorepo root)
cd packages/database
pnpm drizzle-kit push

# Return to benchmark directory
cd ../../benchmarks/trading/008-chart-predictor
```

### Running the Benchmark

```bash
# Run with CHEAP models (fast)
# Models: gemini-2.5-flash-lite, gemini-2.0-flash, gpt-4o-mini
pnpm benchmark --cheap --quick

# Run with EXPENSIVE models (slower)
# Models: claude-opus-4-5, gpt-5, gemini-3-pro-preview
pnpm benchmark --expensive --quick

# Full run (all configurations)
pnpm benchmark --cheap

# Debug mode (shows full input/output for each prediction)
pnpm benchmark --cheap --quick --debug

# Single model test
pnpm benchmark --model=google/gemini-2.5-flash-lite --quick --debug
```

### CLI Options

| Flag | Description |
|------|-------------|
| `--cheap` | Use 3 budget-friendly models |
| `--expensive` | Use 3 frontier models |
| `--quick` | Minimal test matrix (2 frames) |
| `--verbose` | Show accuracy scores for each frame |
| `--debug` | Full input/output logging |
| `--model=ID` | Test a single model by ID |

---

## Expected Insights

| Question | How We Answer It |
|----------|------------------|
| Can models predict short-term price action? | Compare accuracy across timeframes |
| Does more history help predictions? | Compare 20 vs 50 vs 100 candle charts |
| Which patterns are most predictable? | Per-field accuracy breakdown |
| Do expensive models predict better? | Cheap vs expensive comparison |
| Is prediction harder than observation? | Compare 008 accuracy to 007 accuracy |

---

## Success Metrics

| Metric | Random Baseline | Target |
|--------|-----------------|--------|
| Boolean fields (4 fields) | 50% | >55% |
| Enum fields (2 fields) | 20-33% | >35% |
| Overall accuracy | ~40% | >50% |

*Note: Prediction is inherently harder than observation, so targets are lower than 007.*

---

## Architecture

```
src/
├── benchmark.ts          # Main CLI with length/timeframe matrix
├── chart-predictor.ts    # Agent definition (prediction prompt)
├── output-schema.ts      # Same 6 fields as 007
├── matrix.ts             # Model configuration (cheap/expensive)
├── models.json           # Full model catalog with costs
├── ground-truth/
│   └── index.ts          # Compute ground truth from T+1 OHLCV
├── scorers/
│   └── index.ts          # Score predictions vs ground truth
├── replay-lab/
│   ├── charts.ts         # Fetch signed chart URLs
│   ├── ohlcv.ts          # Fetch candle data
│   └── client.ts         # API client
└── results-writer.ts     # Generate MD/JSON output
```

---

## Relationship to 007

| Component | 007 Chart Reader | 008 Chart Predictor |
|-----------|------------------|---------------------|
| `output-schema.ts` | Same | **Same** (reused) |
| `ground-truth/index.ts` | Computes from T data | **Same logic**, applied to T+1 |
| `scorers/index.ts` | Same | **Same** (reused) |
| `replay-lab/*.ts` | Same | **Same** (reused) |
| `matrix.ts` | Same | **Same** (reused) |
| **Prompt** | "What do you see?" | **"What will happen next?"** |
| **Input** | Chart at T | Chart at T |
| **Output** | Patterns at T | **Patterns at T+1** |

---

## Sample Results

```
📊 Summary
==========

google/gemini-2.5-flash-lite:
  Frames: 24 success, 0 failed
  Avg Prediction Accuracy: 52.3%
  Avg Exact Matches: 3.1/6

openai/gpt-4o-mini:
  Frames: 24 success, 0 failed
  Avg Prediction Accuracy: 48.6%
  Avg Exact Matches: 2.9/6


📈 Accuracy by Configuration
============================

20 candles visible:
  5m: 45.2% avg accuracy
  15m: 48.1% avg accuracy
  1h: 51.3% avg accuracy
  4h: 54.0% avg accuracy

50 candles visible:
  5m: 47.8% avg accuracy
  15m: 50.2% avg accuracy
  1h: 53.5% avg accuracy
  4h: 56.1% avg accuracy
```

---

## Future Extensions

1. **Sequence Prediction**: Show 3-4 charts in sequence, predict the 5th
2. **Confidence Calibration**: Ask models to rate their confidence
3. **Specific Price Targets**: Predict next candle's OHLC values
4. **Event Detection**: Predict if specific events (breakout, reversal) will occur

---

## Design Reference

Based on: https://gist.github.com/andrewxhill/cbde7d80e91b332f5d97085c9cfed8f0

## License

MIT

