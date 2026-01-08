# Multi-Step Reasoning Benchmark — Results

**Focus:** Testing models' ability to combine multiple chart signals into compound trading conclusions.

**Run Date:** 2026-01-08  
**Symbol:** COINBASE_SPOT_BTC_USD  
**Duration:** 1403.7s  
**Mode:** Full  
**Total Frames:** 13  
**Models Evaluated:** 4

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

**Success Rate:** 13/13 frames  
**Average Accuracy:** 32.1%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 6925ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | null | ❌ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 15m_02 (15m)

**Timestamp:** 2025-12-20T10:45:00.000Z  
**Duration:** 4244ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

#### Frame: 15m_03 (15m)

**Timestamp:** 2025-12-20T09:30:00.000Z  
**Duration:** 4567ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "high_vol_bullish" | "consolidation" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | true | false | ❌ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

#### Frame: 15m_04 (15m)

**Timestamp:** 2025-12-20T08:15:00.000Z  
**Duration:** 5389ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "high_vol_bullish" | "consolidation" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | true | false | ❌ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

#### Frame: 15m_05 (15m)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 6838ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "consolidation" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 5939ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "low_vol_drift_down" | ❌ |
| tested_and_held_support | true | true | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 1h_02 (1h)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 9131ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "high_vol_bullish" | "unknown" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

#### Frame: 1h_03 (1h)

**Timestamp:** 2025-12-20T02:00:00.000Z  
**Duration:** 4928ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "high_vol_bullish" | "unknown" | ❌ |
| tested_and_held_support | true | true | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 1h_04 (1h)

**Timestamp:** 2025-12-19T21:00:00.000Z  
**Duration:** 6209ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "high_vol_bearish" | "unknown" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | true | ❌ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bearish" | "strongly_bullish" | ❌ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

#### Frame: 1h_05 (1h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 6326ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | true | ✅ |
| volatility_direction_combo | "high_vol_bullish" | "unknown" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 66.7% (4/6 exact matches)

---

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 5570ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "high_vol_bullish" | "unknown" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

#### Frame: 4h_02 (4h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 5703ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | false | ❌ |
| volatility_direction_combo | "high_vol_bullish" | "unknown" | ❌ |
| tested_and_held_support | true | null | ❌ |
| breakout_with_volume | false | null | ❌ |
| potential_reversal_at_support | false | null | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

#### Frame: 4h_03 (4h)

**Timestamp:** 2025-12-18T20:00:00.000Z  
**Duration:** 5212ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "high_vol_bearish" | "unknown" | ❌ |
| tested_and_held_support | false | null | ❌ |
| breakout_with_volume | false | null | ❌ |
| potential_reversal_at_support | null | null | ✅ |
| overall_bias | "mildly_bearish" | "mildly_bullish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

### 🤖 anthropic/claude-3-7-sonnet-latest

**Success Rate:** 13/13 frames  
**Average Accuracy:** 21.2%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 4581ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "low_vol_drift_down" | "consolidation" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "neutral" | "mildly_bearish" | 🟡 |

**Frame Accuracy:** 25.0% (1/6 exact matches)

---

#### Frame: 15m_02 (15m)

**Timestamp:** 2025-12-20T10:45:00.000Z  
**Duration:** 6303ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "low_vol_drift_down" | "consolidation" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bearish" | "mildly_bullish" | ❌ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

#### Frame: 15m_03 (15m)

**Timestamp:** 2025-12-20T09:30:00.000Z  
**Duration:** 4500ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "consolidation" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

#### Frame: 15m_04 (15m)

**Timestamp:** 2025-12-20T08:15:00.000Z  
**Duration:** 4684ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | null | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "consolidation" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

#### Frame: 15m_05 (15m)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 4681ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | null | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "consolidation" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | true | false | ❌ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "strongly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 0.0% (0/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 4611ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "low_vol_drift_down" | ❌ |
| tested_and_held_support | true | true | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 1h_02 (1h)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 4227ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | null | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "unknown" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

#### Frame: 1h_03 (1h)

