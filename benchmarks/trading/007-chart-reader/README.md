# 007 Chart Reader Benchmark

**Test vision LLMs' ability to identify chart patterns from candlestick images, validated against raw OHLCV data.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

This benchmark evaluates whether vision models can accurately read and interpret financial charts by:

1. **Showing models a candlestick chart image** with indicators (VWAP, Bollinger Bands, Volume)
2. **Asking models to identify patterns** (trends, support/resistance, breakouts, reversals)
3. **Comparing predictions against ground truth** computed from raw OHLCV data

```
Chart Image → Model Prediction → Compare to Raw OHLCV → Accuracy Score
     ↑                                    ↑
  (visual)                         (deterministic ground truth)
```

## The 3 Levels of Visual Understanding

We test a **progressive hierarchy** of chart comprehension skills:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  LEVEL 1: PERCEPTION                                                     │
│  "Can the model SEE the chart?"                                         │
│                                                                          │
│  • Extract OHLC values from the info ribbon                             │
│  • Identify which colored line is VWAP vs Bollinger Band                │
│  • Read the timeframe and symbol from chart metadata                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LEVEL 2: SINGLE TREND ANALYSIS                                         │
│  "Can the model identify INDIVIDUAL patterns?"                          │
│                                                                          │
│  • Is price trending UP or DOWN? (trend direction)                      │
│  • Are candles LARGE or SMALL? (volatility assessment)                  │
│  • Did price TOUCH the lower Bollinger Band? (support test)             │
│  • Is volume ABOVE or BELOW average? (volume analysis)                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LEVEL 3: MULTI-TREND SYNTHESIS  ← THIS BENCHMARK TESTS THIS            │
│  "Can the model COMBINE multiple signals?"                              │
│                                                                          │
│  • Uptrend + near VWAP = pullback opportunity?                          │
│  • Support test + bullish candle = reversal forming?                    │
│  • Breakout + high volume = confirmed breakout?                         │
│  • Multiple bullish signals = overall bullish bias?                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why Level 3 is the Hardest

Each answer requires **combining 2+ independent observations**:

```
Field: uptrend_pullback_to_vwap
       ├── Observation A: Is there an uptrend? (analyze 10+ candles)
       └── Observation B: Is price near VWAP? (find purple line, compare)
       
       Answer = A AND B (both must be true)

Field: overall_bias
       ├── Count bullish signals (trend, VWAP, support, breakout, reversal)
       └── Count bearish signals
       
       Answer = Net score mapped to: strongly_bullish → strongly_bearish
```

## The 6 Test Fields

| Field | Signals Combined | What We're Testing |
|-------|------------------|-------------------|
| `uptrend_pullback_to_vwap` | Trend + VWAP | Can model see trend AND locate indicator? |
| `volatility_direction_combo` | Candle size + Direction | Can model assess two properties together? |
| `tested_and_held_support` | BB touch + Close location | Can model see test AND evaluate reaction? |
| `breakout_with_volume` | Price vs BB + Volume | Can model cross-reference two chart panels? |
| `potential_reversal_at_support` | Support + Candle pattern | Can model identify setup AND confirmation? |
| `overall_bias` | ALL of the above | Can model synthesize everything? |

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL running locally
- API keys for [Vercel AI Gateway](https://vercel.com/ai-gateway) and [Replay Labs](https://replay-lab-delta.preview.recall.network)

### Installation

```bash
# Clone the repo (includes 007-chart-reader benchmark)
git clone https://github.com/sanketagarwal/nullagent-benchmark.git
cd nullagent-benchmark

# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Navigate to the benchmark
cd benchmarks/trading/007-chart-reader
```

### Configuration

Create a `.env.local` file:

```bash
# Database (local postgres)
DATABASE_URL=postgresql://localhost:5432/nullagent_007

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
createdb nullagent_007

# Run migrations (from nullagent-tutorial monorepo root)
cd packages/database
pnpm drizzle-kit push

# Return to benchmark directory
cd ../../benchmarks/trading/007-chart-reader
```

### Running the Benchmark

```bash
# Run with CHEAP models (fast, ~$0.10/M tokens)
# Models: gemini-2.5-flash-lite, gemini-2.0-flash, gpt-4o-mini
pnpm benchmark --cheap --quick

# Run with EXPENSIVE models (slower, ~$15/M tokens)
# Models: claude-opus-4-5, gpt-5, gemini-3-pro-preview
pnpm benchmark --expensive --quick

# Full run (5 samples per timeframe instead of 2)
pnpm benchmark --cheap

# Debug mode (shows full input/output for each frame)
pnpm benchmark --cheap --quick --debug

# Single model test
pnpm benchmark --model=google/gemini-2.5-flash-lite --quick --debug
```

### CLI Options

| Flag | Description |
|------|-------------|
| `--cheap` | Use 3 budget-friendly models |
| `--expensive` | Use 3 frontier models |
| `--quick` | 2 samples per timeframe (default: 5) |
| `--verbose` | Show accuracy scores for each frame |
| `--debug` | Full input/output logging with chart URLs |
| `--model=ID` | Test a single model by ID |

## Output Files

After running, the benchmark generates:

```
BENCHMARK_<models>_<date>.md     # Human-readable results
BENCHMARK_<models>_<date>.json   # Machine-readable results
results_<models>/                # Per-frame JSON results
  └── <model_id>/
      ├── 15m_01.json
      ├── 15m_02.json
      ├── 1h_01.json
      └── ...
```

## Architecture

```
src/
├── benchmark.ts          # Main CLI entry point
├── chart-reader.ts       # Agent definition with multimodal prompt
├── output-schema.ts      # Zod schema for model output
├── matrix.ts             # Model configuration (cheap/expensive)
├── models.json           # Full model catalog with costs
├── ground-truth/
│   └── index.ts          # Compute ground truth from OHLCV
├── scorers/
│   └── index.ts          # Score predictions vs ground truth
├── replay-lab/
│   ├── charts.ts         # Fetch signed chart URLs
│   ├── ohlcv.ts          # Fetch candle data
│   └── client.ts         # API client
└── results-writer.ts     # Generate MD/JSON output
```

## Ground Truth Computation

Ground truth is **deterministic** — computed from raw OHLCV data, not visual inspection:

- **Bollinger Bands**: 20-period SMA ± 2 standard deviations
- **VWAP**: Cumulative (Typical Price × Volume) / Cumulative Volume
- **Trend**: >0.5% price change over last 10 candles = uptrend/downtrend
- **Volatility**: Average candle range as % of price (>1.5% = high, <0.8% = low)
- **Support Test**: Candle wicked below lower BB but closed above
- **Breakout**: Broke above upper BB with volume >120% of average

## Adding New Models

Edit `src/models.json` to add models, then update `src/matrix.ts`:

```typescript
const CHEAP_MODELS = [
  'google/gemini-2.5-flash-lite',
  'your/new-cheap-model',  // Add here
];
```

## Sample Results

```
📊 Summary
==========

google/gemini-2.5-flash-lite:
  Frames: 6 success, 0 failed
  Avg Accuracy: 72.2%
  Avg Exact Matches: 4.3/6

openai/gpt-4o-mini:
  Frames: 6 success, 0 failed
  Avg Accuracy: 69.4%
  Avg Exact Matches: 4.2/6
```

## Design Reference

Based on: https://gist.github.com/andrewxhill/cbde7d80e91b332f5d97085c9cfed8f0

## License

MIT
