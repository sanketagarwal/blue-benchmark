# 009 In-Context Learning Benchmark Results

**Generated**: 2026-01-10T19:28:07.848Z
**Symbol**: COINBASE_SPOT_BTC_USD
**Timeframes**: 1m

## Summary

| Model | Baseline | Memorization | Transfer | Δ Memorize | Δ Transfer |
|-------|----------|--------------|----------|------------|------------|
| google/gemini-2.0-flash | 75.0% | 100.0% | 66.7% | +25.0% | -16.7% |

---

## Detailed Results

### google/gemini-2.0-flash

#### Frame: 1m_01

| Round | Type | Accuracy | Δ from Baseline |
|-------|------|----------|------------------|
| 1 | Baseline | 75.0% | - |
| 2 | Memorization | 100.0% | +25.0% |
| 3 | Transfer #1 | 66.7% | -8.3% |
| 4 | Transfer #2 | 50.0% | -25.0% |

**Field Analysis (Baseline → Memorization):**

| Field | Ground Truth | Baseline | After Feedback |
|-------|--------------|----------|----------------|
| uptrend_pullback_to_vwap | - | ✅ | ✅  |
| volatility_direction_combo | - | ✅ | ✅  |
| tested_and_held_support | - | ❌ | ✅ 📈 |
| breakout_with_volume | - | ✅ | ✅  |
| potential_reversal_at_support | - | ✅ | ✅  |
| overall_bias | - | ❌ | ✅ 📈 |

---

## Insights

- **Average Memorization Delta**: +25.0%
- **Average Transfer Delta**: -16.7%

✅ **Strong memorization**: Models significantly improve when seeing the same chart after feedback.
❌ **No transfer**: Models cannot generalize learning to new charts.
