# 009: Learning Loop Benchmark

## Overview

Tests whether vision LLMs can **learn from feedback** and improve their chart analysis.

Extends **007 (Chart Reader)** by adding a feedback loop.

---

## What We're Testing

After showing a model its mistakes on a chart analysis, can it:

1. **Same Chart Test**: Get it right when shown the *exact same chart* again
2. **Different Timeframe Test**: Get it right when shown *same time period, different candle size*
3. *(Future)* **Similar Chart Test**: Get it right on a structurally similar chart from different time

---

## Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           009 LEARNING LOOP                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ROUND 1: Initial Analysis                                                  │
│  ┌─────────────────┐                                                        │
│  │ Chart (4h)      │  → Model analyzes → Score vs Ground Truth              │
│  │ Time: T         │     (6 fields)      (Baseline Accuracy)                │
│  └─────────────────┘                                                        │
│                                                                             │
│  FEEDBACK: Show the model where it went wrong                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ "You predicted uptrend_pullback_to_vwap = true                      │   │
│  │  But the actual answer is FALSE because:                            │   │
│  │  - VWAP was at $94,250                                              │   │
│  │  - Price closed at $95,100                                          │   │
│  │  - Distance: 0.9% (threshold is 0.3%)"                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ROUND 2: Same Chart Re-test (Memorization)                                 │
│  ┌─────────────────┐                                                        │
│  │ Chart (4h)      │  → Model analyzes → Score → Compare to Baseline        │
│  │ Time: T         │     EXACT SAME URL                                     │
│  │ (identical)     │                                                        │
│  └─────────────────┘                                                        │
│  Question: Did the model learn from the specific feedback?                  │
│                                                                             │
│  ROUND 3: Different Timeframe (Abstraction)                                 │
│  ┌─────────────────┐                                                        │
│  │ Chart (1h)      │  → Model analyzes → Score → Compare to Baseline        │
│  │ Time: T         │     Same time period,                                  │
│  │ (same period)   │     4x more candles                                    │
│  └─────────────────┘                                                        │
│  Question: Did the model understand the CONCEPT, not just memorize?         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Test 1: Same Chart Re-test (Memorization)

**Goal**: Can the model apply specific feedback to the same chart?

| Aspect | Description |
|--------|-------------|
| Input | Exact same chart image URL |
| Expected | Near 100% accuracy if model "learns" |
| What it tests | Short-term memory, feedback incorporation |

**If model improves**: It can incorporate feedback within a session
**If model doesn't improve**: Feedback is ignored or context is lost

---

## Test 2: Different Timeframe (Abstraction)

**Goal**: Can the model abstract the lesson to a different visual representation?

| Original | Re-test | Ratio |
|----------|---------|-------|
| 4h candles | 1h candles | 4x more candles |
| 1h candles | 15m candles | 4x more candles |
| 15m candles | 5m candles | 3x more candles |

**What Changes**:
- Visual appearance (more candles, finer detail)
- Individual candle patterns look different
- Same underlying price action

**What Stays Same**:
- Time period covered
- OHLCV data (aggregated)
- Ground truth values (mostly - may differ slightly due to granularity)

**How to Generate**:
```
Original: 4h chart, Dec 20 00:00 → Dec 20 16:00 (4 candles × 4h = 16h)
Re-test:  1h chart, Dec 20 00:00 → Dec 20 16:00 (16 candles × 1h = 16h)
```

**If model improves**: It understood the CONCEPT, not just pattern-matched
**If model fails**: It's relying on visual patterns, not understanding

---

## Metrics

| Metric | Formula | Meaning |
|--------|---------|---------|
| `baseline_accuracy` | Round 1 score | Initial performance |
| `memorization_accuracy` | Round 2 score | Same chart after feedback |
| `abstraction_accuracy` | Round 3 score | Different timeframe |
| `memorization_delta` | Round 2 - Round 1 | Learning from specific feedback |
| `abstraction_delta` | Round 3 - Round 1 | Understanding concepts |

### Per-Field Tracking

