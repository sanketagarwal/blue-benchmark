# agent_006 Benchmark Results

**Symbol:** COINBASE_SPOT_BTC_USD
**Start Time:** 2025-12-29T14:00:00.000Z
**Progress:** Round 12/12 (Phase 3)
**Last Updated:** 2026-01-01T03:46:37.579Z

## Summary

- **Active Models:** 10
- **Eliminated:** 13
- **Models with Failures:** 3

## Arena Results by Horizon

### 15m Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | openai/gpt-5 | 0.50 | 🟢0.45 | 0.43 | 0.000 |
| 🥈 | google/gemini-3-pro-preview | 0.50 | 🟢0.17 | 0.11 | 0.001 |

### 1h Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | openai/gpt-4o | 0.94 | 🟡0.51 | 0.51 | 0.000 |
| 🥈 | openai/gpt-4o-mini | 0.94 | 🟡0.51 | 0.51 | 0.000 |
| 🥉 | openai/gpt-4.1-mini | 0.94 | 🟡0.51 | 0.51 | 0.000 |
| 4 | openai/gpt-5 | 0.80 | 🟡0.51 | 0.50 | 0.000 |
| 5 | anthropic/claude-3-5-haiku-latest | 0.20 | 🟡0.60 | 0.60 | 0.000 |
| 6 | openai/gpt-5-mini | 0.00 | 🟡0.63 | 0.62 | 0.000 |

### 4h Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | openai/gpt-5 | 0.50 | 🟡0.58 | 0.58 | 0.000 |
| 🥈 | google/gemini-2.5-pro | 0.50 | 🟢0.21 | 0.20 | 0.000 |

### 24h Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | mistral/ministral-3b-latest | 0.80 | 🟡0.61 | 0.60 | 0.000 |
| 🥈 | mistral/pixtral-12b-2409 | 0.20 | 🟡0.69 | 0.69 | 0.000 |
| 🥉 | openai/gpt-5 | 0.00 | 🟡0.63 | 0.62 | 0.000 |

## Cross-Horizon Strength

*Models appearing in multiple horizon arenas demonstrate consistent performance.*

| Model | Arenas | Horizons | Avg Rank |
|-------|--------|----------|----------|
| ⭐ openai/gpt-5 | 4/4 | 15m, 1h, 4h, 24h | 2.3 |

**Legend:** ⭐ = Top performer across all horizons

## Full Results (All Models)

