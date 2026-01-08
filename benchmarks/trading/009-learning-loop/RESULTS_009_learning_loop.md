# 009 Learning Loop Benchmark Results

**Generated**: 2026-01-09

---

## Executive Summary

| Model | Baseline | Memorization | Abstraction |
|-------|----------|--------------|-------------|
| gemini-2.0-flash (cheap) | 66.7% | **100%** (+33.3%) | 50% (-16.7%) |
| claude-sonnet-4 (SOTA) | 58.3% | **100%** (+41.7%) | 58.3% (0%) |

**Key Finding**: Both models achieve perfect memorization but fail at abstraction.

---

## Test Setup

### Conversation Format (Critical!)

We use **proper stateful conversation** with the message array format:

```
Turn 1: [system] → [user: analyze 1h chart]
Turn 2: [assistant: Round 1 prediction]
Turn 3: [user: feedback + try again with same chart]
Turn 4: [assistant: Round 2 prediction]
Turn 5: [user: feedback + now analyze 15m chart]
Turn 6: [assistant: Round 3 prediction]
```

The model sees its **own previous responses** as `assistant` role messages, not as quoted text.

### Three Rounds

1. **Baseline (1h)**: Initial analysis, no feedback
2. **Memorization (1h + FB)**: Same chart after seeing feedback
3. **Abstraction (15m + FB)**: Different timeframe (same time period)

---

## Detailed Results

### gemini-2.0-flash (Cheap Model)

| Round | Timeframe | Accuracy | Delta |
|-------|-----------|----------|-------|
| 1. Baseline | 1h | 66.7% (4/6) | - |
| 2. Memorization | 1h | **100%** (6/6) | **+33.3%** |
| 3. Abstraction | 15m | 50% (3/6) | **-16.7%** |

**Round 1 Errors** (2 wrong):
- `volatility_direction_combo`: said "high_vol_bearish", should be "low_vol_drift_down"
- `potential_reversal_at_support`: said true, should be false

**Round 2**: ✅ Fixed both errors → 100%

**Round 3 Errors** (3 wrong):
- `volatility_direction_combo`: kept "low_vol_drift_down" but 15m GT is "consolidation"
- `tested_and_held_support`: kept false but 15m GT is true
- `overall_bias`: said "bearish" but 15m GT is "neutral"

---

### claude-sonnet-4 (SOTA Model)

| Round | Timeframe | Accuracy | Delta |
|-------|-----------|----------|-------|
| 1. Baseline | 1h | 58.3% (3/6) | - |
| 2. Memorization | 1h | **100%** (6/6) | **+41.7%** |
| 3. Abstraction | 15m | 58.3% (3/6) | **0%** |

**Round 1 Errors** (3 wrong):
- `volatility_direction_combo`: said "high_vol_bearish", should be "low_vol_drift_down"
- `potential_reversal_at_support`: said true, should be false
- `overall_bias`: said "bearish", should be "mildly_bearish"

**Round 2**: ✅ Fixed all 3 errors → 100%

**Round 3 Errors** (3 wrong):
- `volatility_direction_combo`: kept "low_vol_drift_down" but 15m GT is "consolidation"
- `tested_and_held_support`: kept false but 15m GT is true
- `overall_bias`: kept "mildly_bearish" but 15m GT is "neutral"

---

## Ground Truth Comparison

The ground truth **differs** between 1h and 15m timeframes:

| Field | 1h GT | 15m GT | Same? |
|-------|-------|--------|-------|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | low_vol_drift_down | consolidation | ❌ |
| tested_and_held_support | false | true | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | mildly_bearish | neutral | ❌ |

**3 of 6 fields have different ground truth** when viewed at different granularity.

---

## Analysis

### Why Memorization Works

```
Model sees:
  1. Its own prediction (as assistant message)
  2. Explicit feedback: "You said X, correct is Y"
  3. Same chart image

Result: Model directly copies the corrected values → 100%
```

This is essentially **in-context memorization**, not learning.

### Why Abstraction Fails

```
Model learned: "For THIS chart, volatility = low_vol_drift_down"

15m chart shows: Different candle patterns (97 candles vs 25)
Model thinks: "I learned volatility is low_vol_drift_down, I'll stick with that"
Reality: 15m ground truth is "consolidation"

Result: Model applied memorized answer to different visual → WRONG
```

### The Core Problem

| What We Hoped | What Actually Happened |
|---------------|------------------------|
| Model learns: "How to identify low volatility patterns" | Model memorized: "The answer is low_vol_drift_down" |
| Model transfers understanding to new chart | Model copies memorized answer regardless of visual |

---

## Model Predictions Across Rounds

### gemini-2.0-flash

| Field | R1 | R2 | R3 | R3 GT |
|-------|----|----|----|----|
| uptrend_pullback_to_vwap | false | false | false | false ✅ |
| volatility_direction_combo | high_vol_bearish | low_vol_drift_down | low_vol_drift_down | consolidation ❌ |
| tested_and_held_support | false | false | false | true ❌ |
| breakout_with_volume | false | false | false | false ✅ |
| potential_reversal_at_support | true | false | false | false ✅ |
| overall_bias | mildly_bearish | mildly_bearish | bearish | neutral ❌ |

### claude-sonnet-4

| Field | R1 | R2 | R3 | R3 GT |
|-------|----|----|----|----|
| uptrend_pullback_to_vwap | false | false | false | false ✅ |
| volatility_direction_combo | high_vol_bearish | low_vol_drift_down | low_vol_drift_down | consolidation ❌ |
| tested_and_held_support | false | false | false | true ❌ |
| breakout_with_volume | false | false | false | false ✅ |
| potential_reversal_at_support | true | false | false | false ✅ |
| overall_bias | bearish | mildly_bearish | mildly_bearish | neutral ❌ |

**Pattern**: Both models kept their Round 2 answers in Round 3, even when wrong.

---

## Implications

### 1. Memorization ≠ Understanding

Perfect memorization (100%) doesn't mean the model understands:
- What makes volatility "high" vs "low"
- What visual patterns indicate support
- How bias is determined from price action

### 2. Feedback Format Matters

Using proper message array format with roles:
- ✅ Model sees its response as `assistant` role
- ✅ Model sees feedback as `user` role
- ✅ Enables perfect memorization

String concatenation would likely show worse memorization.

### 3. Transfer Learning is Hard

Even with full conversation history and explicit feedback:
- Models don't transfer learning to different representations
- Same time period, different timeframe = different answers needed
- Models default to memorized values

---

## Raw Data

### Chart Parameters

```
Symbol: COINBASE_SPOT_BTC_USD
Time: ~Dec 26, 2025 (14 days before test)
1h chart: 25 candles
15m chart: 97 candles
Same 24-hour time period
```

### API Configuration

```
AI Gateway: Vercel AI Gateway
Conversation format: OpenAI-compatible messages array
Temperature: 0
Max tokens: 2000
```

---

## Next Steps

- [ ] Test with GPT-4o to compare learning behavior
- [ ] Try multi-shot examples before feedback
- [ ] Test if explaining WHY (not just WHAT) improves abstraction
- [ ] Test longer feedback with reasoning
- [ ] Test showing both 1h and 15m charts simultaneously

---

## Conclusion

> **Models can memorize answers but cannot learn concepts.**
>
> 100% memorization + 0% abstraction = pattern matching, not understanding.

The learning loop exposes a fundamental limitation: vision LLMs process feedback as "update the specific answer" rather than "update my understanding of how to analyze charts."
