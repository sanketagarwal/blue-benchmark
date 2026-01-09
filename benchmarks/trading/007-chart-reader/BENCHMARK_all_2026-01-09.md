# Multi-Step Reasoning Benchmark — Results

**Focus:** Testing models' ability to combine multiple chart signals into compound trading conclusions.

**Run Date:** 2026-01-09  
**Symbol:** COINBASE_SPOT_BTC_USD  
**Duration:** 243.3s  
**Mode:** Quick  
**Total Frames:** 6  
**Models Evaluated:** 6

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

### 🤖 anthropic/claude-opus-4-5

**Success Rate:** 6/6 frames  
**Average Accuracy:** 70.8%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 5542ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_down" | "consolidation" | ❌ |
| tested_and_held_support | true | true | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bearish" | "neutral" | 🟡 |

**Frame Accuracy:** 75.0% (4/6 exact matches)

---

#### Frame: 15m_02 (15m)

**Timestamp:** 2025-12-20T10:45:00.000Z  
**Duration:** 5341ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_down" | "consolidation" | ❌ |
| tested_and_held_support | true | true | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | true | ✅ |
| overall_bias | "mildly_bearish" | "bullish" | ❌ |

**Frame Accuracy:** 66.7% (4/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 6325ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_up" | "low_vol_drift_down" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

#### Frame: 1h_02 (1h)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 5947ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_up" | "consolidation" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 66.7% (4/6 exact matches)

---

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 7226ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_up" | "consolidation" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 83.3% (5/6 exact matches)

---

#### Frame: 4h_02 (4h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 5605ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "high_vol_bullish" | "consolidation" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 83.3% (5/6 exact matches)

---

### 🤖 openai/gpt-4o

**Success Rate:** 6/6 frames  
**Average Accuracy:** 70.8%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 6893ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | true | true | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "neutral" | 🟡 |

**Frame Accuracy:** 75.0% (4/6 exact matches)

---

#### Frame: 15m_02 (15m)

**Timestamp:** 2025-12-20T10:45:00.000Z  
**Duration:** 5264ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | false | true | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | true | ❌ |
| overall_bias | "neutral" | "bullish" | ❌ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 5692ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | false | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "low_vol_drift_down" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

#### Frame: 1h_02 (1h)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 8511ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bearish" | 🟡 |

**Frame Accuracy:** 91.7% (5/6 exact matches)

---

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 6270ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bullish" | 🟡 |

**Frame Accuracy:** 91.7% (5/6 exact matches)

---

#### Frame: 4h_02 (4h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 6608ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_up" | "consolidation" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 66.7% (4/6 exact matches)

---

### 🤖 openai/gpt-4o-mini

**Success Rate:** 6/6 frames  
**Average Accuracy:** 56.9%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 3537ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | false | true | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "neutral" | 🟡 |

**Frame Accuracy:** 58.3% (3/6 exact matches)

---

#### Frame: 15m_02 (15m)

**Timestamp:** 2025-12-20T10:45:00.000Z  
**Duration:** 5582ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | false | ❌ |
| volatility_direction_combo | "high_vol_bullish" | "consolidation" | ❌ |
| tested_and_held_support | true | true | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | true | ❌ |
| overall_bias | "mildly_bullish" | "bullish" | 🟡 |

**Frame Accuracy:** 41.7% (2/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 3727ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "low_vol_drift_down" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

#### Frame: 1h_02 (1h)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 4612ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | false | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "consolidation" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 6483ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bullish" | 🟡 |

**Frame Accuracy:** 91.7% (5/6 exact matches)

---

#### Frame: 4h_02 (4h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 3571ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "high_vol_bearish" | "consolidation" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "bearish" | "mildly_bullish" | ❌ |

**Frame Accuracy:** 66.7% (4/6 exact matches)

---

### 🤖 google/gemini-2.0-flash

**Success Rate:** 6/6 frames  
**Average Accuracy:** 61.1%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 4070ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | false | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "consolidation" | ❌ |
| tested_and_held_support | false | true | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "neutral" | 🟡 |

**Frame Accuracy:** 25.0% (1/6 exact matches)

---

#### Frame: 15m_02 (15m)

**Timestamp:** 2025-12-20T10:45:00.000Z  
**Duration:** 3060ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_down" | "consolidation" | ❌ |
| tested_and_held_support | false | true | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | true | ✅ |
| overall_bias | "neutral" | "bullish" | ❌ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 3423ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_up" | "low_vol_drift_down" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bearish" | 🟡 |

**Frame Accuracy:** 75.0% (4/6 exact matches)

---

#### Frame: 1h_02 (1h)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 2846ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bearish" | 🟡 |

**Frame Accuracy:** 91.7% (5/6 exact matches)

---

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 4336ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | false | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "consolidation" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 66.7% (4/6 exact matches)

---

#### Frame: 4h_02 (4h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 2928ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | false | ❌ |
| volatility_direction_combo | "high_vol_bearish" | "consolidation" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bullish" | 🟡 |

**Frame Accuracy:** 58.3% (3/6 exact matches)

---

### 🤖 google/gemini-2.5-flash

**Success Rate:** 6/6 frames  
**Average Accuracy:** 75.0%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 13153ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | true | true | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "neutral" | 🟡 |

**Frame Accuracy:** 75.0% (4/6 exact matches)

---

#### Frame: 15m_02 (15m)

**Timestamp:** 2025-12-20T10:45:00.000Z  
**Duration:** 14040ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | false | true | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | true | ✅ |
| overall_bias | "mildly_bearish" | "bullish" | ❌ |

**Frame Accuracy:** 66.7% (4/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 9119ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "low_vol_drift_down" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bearish" | 🟡 |

**Frame Accuracy:** 75.0% (4/6 exact matches)

---

#### Frame: 1h_02 (1h)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 13404ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 83.3% (5/6 exact matches)

---

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 18439ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_up" | "consolidation" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 66.7% (4/6 exact matches)

---

#### Frame: 4h_02 (4h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 32376ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "high_vol_bullish" | "consolidation" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 83.3% (5/6 exact matches)

---

### 🤖 google/gemini-2.5-flash-lite

**Success Rate:** 6/6 frames  
**Average Accuracy:** 70.8%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 2431ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | false | true | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "neutral" | ✅ |

**Frame Accuracy:** 83.3% (5/6 exact matches)

---

#### Frame: 15m_02 (15m)

**Timestamp:** 2025-12-20T10:45:00.000Z  
**Duration:** 2588ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_down" | "consolidation" | ❌ |
| tested_and_held_support | false | true | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | true | ❌ |
| overall_bias | "mildly_bearish" | "bullish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 1904ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "low_vol_drift_down" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bearish" | 🟡 |

**Frame Accuracy:** 75.0% (4/6 exact matches)

---

#### Frame: 1h_02 (1h)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 3059ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_up" | "consolidation" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bearish" | 🟡 |

**Frame Accuracy:** 75.0% (4/6 exact matches)

---

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 1752ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bullish" | 🟡 |

**Frame Accuracy:** 91.7% (5/6 exact matches)

---

#### Frame: 4h_02 (4h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 1308ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "high_vol_bearish" | "consolidation" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "bearish" | "mildly_bullish" | ❌ |

**Frame Accuracy:** 66.7% (4/6 exact matches)

---

## 📈 Summary by Model

| Model | Success Rate | Avg Accuracy | Exact Matches |
|-------|-------------|--------------|---------------|
| anthropic/claude-opus-4-5 | 6/6 | 70.8% | 4.2/6 |
| openai/gpt-4o | 6/6 | 70.8% | 4.0/6 |
| openai/gpt-4o-mini | 6/6 | 56.9% | 3.2/6 |
| google/gemini-2.0-flash | 6/6 | 61.1% | 3.3/6 |
| google/gemini-2.5-flash | 6/6 | 75.0% | 4.3/6 |
| google/gemini-2.5-flash-lite | 6/6 | 70.8% | 4.0/6 |

---

*Auto-generated by Multi-Step Reasoning Benchmark*  
*Completed: 2026-01-09T17:05:09.273Z*
