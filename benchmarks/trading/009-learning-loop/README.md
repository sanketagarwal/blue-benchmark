# 009: In-Context Learning Benchmark

## Overview

Tests whether vision LLMs can **learn from feedback** and improve their chart analysis accuracy through in-context learning.

Extends **007 (Chart Reader)** with:
- Multi-round feedback loops
- Similar chart matching for transfer learning tests
- PostgreSQL logging for analysis
- Langfuse tracing for LLM observability

---

## What We're Testing

After showing a model its mistakes on a chart analysis, can it:

1. **Memorization Test**: Get it right when shown the *exact same chart* again
2. **Transfer Test**: Get it right on *similar charts* with the same pattern conditions
3. **Learning Curve**: Improve accuracy over multiple rounds

---

## Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      009 IN-CONTEXT LEARNING                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ROUND 1: Baseline Analysis (No Context)                                    │
│  ┌─────────────────┐                                                        │
│  │ Chart A (4h)    │  → Model analyzes → Score vs Ground Truth              │
│  │ Pattern: X      │     (6 fields)      (Baseline Accuracy)                │
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
│  │ Chart A (4h)    │  → Model analyzes with feedback context                │
│  │ EXACT SAME      │     Question: Did model learn specific corrections?    │
│  └─────────────────┘                                                        │
│                                                                             │
│  ROUND 3+: Similar Charts (Transfer Test)                                   │
│  ┌─────────────────┐                                                        │
│  │ Chart B (4h)    │  → Model analyzes → Compare to Baseline                │
│  │ Same Pattern: X │     Question: Can model generalize the learning?       │
│  └─────────────────┘                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Innovation: Similar Chart Matching

Instead of just testing on the same chart or a different timeframe, we find **structurally similar charts** from different time periods:

| Field | Original Chart | Similar Chart |
|-------|----------------|---------------|
| uptrend_pullback_to_vwap | true | true |
| volatility_direction_combo | high_vol_bullish | high_vol_bullish |
| tested_and_held_support | false | false |
| overall_bias | mildly_bullish | mildly_bullish |

This tests whether the model learned the **concept** or just memorized the visual.

---

## Metrics

| Metric | Formula | What It Tells Us |
|--------|---------|------------------|
| `baseline_accuracy` | Round 1 score | Initial capability |
| `memorization_delta` | Round 2 - Round 1 | Can apply specific feedback? |
| `transfer_delta` | Avg(Similar) - Round 1 | Can generalize learning? |
| `learning_curve` | Accuracy over rounds | Learning trajectory |

### Interpretation

| Scenario | Memorization | Transfer | Interpretation |
|----------|--------------|----------|----------------|
| ✅ Strong ICL | +15%+ | +10%+ | Model learns and generalizes |
| ⚠️ Memorization only | +15%+ | <5% | Model pattern-matches visually |
| ⚠️ Weak ICL | +5-15% | +3-8% | Limited learning capacity |
| ❌ No ICL | <5% | <3% | Feedback is ignored |

---

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL running locally
- API keys for:
  - [Vercel AI Gateway](https://vercel.com/ai-gateway)
  - [Replay Labs](https://replay-lab-delta.preview.recall.network)
  - [Langfuse](https://langfuse.com) (optional, for tracing)

### Installation

```bash
cd benchmarks/trading/009-learning-loop

# Install dependencies
pnpm install

# Copy and configure environment
cp env.example .env.local
# Edit .env.local with your API keys
```

### Database Setup

```bash
# Create the database
createdb icl_benchmark_009

# Push schema
pnpm db:push
```

### Running the Benchmark

```bash
# Quick test (1 model, 1 frame)
pnpm icl:quick

# Single model test
pnpm icl --model=google/gemini-2.0-flash

# Test cheap models (3 budget-friendly models)
pnpm icl --cheap

# Test expensive models (3 frontier models)
pnpm icl --expensive

# Skip database logging
pnpm icl --quick --skip-db

# Verbose output
pnpm icl --quick --verbose
```

---

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `AI_GATEWAY_BASE_URL` | Vercel AI Gateway endpoint | Yes |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key | Yes |
| `REPLAY_LAB_BASE_URL` | Replay Labs API endpoint | Yes |
| `REPLAY_LAB_API_KEY` | Replay Labs API key | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes* |
| `LANGFUSE_SECRET_KEY` | Langfuse secret key | No |
| `LANGFUSE_PUBLIC_KEY` | Langfuse public key | No |
| `SYMBOL_ID` | Trading symbol (default: COINBASE_SPOT_BTC_USD) | No |

*Use `--skip-db` to run without database

### Models

**Cheap models** (fast, ~$0.10-0.15/M tokens):
- `google/gemini-2.5-flash-lite`
- `google/gemini-2.0-flash`
- `openai/gpt-4o-mini`

**Expensive models** (slower, ~$5-25/M tokens):
- `anthropic/claude-opus-4-5`
- `openai/gpt-5`
- `google/gemini-3-pro-preview`

---

## Output Files

```
BENCHMARK_ICL_<models>_<date>.md     # Human-readable results
BENCHMARK_ICL_<models>_<date>.json   # Machine-readable results
```

### Database Tables

- `learning_sessions` - Session-level metrics
- `learning_rounds` - Per-round results
- `similar_charts` - Cached chart conditions (for future use)
- `learning_curves` - Aggregated learning progression

---

## Architecture

```
src/
├── icl-benchmark.ts      # Main entry point
├── icl-loop.ts           # Core ICL loop with conversation management
├── similar-charts.ts     # Find charts with matching conditions
├── tracing.ts            # Langfuse integration
├── feedback.ts           # Generate detailed feedback
├── db/
│   ├── client.ts         # PostgreSQL client
│   └── schema.ts         # Drizzle schema
├── ground-truth/         # From 007 - compute ground truth
├── scorers/              # From 007 - score predictions
├── replay-lab/           # Replay Labs API integration
├── output-schema.ts      # Zod schema for model output
├── matrix.ts             # Model configuration
└── models.json           # Full model catalog
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

## Expected Results

Based on preliminary testing:

| Model | Baseline | Memorization Δ | Transfer Δ |
|-------|----------|----------------|------------|
| gemini-2.0-flash | ~65% | +10-15% | +5-8% |
| gpt-4o-mini | ~60% | +8-12% | +3-5% |
| claude-opus-4-5 | ~75% | +15-20% | +10-12% |

*Results vary by chart conditions and may improve with model updates.*

---

## Langfuse Dashboard

View traces at: https://cloud.langfuse.com

Each session creates:
- **Trace per round**: `icl_baseline`, `icl_same_chart`, `icl_similar_chart`
- **Generation spans**: Model calls with latency, tokens, accuracy
- **Accuracy spans**: Field-by-field scoring

---

## Research Questions

1. **Do models learn at all?** Compare memorization delta across models
2. **Memorization vs Understanding**: High memorization + low transfer = visual pattern matching
3. **Which fields are easiest to learn?** Simple booleans vs complex enums
4. **Model size vs learning capacity**: Do larger models learn better?
5. **Feedback quality**: Does more detailed feedback improve learning?

---

## Contributing

See `AGENTS.md` for development guidelines.

## License

MIT