**Timestamp:** 2025-12-20T02:00:00.000Z  
**Duration:** 4150ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | null | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "unknown" | ❌ |
| tested_and_held_support | true | true | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 1h_04 (1h)

**Timestamp:** 2025-12-19T21:00:00.000Z  
**Duration:** 4253ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | false | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "unknown" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | true | ❌ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "strongly_bullish" | 🟡 |

**Frame Accuracy:** 8.3% (0/6 exact matches)

---

#### Frame: 1h_05 (1h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 5856ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | true | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "unknown" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 4518ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | false | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "unknown" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 4h_02 (4h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 4878ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "high_vol_bearish" | "unknown" | ❌ |
| tested_and_held_support | true | null | ❌ |
| breakout_with_volume | false | null | ❌ |
| potential_reversal_at_support | true | null | ❌ |
| overall_bias | "neutral" | "mildly_bullish" | 🟡 |

**Frame Accuracy:** 25.0% (1/6 exact matches)

---

#### Frame: 4h_03 (4h)

**Timestamp:** 2025-12-18T20:00:00.000Z  
**Duration:** 4716ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "high_vol_bearish" | "unknown" | ❌ |
| tested_and_held_support | true | null | ❌ |
| breakout_with_volume | false | null | ❌ |
| potential_reversal_at_support | true | null | ❌ |
| overall_bias | "mildly_bearish" | "mildly_bullish" | ❌ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

### 🤖 openai/gpt-5

**Success Rate:** 13/13 frames  
**Average Accuracy:** 35.9%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 43961ms  
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
**Duration:** 52690ms  
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

#### Frame: 15m_03 (15m)

**Timestamp:** 2025-12-20T09:30:00.000Z  
**Duration:** 64272ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | true | false | ❌ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "strongly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

#### Frame: 15m_04 (15m)

**Timestamp:** 2025-12-20T08:15:00.000Z  
**Duration:** 55414ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | null | ❌ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | true | false | ❌ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "strongly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

#### Frame: 15m_05 (15m)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 57700ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "consolidation" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | true | false | ❌ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 41789ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "low_vol_drift_down" | ❌ |
| tested_and_held_support | true | true | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "strongly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 1h_02 (1h)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 43392ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "unknown" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

#### Frame: 1h_03 (1h)

**Timestamp:** 2025-12-20T02:00:00.000Z  
**Duration:** 51990ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "consolidation" | "unknown" | ❌ |
| tested_and_held_support | true | true | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 1h_04 (1h)

**Timestamp:** 2025-12-19T21:00:00.000Z  
**Duration:** 65778ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "unknown" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | true | ❌ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "strongly_bullish" | 🟡 |

**Frame Accuracy:** 25.0% (1/6 exact matches)

---

#### Frame: 1h_05 (1h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 51952ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | true | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "unknown" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "strongly_bullish" | "mildly_bullish" | 🟡 |

**Frame Accuracy:** 25.0% (1/6 exact matches)

---

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 60136ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "low_vol_drift_up" | "unknown" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 83.3% (5/6 exact matches)

---

#### Frame: 4h_02 (4h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 81989ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "high_vol_bullish" | "unknown" | ❌ |
| tested_and_held_support | null | null | ✅ |
| breakout_with_volume | null | null | ✅ |
| potential_reversal_at_support | true | null | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 66.7% (4/6 exact matches)

---

#### Frame: 4h_03 (4h)

**Timestamp:** 2025-12-18T20:00:00.000Z  
**Duration:** 47106ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "high_vol_bearish" | "unknown" | ❌ |
| tested_and_held_support | null | null | ✅ |
| breakout_with_volume | null | null | ✅ |
| potential_reversal_at_support | false | null | ❌ |
| overall_bias | "mildly_bearish" | "mildly_bullish" | ❌ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

### 🤖 google/gemini-3-pro-preview

**Success Rate:** 13/13 frames  
**Average Accuracy:** 41.0%

