# 009 Learning Loop Benchmark Results

**Generated**: 2026-01-09

---

## Executive Summary

| Test | Model | Baseline | Memorization | Abstraction |
|------|-------|----------|--------------|-------------|
| Test 1 (1h) | gemini-2.0-flash | 33% | 50% (+17%) | - |
| Test 2 (1h) | gemini-3-pro-preview | 42% | **100%** (+58%) | - |
| Test 3 (4h→1h) | gemini-3-pro-preview | 67% | 67% (0%) | 33% (-33%) |

---

## Test 1: gemini-2.0-flash (1h chart)

**Time**: Dec 26, 2025

| Round | Accuracy | Delta |
|-------|----------|-------|
| Baseline | 33% (2/6) | - |
| Same Chart + FB | 50% (3/6) | **+17%** |

**Verdict**: ✅ Model improved after feedback (fixed 1/4 errors)

---

## Test 2: gemini-3-pro-preview (1h chart) 🏆

**Time**: Dec 18, 2025

| Round | Accuracy | Delta |
|-------|----------|-------|
| Baseline | 42% (2/6) | - |
| Same Chart + FB | **100%** (6/6) | **+58%** |

**Verdict**: ✅ Perfect! Model fixed ALL errors after feedback

---

## Test 3: gemini-3-pro-preview (4h → 1h) - Full 3-Round Test

**Time**: Dec 16-18, 2025
**Original**: 4h timeframe
**Drilldown**: 1h timeframe (same time period)

### Ground Truth Comparison

| Field | 4h GT | 1h GT | Same? |
|-------|-------|-------|-------|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | consolidation | low_vol_drift_up | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | mildly_bullish | mildly_bullish | ✅ |

### Results

| Round | Timeframe | Accuracy | Delta |
|-------|-----------|----------|-------|
| 1. Baseline | 4h | 67% (4/6) | - |
| 2. Same Chart + FB | 4h | 67% (4/6) | **0%** |
| 3. Diff TF + FB | 1h | 33% (2/6) | **-33%** |

### What Happened

**Round 2 (Memorization)**: Model did NOT change its predictions despite feedback
- `volatility_direction_combo`: Still said "high_vol_bearish" (should be "consolidation")
- `overall_bias`: Still said "bearish" (should be "mildly_bullish")

**Round 3 (Abstraction)**: Model got WORSE on different timeframe
- ❌ BROKE `tested_and_held_support`: Changed to true (was correctly false)
- ❌ BROKE `potential_reversal_at_support`: Changed to true (was correctly false)
- Model saw different visual patterns in 1h and made different (wrong) conclusions

**Verdict**: 
- ⚠️ Memorization failed (0% improvement)
- ❌ Abstraction failed (-33% regression)

---

## Key Findings

### 1. Learning is Inconsistent

| Scenario | Learning |
|----------|----------|
| Test 2: Same chart | ✅ Perfect (+58%) |
| Test 3: Same chart | ❌ None (0%) |
| Test 3: Different TF | ❌ Worse (-33%) |

The same model (Gemini 3 Pro) showed very different learning behavior across tests.

### 2. Abstraction is Hard

When shown a different timeframe of the same time period:
- Model made NEW errors it didn't have before
- Visual patterns looked different → different (wrong) interpretations
- Feedback from 4h chart didn't help with 1h chart

### 3. Ground Truth Can Differ Between Timeframes

Even for the same time period:
- 4h: "consolidation" volatility
- 1h: "low_vol_drift_up" volatility

More granular data → different pattern classifications

---

## Implications

1. **Memorization is unreliable**: Same model, same setup, different results
2. **Abstraction is very hard**: Models can't transfer learning to different views
3. **Visual-only feedback has limits**: Models need to learn patterns, not just answers

---

## Raw Results

### Test 3: Model Predictions

**Round 1 (4h Baseline)**:
```json
{
  "uptrend_pullback_to_vwap": false,        // ✅
  "volatility_direction_combo": "high_vol_bearish",  // ❌
  "tested_and_held_support": false,         // ✅
  "breakout_with_volume": false,            // ✅
  "potential_reversal_at_support": false,   // ✅
  "overall_bias": "bearish"                 // ❌
}
```

**Round 2 (4h + Feedback)**: SAME as Round 1 (no learning)

**Round 3 (1h + Feedback)**:
```json
{
  "uptrend_pullback_to_vwap": false,        // ✅
  "volatility_direction_combo": "high_vol_bearish",  // ❌
  "tested_and_held_support": true,          // ❌ BROKE
  "breakout_with_volume": false,            // ✅
  "potential_reversal_at_support": true,    // ❌ BROKE
  "overall_bias": "bearish"                 // ❌
}
```

---

## Next Steps

- [ ] Run more tests to understand learning variability
- [ ] Try with Claude and GPT-4o
- [ ] Test if more detailed feedback improves learning
- [ ] Test if showing both timeframes together helps