| Rank | Model | Status | Rnds | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|------|-------|--------|------|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| 🥇 | google/gemini-3-pro-preview | ✅ Active | 12 | 🟢0.175 | 🟢0.088 | 🟢0.060 | 🟢0.115 | 🟢0.109 | 100.0 | 0.051 | 0.081 | 0.50 | **0.9261** |
| 🥈 | openai/gpt-5 | ✅ Active | 12 | 🟢0.445 | 🟡0.505 | 🟡0.580 | 🟡0.627 | 🟡0.539 | 95.2 | 0.426 | 0.070 | 0.50 | **0.8530** |
| 🥉 | anthropic/claude-sonnet-4-5 | ❌ P2 | 12 | 🔴1.019 | 🔴0.962 | 🔴0.883 | 🟡0.724 | 🔴0.897 | 90.5 | 0.555 | 0.257 | 0.50 | **0.7773** |
| 4 | google/gemini-2.5-flash-lite | ❌ P0 | 4 | 🔴1.204 | 🔴0.916 | 🔴0.916 | 🔴1.204 | 🔴1.060 | 85.7 | 0.916 | 0.144 | 0.50 | **0.7266** |
| 5 | openai/gpt-4o-mini | ✅ Active | 12 | 🔴1.386 | 🟡0.511 | 🔴1.849 | 🔴0.916 | 🔴1.166 | 81.0 | 0.511 | 0.505 | 0.50 | **0.6963** |
| 6 | openai/gpt-4o | ✅ Active | 12 | 🔴1.386 | 🟡0.511 | 🔴1.897 | 🔴0.916 | 🔴1.178 | 76.2 | 0.511 | 0.518 | 0.50 | **0.6745** |
| 7 | openai/gpt-4.1-mini | ✅ Active | 12 | 🔴1.386 | 🟡0.511 | 🔴1.897 | 🔴0.916 | 🔴1.178 | 76.2 | 0.511 | 0.518 | 0.50 | **0.6745** |
| 8 | openai/gpt-5-mini | ✅ Active | 12 | 🔴1.225 | 🟡0.626 | 🔴1.210 | 🔴1.653 | 🔴1.178 | 66.7 | 0.616 | 0.368 | 0.50 | **0.6507** |
| 9 | mistral/pixtral-12b-2409 | ✅ Active | 12 | 🔴1.386 | 🔴0.916 | 🔴1.897 | 🟡0.693 | 🔴1.223 | 57.1 | 0.693 | 0.463 | 0.50 | **0.5821** |
| 10 | openai/gpt-5-nano | ❌ P0 | 4 | 🔴1.312 | 🟡0.785 | 🔴1.626 | 🔴1.090 | 🔴1.203 | 61.9 | 0.877 | 0.439 | 0.50 | **0.5783** |
| 11 | google/gemini-2.5-pro | ✅ Active | 12 | 🔴2.707 | 🔴2.124 | 🟢0.213 | 🟢0.051 | 🔴1.274 | 52.4 | 0.051 | 1.259 | 0.50 | **0.5518** |
| 12 | anthropic/claude-3-5-haiku-latest | ✅ Active | 8 | 🔴1.769 | 🟡0.598 | 🔴1.897 | 🔴1.016 | 🔴1.320 | 47.6 | 0.598 | 0.548 | 0.50 | **0.5412** |
| 13 | anthropic/claude-3-7-sonnet-latest | ❌ P2 | 12 | 🔴1.164 | 🔴1.150 | 🔴1.678 | 🔴1.982 | 🔴1.494 | 42.9 | 0.433 | 0.722 | 0.50 | **0.5120** |
| 14 | xai/grok-4-fast-non-reasoning | ❌ P0 | 4 | 🔴1.211 | 🔴1.396 | 🔴1.626 | 🔴1.927 | 🔴1.540 | 38.1 | 1.153 | 0.322 | 0.50 | **0.4651** |
| 15 | anthropic/claude-3-5-sonnet-20241022 | ❌ P0 | 4 | 🔴1.267 | 🔴1.226 | 🔴1.799 | 🔴2.228 | 🔴1.630 | 33.3 | 0.867 | 0.761 | 0.50 | **0.4012** |
| 16 | google/gemini-2.0-flash | ❌ P0 | 4 | 🔴1.204 | 🔴1.386 | 🔴1.897 | 🔴2.303 | 🔴1.697 | 28.6 | 1.204 | 0.432 | 0.50 | **0.3973** |
| 17 | openai/gpt-4.1 | ❌ P0 | 4 | 🔴1.715 | 🔴2.040 | 🔴2.040 | 🔴2.120 | 🔴1.979 | 23.8 | 1.715 | 0.156 | 0.50 | **0.3568** |
| 18 | anthropic/claude-haiku-4-5 | ❌ P0 | 4 | 🔴2.474 | 🔴2.922 | 🔴1.493 | 🔴1.036 | 🔴1.981 | 19.0 | 1.022 | 0.762 | 0.50 | **0.3205** |
| 19 | mistral/ministral-3b-latest | ✅ Active | 12 | 🔴3.232 | 🔴4.364 | 🔴5.144 | 🟡0.606 | 🔴3.336 | 4.8 | 0.598 | 1.764 | 0.50 | **0.2794** |
| 20 | mistral/ministral-8b-latest | ❌ P0 | 4 | 🔴2.996 | 🔴2.996 | 🔴1.855 | 🔴2.649 | 🔴2.624 | 14.3 | 1.705 | 0.517 | 0.50 | **0.2479** |
| 21 | google/gemini-2.5-flash | ❌ P0 | 4 | 🔴2.470 | 🔴2.912 | 🔴3.379 | 🔴4.432 | 🔴3.298 | 9.5 | 2.451 | 0.758 | 0.50 | **0.1365** |

**Legend:**
- 🟢 Good (≤0.5) | 🟡 OK (≤0.8) | 🔴 Poor (>0.8)
- %Rank: Percentile rank (higher=better) | BestWin: Best rolling window avg (lower=better)
- Stabil: Std dev of log loss (lower=better) | TtP: Time-to-pivot ratio (lower=better)
- Score: Composite (40% rank + 30% bestWin⁻¹ + 20% stabil⁻¹ + 10% TtP⁻¹)

## Per-Horizon Rankings (All Models)

### 15m Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | google/gemini-3-pro-preview | 🟢0.1750 | ✅ Active |
| 2 | openai/gpt-5 | 🟢0.4452 | ✅ Active |
| 3 | anthropic/claude-sonnet-4-5 | 🔴1.0193 | ❌ P2 |
| 4 | anthropic/claude-3-7-sonnet-latest | 🔴1.1643 | ❌ P2 |
| 5 | google/gemini-2.5-flash-lite | 🔴1.2040 | ❌ P0 |
| 6 | google/gemini-2.0-flash | 🔴1.2040 | ❌ P0 |
| 7 | xai/grok-4-fast-non-reasoning | 🔴1.2110 | ❌ P0 |
| 8 | openai/gpt-5-mini | 🔴1.2249 | ✅ Active |
| 9 | anthropic/claude-3-5-sonnet-20241022 | 🔴1.2668 | ❌ P0 |
| 10 | openai/gpt-5-nano | 🔴1.3124 | ❌ P0 |