#### Frame: 15m_01 (15m)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 24067ms  
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
**Duration:** 55224ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "low_vol_drift_down" | "consolidation" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "neutral" | "mildly_bullish" | 🟡 |

**Frame Accuracy:** 25.0% (1/6 exact matches)

---

#### Frame: 15m_03 (15m)

**Timestamp:** 2025-12-20T09:30:00.000Z  
**Duration:** 44897ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | null | ❌ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

#### Frame: 15m_04 (15m)

**Timestamp:** 2025-12-20T08:15:00.000Z  
**Duration:** 43679ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | true | null | ❌ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 15m_05 (15m)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 40778ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "consolidation" | "consolidation" | ✅ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 66.7% (4/6 exact matches)

---

#### Frame: 1h_01 (1h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 39560ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "consolidation" | "low_vol_drift_down" | ❌ |
| tested_and_held_support | false | true | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 1h_02 (1h)

**Timestamp:** 2025-12-20T07:00:00.000Z  
**Duration:** 47052ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "low_vol_drift_up" | "unknown" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

#### Frame: 1h_03 (1h)

**Timestamp:** 2025-12-20T02:00:00.000Z  
**Duration:** 50992ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | null | ❌ |
| volatility_direction_combo | "consolidation" | "unknown" | ❌ |
| tested_and_held_support | false | true | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bearish" | ❌ |

**Frame Accuracy:** 33.3% (2/6 exact matches)

---

#### Frame: 1h_04 (1h)

**Timestamp:** 2025-12-19T21:00:00.000Z  
**Duration:** 41795ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "consolidation" | "unknown" | ❌ |
| tested_and_held_support | false | false | ✅ |
| breakout_with_volume | false | true | ❌ |
| potential_reversal_at_support | true | false | ❌ |
| overall_bias | "mildly_bullish" | "strongly_bullish" | 🟡 |

**Frame Accuracy:** 41.7% (2/6 exact matches)

---

#### Frame: 1h_05 (1h)

**Timestamp:** 2025-12-19T16:00:00.000Z  
**Duration:** 39385ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | true | ❌ |
| volatility_direction_combo | "high_vol_bullish" | "unknown" | ❌ |
| tested_and_held_support | true | false | ❌ |
| breakout_with_volume | false | false | ✅ |
| potential_reversal_at_support | false | false | ✅ |
| overall_bias | "mildly_bullish" | "mildly_bullish" | ✅ |

**Frame Accuracy:** 50.0% (3/6 exact matches)

---

#### Frame: 4h_01 (4h)

**Timestamp:** 2025-12-20T12:00:00.000Z  
**Duration:** 31756ms  
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
**Duration:** 46290ms  
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

#### Frame: 4h_03 (4h)

**Timestamp:** 2025-12-18T20:00:00.000Z  
**Duration:** 32216ms  
**Status:** ✅ Success

| Field | Predicted | Ground Truth | Score |
|-------|-----------|--------------|:-----:|
| uptrend_pullback_to_vwap | false | false | ✅ |
| volatility_direction_combo | "high_vol_bearish" | "unknown" | ❌ |
| tested_and_held_support | false | null | ❌ |
| breakout_with_volume | false | null | ❌ |
| potential_reversal_at_support | false | null | ❌ |
| overall_bias | "strongly_bearish" | "mildly_bullish" | ❌ |

**Frame Accuracy:** 16.7% (1/6 exact matches)

---

## 📈 Summary by Model

| Model | Success Rate | Avg Accuracy | Exact Matches |
|-------|-------------|--------------|---------------|
| anthropic/claude-opus-4-5 | 13/13 | 32.1% | 1.9/6 |
| anthropic/claude-3-7-sonnet-latest | 13/13 | 21.2% | 1.2/6 |
| openai/gpt-5 | 13/13 | 35.9% | 2.1/6 |
| google/gemini-3-pro-preview | 13/13 | 41.0% | 2.4/6 |

---

*Auto-generated by Multi-Step Reasoning Benchmark*  
*Completed: 2026-01-08T11:56:08.705Z*
