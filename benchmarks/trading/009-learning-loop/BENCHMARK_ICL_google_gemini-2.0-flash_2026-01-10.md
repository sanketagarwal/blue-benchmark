# 009 In-Context Learning Benchmark Results

**Generated**: 2026-01-10T18:53:01.987Z
**Symbol**: COINBASE_SPOT_BTC_USD
**Timeframes**: 4h

## Summary

| Model | Baseline | Memorization | Transfer | Δ Memorize | Δ Transfer |
|-------|----------|--------------|----------|------------|------------|
| google/gemini-2.0-flash | 58.3% | 100.0% | 58.3% | +41.7% | +0.0% |

---

## Detailed Results

### google/gemini-2.0-flash

#### Frame: 4h_01

| Round | Type | Accuracy | Δ from Baseline |
|-------|------|----------|------------------|
| 1 | Baseline | 58.3% | - |
| 2 | Memorization | 100.0% | +41.7% |

**Field Analysis (Baseline → Memorization):**

| Field | Ground Truth | Baseline | After Feedback |
|-------|--------------|----------|----------------|
| uptrend_pullback_to_vwap | - | ✅ | ✅  |
| volatility_direction_combo | - | ❌ | ✅ 📈 |
| tested_and_held_support | - | ✅ | ✅  |
| breakout_with_volume | - | ❌ | ✅ 📈 |
| potential_reversal_at_support | - | ✅ | ✅  |
| overall_bias | - | ❌ | ✅ 📈 |

---

## Insights

- **Average Memorization Delta**: +41.7%
- **Average Transfer Delta**: +0.0%

✅ **Strong memorization**: Models significantly improve when seeing the same chart after feedback.
❌ **No transfer**: Models cannot generalize learning to new charts.
