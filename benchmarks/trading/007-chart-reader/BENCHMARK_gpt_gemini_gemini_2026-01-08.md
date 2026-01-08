# Multi-Step Reasoning Benchmark — Results

**Focus:** Testing models' ability to combine multiple chart signals into compound trading conclusions.

**Run Date:** 2026-01-08  
**Symbol:** COINBASE_SPOT_BTC_USD  
**Duration:** 65.9s  
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

### 🤖 openai/gpt-4o-mini

**Success Rate:** 5/6 frames  
**Average Accuracy:** 58.3%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 3425ms  
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

#### Frame: 15m_02 (15m)

**Timestamp:** 2025-12-20T10:45:00.000Z  
**Duration:** 5531ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | false | ❌ |
| volatility_direction_combo | "high_vol_bullish" | "consolidation" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 4285ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_up" | "low_vol_drift_down" | ❌ |
| tested_and_held_support | false | true | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 1h_02 (1h)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 5328ms  
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

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 5555ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | false | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "low_vol_drift_up" | ✅ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 66.7% (4/6 exact matches)

---

#### Frame: 4h_02 (4h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 4789ms  
**Status:** ❌ Error: No object generated: response did not match schema.

---

### 🤖 google/gemini-2.0-flash

**Success Rate:** 6/6 frames  
**Average Accuracy:** 63.9%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 3984ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | false | ❌ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 15m_02 (15m)

**Timestamp:** 2025-12-20T10:45:00.000Z  
**Duration:** 3027ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_down" | "consolidation" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "neutral" | "mildly_bullish" | 🟡 |

**Frame Accuracy:** 58.3% (3/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 3654ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_up" | "low_vol_drift_down" | ❌ |
| tested_and_held_support | false | true | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bearish" | 🟡 |

**Frame Accuracy:** 58.3% (3/6 exact matches)

---

#### Frame: 1h_02 (1h)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 3222ms  
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

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 4070ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_up" | "low_vol_drift_up" | ✅ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bullish" | 🟡 |

**Frame Accuracy:** 91.7% (5/6 exact matches)

---

#### Frame: 4h_02 (4h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 2879ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "high_vol_bearish" | "low_vol_drift_up" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bearish" | "mildly_bullish" | ❌ |

**Frame Accuracy:** 66.7% (4/6 exact matches)

---

### 🤖 google/gemini-2.5-flash-lite

**Success Rate:** 6/6 frames  
**Average Accuracy:** 77.8%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 1648ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_down" | "consolidation" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bearish" | 🟡 |

**Frame Accuracy:** 75.0% (4/6 exact matches)

---

#### Frame: 15m_02 (15m)

**Timestamp:** 2025-12-20T10:45:00.000Z  
**Duration:** 1693ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_down" | "consolidation" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bullish" | 🟡 |

**Frame Accuracy:** 75.0% (4/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 2239ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_down" | "low_vol_drift_down" | ✅ |
| tested_and_held_support | false | true | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bearish" | 🟡 |

**Frame Accuracy:** 75.0% (4/6 exact matches)

---

#### Frame: 1h_02 (1h)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 1757ms  
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

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 2200ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_up" | "low_vol_drift_up" | ✅ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bullish" | 🟡 |

**Frame Accuracy:** 91.7% (5/6 exact matches)

---

#### Frame: 4h_02 (4h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 1920ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "low_vol_drift_up" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "neutral" | "mildly_bullish" | 🟡 |

**Frame Accuracy:** 75.0% (4/6 exact matches)

---

## 📈 Summary by Model

| Model | Success Rate | Avg Accuracy | Exact Matches |
|-------|-------------|--------------|---------------|
| openai/gpt-4o-mini | 5/6 | 58.3% | 3.4/6 |
| google/gemini-2.0-flash | 6/6 | 63.9% | 3.5/6 |
| google/gemini-2.5-flash-lite | 6/6 | 77.8% | 4.2/6 |

---

*Auto-generated by Multi-Step Reasoning Benchmark*  
*Completed: 2026-01-08T12:11:19.794Z*
