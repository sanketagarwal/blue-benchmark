# Multi-Step Reasoning Benchmark — Results

**Focus:** Testing models' ability to combine multiple chart signals into compound trading conclusions.

**Run Date:** 2026-01-08  
**Symbol:** COINBASE_SPOT_BTC_USD  
**Duration:** 164.1s  
**Mode:** Quick  
**Total Frames:** 6  
**Models Evaluated:** 2

---

## 📊 The 6 Multi-Step Reasoning Fields

| # | Field | What It Tests |
|---|-------|---------------|
| 1 | `uptrend_pullback_to_vwap` | Trend detection + VWAP proximity |
| 2 | `volatility_direction_combo` | Volatility assessment + direction |
| 3 | `tested_and_held_support` | Support identification + reaction |
| 4 | `breakout_with_volume` | Price breakout + volume confirmation |
| 5 | `potential_reversal_at_support` | Support + reversal pattern |
| 6 | `overall_bias` | Synthesis of all signals |

---

## 📋 Per-Model Results

### 🤖 openai/gpt-4o

**Success Rate:** 6/6 frames  
**Average Accuracy:** 45.8%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 6702ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | null | null | ✅ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

#### Frame: 15m_02 (15m)

**Timestamp:** 2025-12-20T10:45:00.000Z  
**Duration:** 10573ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "neutral" | "mildly_bullish" | 🟡 |

**Frame Accuracy:** 41.7% (2/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 8137ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "low_vol_drift_down" | ❌ |
| tested_and_held_support | false | true | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bearish" | 🟡 |

**Frame Accuracy:** 41.7% (2/6 exact matches)

---

#### Frame: 1h_02 (1h)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 5490ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | null | ❌ |
| volatility_direction_combo | "consolidation" | "unknown" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | null | false | ❌ |
| overall_bias | "neutral" | "mildly_bearish" | 🟡 |

**Frame Accuracy:** 41.7% (2/6 exact matches)

---

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 6076ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | false | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "unknown" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | null | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

#### Frame: 4h_02 (4h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 6354ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_up" | "unknown" | ❌ |
| tested_and_held_support | true | null | ❌ |
| breakout_with_volume | false | null | ❌ |
| potential_reversal_at_support | null | null | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

### 🤖 google/gemini-2.5-pro

**Success Rate:** 6/6 frames  
**Average Accuracy:** 45.8%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 19593ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 15m_02 (15m)

**Timestamp:** 2025-12-20T10:45:00.000Z  
**Duration:** 15292ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "neutral" | "mildly_bullish" | 🟡 |

**Frame Accuracy:** 41.7% (2/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 17749ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "low_vol_drift_down" | ❌ |
| tested_and_held_support | true | true | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

#### Frame: 1h_02 (1h)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 21076ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "consolidation" | "unknown" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 17921ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "unknown" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 66.7% (4/6 exact matches)

---

#### Frame: 4h_02 (4h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 24473ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "high_vol_bullish" | "unknown" | ❌ |
| tested_and_held_support | true | null | ❌ |
| breakout_with_volume | false | null | ❌ |
| potential_reversal_at_support | false | null | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

## 📈 Summary by Model

| Model | Success Rate | Avg Accuracy | Exact Matches |
|-------|-------------|--------------|---------------|
| openai/gpt-4o | 6/6 | 45.8% | 2.5/6 |
| google/gemini-2.5-pro | 6/6 | 45.8% | 2.7/6 |

---

*Auto-generated by Multi-Step Reasoning Benchmark*  
*Completed: 2026-01-08T10:59:06.723Z*
