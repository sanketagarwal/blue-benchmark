# 009: In-Context Learning Benchmark

## Overview

Tests whether vision LLMs can **learn from feedback** and improve their chart analysis accuracy through in-context learning.

Extends **007 (Chart Reader)** with:
- Multi-round feedback loops
- Fingerprint-based similar chart matching for transfer learning
- PostgreSQL logging (Vercel Postgres / Neon)
- Langfuse tracing for LLM observability

---

## What We're Testing

After showing a model its mistakes on a chart analysis, can it:

1. **Memorization Test**: Get it right when shown the *exact same chart* again
2. **Transfer Test**: Get it right on *similar charts* with matching indicator fingerprints
3. **Learning Curve**: Improve accuracy over multiple rounds

---

## Experimental Results (40+ Runs)

Using `google/gemini-2.0-flash` with varied start times and prompt strategies:

### Final Results (Prompt v4-reset-high-baseline)

| Baseline Level | Count | Avg Memorization | Avg Transfer |
|----------------|-------|------------------|--------------|
| **Low (<60%)** | 7 | **+40.0%** | **+18.3%** |
| **High (≥70%)** | 3 | **+19.4%** | **-27.8%** |

### Key Findings

1. ✅ **Strong Memorization**: All runs show positive memorization. Models consistently improve when re-shown the same chart after feedback.

2. 🔶 **Variable Transfer by Baseline**:
   - **Low baseline (33-60%)**: Strong positive transfer (+18.3% avg)
   - **High baseline (70%+)**: Negative transfer (-27.8% avg) - ceiling effect

3. 📉 **Ceiling Effect**: High initial accuracy means less room to improve. Feedback can cause "overthinking" and introduce **new errors** on similar charts.

4. 🔄 **Reset Conversation Doesn't Help**: Even with fresh conversation history (no prior context), high-baseline models still introduce new errors. The problem isn't memory contamination - it's inherent model variance across charts.

### Prompt Experiments

| Version | Strategy | High Baseline Transfer | Low Baseline Transfer |
|---------|----------|------------------------|----------------------|
| v1 | Original | -32% | +18% |
| v2 | "Different chart" warning | -22% | +17% |
| v3 | Confidence retention | -20.8% | +19.5% |
| **v4** | **Reset conversation (≥70%)** | **-27.8%** | **+18.3%** |

**Insight**: The problem isn't the prompt or conversation history. "Similar" charts by fingerprint may have genuinely different correct answers. Transfer learning on similar charts measures **chart similarity**, not learning capacity.

---

## Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      009 IN-CONTEXT LEARNING                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ROUND 1: Baseline Analysis (No Context)                                    │
│  ┌─────────────────┐                                                        │
│  │ Chart A (1m)    │  → Model analyzes → Score vs Ground Truth              │
│  │ 30 candles      │     (6 fields)      (Baseline Accuracy)                │
│  └─────────────────┘                                                        │
│                                                                             │
│  FEEDBACK: Detailed explanation of mistakes                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ "You predicted uptrend_pullback_to_vwap = true                      │   │
│  │  But the actual answer is FALSE because:                            │   │
│  │  - VWAP was at $94,250                                              │   │
│  │  - Price closed at $95,100                                          │   │
│  │  - Distance: 0.9% (threshold is 0.3%)"                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ROUND 2: Same Chart (Memorization Test)                                    │
│  ┌─────────────────┐                                                        │
│  │ Chart A (1m)    │  → Model analyzes with feedback context                │
│  │ EXACT SAME      │     Question: Did model learn specific corrections?    │
│  └─────────────────┘                                                        │
│                                                                             │
│  ROUND 3+: Similar Charts (Transfer Test)                                   │
│  ┌─────────────────┐                                                        │
│  │ Chart B (1m)    │  → Model analyzes → Compare to Baseline                │
│  │ Same Fingerprint│     Question: Can model generalize the learning?       │
│  └─────────────────┘                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Similar Chart Matching: Indicator Fingerprinting

