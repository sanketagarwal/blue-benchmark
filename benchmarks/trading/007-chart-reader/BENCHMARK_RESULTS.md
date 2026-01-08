# Multi-Step Reasoning Benchmark — Results

**Focus:** Testing models' ability to combine multiple chart signals into compound trading conclusions.

**Run Date:** 2026-01-08  
**Symbol:** COINBASE_SPOT_BTC_USD  
**Duration:** 123.0s  
**Mode:** Quick  
**Total Frames:** 6  
**Models Evaluated:** 3

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

### 🤖 google/gemini-2.0-flash

**Success Rate:** 6/6 frames  
**Average Accuracy:** 43.1%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 4380ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | null | ❌ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | null | false | ❌ |
| potential_reversal_at_support | null | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

#### Frame: 15m_02 (15m)

**Timestamp:** 2025-12-20T10:45:00.000Z  
**Duration:** 3212ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bullish" | 🟡 |

**Frame Accuracy:** 75.0% (4/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 3965ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "consolidation" | "low_vol_drift_down" | ❌ |
| tested_and_held_support | false | true | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | null | false | ❌ |
| overall_bias | "neutral" | "mildly_bearish" | 🟡 |

**Frame Accuracy:** 25.0% (1/6 exact matches)

---

#### Frame: 1h_02 (1h)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 3096ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | null | ❌ |
| volatility_direction_combo | "consolidation" | "unknown" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bearish" | 🟡 |

**Frame Accuracy:** 58.3% (3/6 exact matches)

---

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 3242ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | false | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "unknown" | ❌ |
| tested_and_held_support | null | false | ❌ |
| breakout_with_volume | null | false | ❌ |
| potential_reversal_at_support | null | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

#### Frame: 4h_02 (4h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 2922ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | false | ❌ |
| volatility_direction_combo | "consolidation" | "unknown" | ❌ |
| tested_and_held_support | null | null | ✅ |
| breakout_with_volume | null | null | ✅ |
| potential_reversal_at_support | null | null | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 66.7% (4/6 exact matches)

---

### 🤖 google/gemini-2.5-flash

**Success Rate:** 6/6 frames  
**Average Accuracy:** 44.4%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 15715ms  
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
**Duration:** 10550ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "low_vol_drift_down" | "consolidation" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 12606ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "consolidation" | "low_vol_drift_down" | ❌ |
| tested_and_held_support | true | true | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

#### Frame: 1h_02 (1h)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 15738ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "consolidation" | "unknown" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 13067ms  
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
**Duration:** 17915ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "unknown" | ❌ |
| tested_and_held_support | null | null | ✅ |
| breakout_with_volume | null | null | ✅ |
| potential_reversal_at_support | true | null | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 66.7% (4/6 exact matches)

---

### 🤖 google/gemini-2.5-flash-lite

**Success Rate:** 6/6 frames  
**Average Accuracy:** 48.6%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 1546ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bearish" | 🟡 |

**Frame Accuracy:** 75.0% (4/6 exact matches)

---

#### Frame: 15m_02 (15m)

**Timestamp:** 2025-12-20T10:45:00.000Z  
**Duration:** 1723ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bullish" | 🟡 |

**Frame Accuracy:** 75.0% (4/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 1889ms  
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
**Duration:** 1770ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "consolidation" | "unknown" | ❌ |
| tested_and_held_support | null | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bearish" | 🟡 |

**Frame Accuracy:** 41.7% (2/6 exact matches)

---

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 1518ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "unknown" | ❌ |
| tested_and_held_support | null | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | null | false | ❌ |
| overall_bias | "neutral" | "mildly_bullish" | 🟡 |

**Frame Accuracy:** 41.7% (2/6 exact matches)

---

#### Frame: 4h_02 (4h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 1541ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "high_vol_bearish" | "unknown" | ❌ |
| tested_and_held_support | false | null | ❌ |
| breakout_with_volume | false | null | ❌ |
| potential_reversal_at_support | false | null | ❌ |
| overall_bias | "mildly_bearish" | "mildly_bullish" | ❌ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

## 📈 Summary by Model

| Model | Success Rate | Avg Accuracy | Exact Matches |
|-------|-------------|--------------|---------------|
| google/gemini-2.0-flash | 6/6 | 43.1% | 2.3/6 |
| google/gemini-2.5-flash | 6/6 | 44.4% | 2.7/6 |
| google/gemini-2.5-flash-lite | 6/6 | 48.6% | 2.5/6 |

---

*Auto-generated by Multi-Step Reasoning Benchmark*  
*Completed: 2026-01-08T10:43:33.277Z*