### 1h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | google/gemini-3-pro-preview | 🟢0.0876 | ✅ Active |
| 2 | openai/gpt-5 | 🟡0.5053 | ✅ Active |
| 3 | openai/gpt-4o-mini | 🟡0.5108 | ✅ Active |
| 4 | openai/gpt-4o | 🟡0.5108 | ✅ Active |
| 5 | openai/gpt-4.1-mini | 🟡0.5108 | ✅ Active |
| 6 | anthropic/claude-3-5-haiku-latest | 🟡0.5978 | ✅ Active |
| 7 | openai/gpt-5-mini | 🟡0.6256 | ✅ Active |
| 8 | openai/gpt-5-nano | 🟡0.7855 | ❌ P0 |
| 9 | mistral/pixtral-12b-2409 | 🔴0.9163 | ✅ Active |
| 10 | google/gemini-2.5-flash-lite | 🔴0.9163 | ❌ P0 |

### 4h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | google/gemini-3-pro-preview | 🟢0.0603 | ✅ Active |
| 2 | google/gemini-2.5-pro | 🟢0.2133 | ✅ Active |
| 3 | openai/gpt-5 | 🟡0.5798 | ✅ Active |
| 4 | anthropic/claude-sonnet-4-5 | 🔴0.8834 | ❌ P2 |
| 5 | google/gemini-2.5-flash-lite | 🔴0.9163 | ❌ P0 |
| 6 | openai/gpt-5-mini | 🔴1.2097 | ✅ Active |
| 7 | anthropic/claude-haiku-4-5 | 🔴1.4929 | ❌ P0 |
| 8 | openai/gpt-5-nano | 🔴1.6256 | ❌ P0 |
| 9 | xai/grok-4-fast-non-reasoning | 🔴1.6256 | ❌ P0 |
| 10 | anthropic/claude-3-7-sonnet-latest | 🔴1.6776 | ❌ P2 |

### 24h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | google/gemini-2.5-pro | 🟢0.0513 | ✅ Active |
| 2 | google/gemini-3-pro-preview | 🟢0.1149 | ✅ Active |
| 3 | mistral/ministral-3b-latest | 🟡0.6058 | ✅ Active |
| 4 | openai/gpt-5 | 🟡0.6271 | ✅ Active |
| 5 | mistral/pixtral-12b-2409 | 🟡0.6931 | ✅ Active |
| 6 | anthropic/claude-sonnet-4-5 | 🟡0.7236 | ❌ P2 |
| 7 | openai/gpt-4o-mini | 🔴0.9163 | ✅ Active |
| 8 | openai/gpt-4o | 🔴0.9163 | ✅ Active |
| 9 | openai/gpt-4.1-mini | 🔴0.9163 | ✅ Active |
| 10 | anthropic/claude-3-5-haiku-latest | 🔴1.0164 | ✅ Active |

## Eliminated Models

| Model | Phase | Reason |
|-------|-------|--------|
| anthropic/claude-haiku-4-5 | 0 | Failed sanity check on all horizons |
| anthropic/claude-sonnet-4-5 | 2 | no qualified horizons remaining |
| anthropic/claude-3-5-sonnet-20241022 | 0 | Failed sanity check on all horizons |
| anthropic/claude-3-7-sonnet-latest | 2 | no qualified horizons remaining |
| openai/gpt-4.1 | 0 | Failed sanity check on all horizons |
| openai/gpt-5-nano | 0 | Failed sanity check on all horizons |
| google/gemini-2.0-flash | 0 | Failed sanity check on all horizons |
| google/gemini-2.5-flash | 0 | Failed sanity check on all horizons |
| google/gemini-2.5-flash-lite | 0 | Failed sanity check on all horizons |
| xai/grok-2-vision | 0 | Failed sanity check on all horizons |
| xai/grok-4-fast-non-reasoning | 0 | Failed sanity check on all horizons |
| mistral/pixtral-large-latest | 0 | Failed sanity check on all horizons |
| mistral/ministral-8b-latest | 0 | Failed sanity check on all horizons |

## Model Failures

| Model | Failed Rounds |
|-------|---------------|
| anthropic/claude-3-5-haiku-latest | 1, 2, 6, 9 |
| xai/grok-2-vision | 1, 2, 3, 4 |
| mistral/pixtral-large-latest | 1, 2, 3, 4 |

---
*Auto-generated by agent_006 benchmark*