We use a **10-field fingerprint** to find charts with similar market conditions:

| Field | Values | Source |
|-------|--------|--------|
| `rsi` | oversold / neutral / overbought | Replay Labs RSI |
| `trend` | bullish / bearish / neutral | SuperTrend or price action |
| `volatility` | compressed / normal / expanded | BBW indicator |
| `momentum` | bullish / bearish / neutral | MACD histogram |
| `priceVsVwap` | above / at / below | VWAP comparison |
| `regime` | trending_up / trending_down / ranging / volatile | Replay Labs annotations |
| `hasRecentSupport` | boolean | Local extrema (bottoms) |
| `hasRecentResistance` | boolean | Local extrema (tops) |
| `priceNearHigh` | boolean | Within 2% of chart high |
| `priceNearLow` | boolean | Within 2% of chart low |

**Similarity Score**: Charts with ≥6 matching fields are considered "similar".

---

## Metrics

| Metric | Formula | What It Tells Us |
|--------|---------|------------------|
| `baseline_accuracy` | Round 1 score | Initial capability |
| `memorization_delta` | Round 2 - Round 1 | Can apply specific feedback? |
| `transfer_delta` | Avg(Similar) - Round 1 | Can generalize learning? |

### Interpretation

| Scenario | Memorization | Transfer | Interpretation |
|----------|--------------|----------|----------------|
| ✅ Strong ICL | +30%+ | +10%+ | Model learns and generalizes |
| ⚠️ Memorization only | +30%+ | <5% | Model pattern-matches visually |
| ⚠️ Weak ICL | +10-30% | +3-8% | Limited learning capacity |
| ❌ No ICL | <10% | <3% | Feedback is ignored |