```
Field                        | Baseline | Memorize | Abstract
-----------------------------|----------|----------|----------
uptrend_pullback_to_vwap     | ❌       | ✅ (+1)  | ✅ (+1)
volatility_direction_combo   | ✅       | ✅ (0)   | ✅ (0)
tested_and_held_support      | ❌       | ✅ (+1)  | ❌ (0)
breakout_with_volume         | ✅       | ✅ (0)   | ✅ (0)
potential_reversal_at_support| ❌       | ❌ (0)   | ✅ (+1)
overall_bias                 | ❌       | ✅ (+1)  | ❌ (0)
-----------------------------|----------|----------|----------
Total                        | 2/6      | 5/6 (+3) | 4/6 (+2)
```

---

## ⚠️ Critical: Conversation State Management

The API is **stateless**. Models only "remember" what you send in the request.

### ✅ CORRECT: Array of Messages

```typescript
// Each turn is a separate message object with a role
const messages: Message[] = [
  { role: 'system', content: 'You are a chart analyst...' },
  { role: 'user', content: [
    { type: 'text', text: 'Analyze this chart' },
    { type: 'image_url', image_url: { url: chartUrl } }
  ]},
  { role: 'assistant', content: round1Response },  // Model sees its OWN response
  { role: 'user', content: [
    { type: 'text', text: feedback + '\n\nTry again with the same chart.' },
    { type: 'image_url', image_url: { url: chartUrl } }
  ]}
];

// Send the full array
await callModel(modelId, messages);
```

### ❌ WRONG: Concatenated String

```typescript
// This is what most coding agents incorrectly do:
const prompt = `
Previous conversation:
You said: ${round1Response}
Feedback: ${feedback}

Now analyze the chart again...
`;

// Model doesn't have proper role boundaries!
await callModel(modelId, [{ role: 'user', content: prompt }]);
```

### Why It Matters

| Aspect | Array Format | String Concat |
|--------|--------------|---------------|
| Role boundaries | ✅ Clear system/user/assistant | ❌ All blurred together |
| Attention patterns | ✅ Designed for this | ❌ Suboptimal |
| Model sees own response | ✅ As assistant role | ❌ As quoted text |
| Learning effectiveness | ✅ Higher | ❌ Lower |

The `stateful-test.ts` file demonstrates the correct approach.

---

## Implementation

### Files

```
009-learning-loop/
├── README.md           # This file
├── package.json
├── .env.local
├── src/
│   ├── benchmark.ts    # Main CLI
│   ├── feedback.ts     # Generate feedback messages
│   ├── learning-loop.ts # Run the 3-round loop
│   ├── output-schema.ts # From 007
│   ├── ground-truth/   # From 007
│   ├── scorers/        # From 007
│   ├── replay-lab/     # From 007
│   ├── matrix.ts       # From 007
│   └── models.json     # From 007
```

### Timeframe Mapping

```typescript
const TIMEFRAME_DRILL_DOWN: Record<string, string> = {
  '4h': '1h',   // 4x more candles
  '1h': '15m',  // 4x more candles
  '15m': '5m',  // 3x more candles
  '5m': '1m',   // 5x more candles
};
```

---

## Quick Start

```bash
cd benchmarks/trading/009-learning-loop

# Run quick test (1 model, 2 frames)
npx tsx src/benchmark.ts --quick --model=google/gemini-2.0-flash

# Run with cheap models
npx tsx src/benchmark.ts --cheap

# Run with expensive models
npx tsx src/benchmark.ts --expensive
```

---

## Expected Insights

1. **Do models learn at all?** Some may completely ignore feedback
2. **Memorization vs Understanding**: High memorization + low abstraction = visual pattern matching
3. **Which fields are easiest to learn?** Simple booleans vs complex enums
4. **Model differences**: Do larger/newer models learn better?

---

## Future Work (Test 3: Similar Charts)

Find charts with similar structural characteristics:
- Same trend direction
- Similar volatility level
- Similar VWAP relationship
- Similar support/resistance setup

Methods to explore:
- Use Replay Labs annotations (regime, local_extrema)
- Compute similarity from OHLCV metrics
- Match ground truth field values