---

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- API keys for:
  - [Vercel AI Gateway](https://vercel.com/ai-gateway)
  - [Replay Labs](https://replay-lab-delta.preview.recall.network)
  - [Langfuse](https://langfuse.com) (optional, for tracing)
  - PostgreSQL (Vercel Postgres / Neon recommended)

### Installation

```bash
cd benchmarks/trading/009-learning-loop

# Install dependencies
pnpm install

# Copy and configure environment
cp env.example .env.local
# Edit .env.local with your API keys
```

### Environment Variables

```bash
# Required: Vercel AI Gateway
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
AI_GATEWAY_API_KEY=vck_your_key_here

# Required: Replay Labs (chart data)
REPLAY_LAB_BASE_URL=https://replay-lab-delta.preview.recall.network
REPLAY_LAB_API_KEY=rn_your_key_here

# Required: Database (Vercel Postgres / Neon)
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# Optional: Langfuse (tracing)
LANGFUSE_SECRET_KEY=sk-lf-your_key
LANGFUSE_PUBLIC_KEY=pk-lf-your_key
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# Optional: Symbol and time
SYMBOL_ID=COINBASE_SPOT_BTC_USD
SIMULATION_START_TIME=2025-12-20T12:00:00Z
```

### Database Setup

```bash
# Push schema to database
pnpm db:push
```

### Running the Benchmark

```bash
# Quick test (1 model, 1 timeframe, 2 similar charts)
pnpm icl:quick

# Single model with specific model
pnpm icl --quick --model=google/gemini-2.0-flash

# Test cheap models (3 budget-friendly models)
pnpm icl --cheap

# Test expensive models (3 frontier models)
pnpm icl --expensive

# Skip database logging
pnpm icl --quick --skip-db

# Verbose output
pnpm icl --quick --verbose
```

### Running Multiple Iterations

Run the benchmark multiple times with different start times to measure average learning:

```bash
# Run with different SIMULATION_START_TIME values
SIMULATION_START_TIME=2025-12-20T12:00:00Z pnpm icl:quick
SIMULATION_START_TIME=2025-12-19T09:15:00Z pnpm icl:quick
SIMULATION_START_TIME=2025-12-18T22:45:00Z pnpm icl:quick
# ... etc
```

---

## Output Files

```
BENCHMARK_ICL_<model>_<date>.md     # Human-readable results
BENCHMARK_ICL_<model>_<date>.json   # Machine-readable results
```

### Database Tables

- `learning_sessions` - Session-level metrics
- `learning_rounds` - Per-round results
- `similar_charts` - Cached chart conditions
- `learning_curves` - Aggregated learning progression

### Langfuse Prompt Tracking

Prompts are versioned and tracked in Langfuse for experiment comparison:

| Prompt Name | Description |
|-------------|-------------|
| `icl-baseline` | Initial chart analysis prompt |
| `icl-same-chart-feedback` | Re-analysis with feedback |
| `icl-similar-chart-low-baseline` | Field-specific focus for low accuracy |
| `icl-similar-chart-high-baseline` | Fresh analysis mode for high accuracy |

Each generation logs:
- `promptName` - Which prompt template was used
- `promptVersion` - e.g., `v4-reset-high-baseline`
- `resetConversation` - Whether conversation was cleared

---

## Architecture

```
src/
├── icl-benchmark.ts      # Main entry point
├── icl-loop.ts           # Core ICL loop with conversation management
├── similar-charts.ts     # Fingerprint-based chart matching
├── fingerprint.ts        # Chart fingerprint creation & comparison
├── tracing.ts            # Langfuse integration
├── db/
│   ├── client.ts         # Neon/Postgres client (Drizzle ORM)
│   └── schema.ts         # Database schema
├── ground-truth/         # From 007 - compute ground truth
├── scorers/              # From 007 - score predictions
├── replay-lab/           # Replay Labs API integration
│   ├── charts.ts         # Chart image URLs
│   ├── ohlcv.ts          # Candle data
│   ├── indicators.ts     # RSI, MACD, BBW, etc.
│   └── annotations.ts    # Local extrema, regimes
├── output-schema.ts      # Zod schema for model output
└── models.json           # Model catalog
```

---

## Conversation State Management

**CRITICAL**: The benchmark uses proper conversation state (array of messages), not string concatenation.

### ✅ Correct: Array of Messages

```typescript
const messages: Message[] = [
  { role: 'system', content: 'You are a chart analyst...' },
  { role: 'user', content: [{ type: 'image', image: chartUrl }, ...] },
  { role: 'assistant', content: round1Response },
  { role: 'user', content: feedback + newChartPrompt },
];

await generateObject({ model, schema, messages });
```

### ❌ Wrong: String Concatenation

```typescript
// DON'T DO THIS - loses role boundaries
const prompt = `Previous: ${response}\nFeedback: ${feedback}\nNow analyze...`;
```

---

## Data Availability (Replay Labs)

| Timeframe | Data Range | Notes |
|-----------|------------|-------|
| **1m** | ✅ Full (weeks) | Best for benchmark |
| 5m | ✅ Full | Good alternative |
| 15m | ⚠️ Limited | ~2 hours cached |
| 1h | ⚠️ Limited | ~2 hours cached |
| 4h | ⚠️ Very limited | Recent days only |
| 1d | ❌ None | JIT budget exceeded |

**Recommendation**: Use **1m timeframe** for most complete data coverage.

---

## Research Questions

1. **Do models learn at all?** Compare memorization delta across models
2. **Memorization vs Understanding**: High memorization + low transfer = visual pattern matching
3. **Which fields are easiest to learn?** Simple booleans vs complex enums
4. **Model size vs learning capacity**: Do larger models learn better?
5. **Ceiling effects**: Does high baseline accuracy limit improvement?
6. **Fingerprint sensitivity**: How many fields should match for "similar" charts?

---

## Contributing

See `AGENTS.md` for development guidelines.

## License

MIT
