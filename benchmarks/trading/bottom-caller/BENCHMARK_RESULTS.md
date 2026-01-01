# agent_006 Benchmark Results

**Symbol:** COINBASE_SPOT_BTC_USD
**Start Time:** 2025-12-26T17:00:00.000Z
**Progress:** Round 12/12 (Phase 3)
**Last Updated:** 2026-01-01T16:22:34.416Z

## Summary

- **Active Models:** 17
- **Eliminated:** 11
- **Models with Failures:** 1

## Arena Results by Horizon

### 15m Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | google/gemini-2.5-flash | 0.90 | 🟢0.09 | 0.08 | 0.000 |
| 🥈 | anthropic/claude-haiku-4-5 | 0.73 | 🟢0.13 | 0.13 | 0.000 |
| 🥉 | openai/gpt-4.1 | 0.45 | 🟢0.20 | 0.20 | 0.000 |
| 4 | anthropic/claude-opus-4-5 | 0.10 | 🟢0.29 | 0.29 | 0.000 |
| 5 | anthropic/claude-3-5-sonnet-20241022 | 0.10 | 🟢0.29 | 0.29 | 0.000 |
| 6 | anthropic/claude-3-5-haiku-latest | 0.10 | 🟢0.29 | 0.29 | 0.000 |
| 7 | openai/gpt-4o | 0.10 | 🟢0.29 | 0.29 | 0.000 |
| 8 | openai/gpt-4o-mini | 0.10 | 🟢0.29 | 0.29 | 0.000 |

### 1h Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | openai/gpt-5-mini | 0.85 | 🟡0.67 | 0.64 | 0.001 |
| 🥈 | google/gemini-2.5-flash-lite | 0.15 | 🟡0.77 | 0.58 | 0.020 |
| 🥉 | xai/grok-4-fast-non-reasoning | 0.15 | 🟡0.69 | 0.58 | 0.010 |

### 4h Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | openai/gpt-5 | 0.50 | 🟡0.60 | 0.60 | 0.000 |

### 24h Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | openai/gpt-5 | 0.85 | 🟡0.67 | 0.63 | 0.001 |
| 🥈 | anthropic/claude-3-7-sonnet-latest | 0.57 | 🟡0.72 | 0.64 | 0.004 |
| 🥉 | xai/grok-4-fast-non-reasoning | 0.48 | 🟡0.77 | 0.62 | 0.012 |
| 4 | openai/gpt-5.2 | 0.37 | 🟡0.74 | 0.65 | 0.005 |
| 5 | anthropic/claude-opus-4-5 | 0.19 | 🟡0.78 | 0.65 | 0.010 |
| 6 | anthropic/claude-3-5-sonnet-20241022 | 0.19 | 🟡0.78 | 0.65 | 0.010 |
| 7 | anthropic/claude-3-5-haiku-latest | 0.19 | 🟡0.78 | 0.65 | 0.010 |
| 8 | openai/gpt-4o | 0.19 | 🟡0.78 | 0.65 | 0.010 |

## Cross-Horizon Strength

*Models appearing in multiple horizon arenas demonstrate consistent performance.*

| Model | Arenas | Horizons | Avg Rank |
|-------|--------|----------|----------|
| openai/gpt-5 | 2/4 | 4h, 24h | 1.0 |
| xai/grok-4-fast-non-reasoning | 2/4 | 1h, 24h | 3.0 |
| anthropic/claude-opus-4-5 | 2/4 | 15m, 24h | 4.5 |
| anthropic/claude-3-5-sonnet-20241022 | 2/4 | 15m, 24h | 5.5 |
| anthropic/claude-3-5-haiku-latest | 2/4 | 15m, 24h | 6.5 |
| openai/gpt-4o | 2/4 | 15m, 24h | 7.5 |

**Legend:** ⭐ = Top performer across all horizons

## Full Results (All Models)

| Rank | Model | Status | Rnds | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|------|-------|--------|------|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| 🥇 | mistral/pixtral-12b-2409 | ❌ P2 | 12 | 🟢0.420 | 🟡0.710 | 🟢0.479 | 🟡0.682 | 🟡0.573 | 100.0 | 0.261 | 0.279 | 0.42 | **0.8628** |
| 🥈 | anthropic/claude-3-7-sonnet-latest | ✅ Active | 12 | 🟢0.183 | 🔴0.860 | 🔴1.005 | 🟡0.720 | 🟡0.692 | 92.9 | 0.163 | 0.415 | 0.42 | **0.8219** |
| 🥉 | google/gemini-2.5-flash-lite | ✅ Active | 12 | 🟢0.288 | 🟡0.769 | 🔴0.958 | 🔴0.857 | 🟡0.718 | 89.3 | 0.288 | 0.367 | 0.42 | **0.7985** |
| 4 | mistral/pixtral-large-latest | ❌ P2 | 12 | 🟢0.351 | 🟡0.724 | 🔴0.916 | 🔴0.909 | 🟡0.725 | 85.7 | 0.311 | 0.307 | 0.42 | **0.7927** |
| 5 | openai/gpt-5 | ✅ Active | 12 | 🔴1.022 | 🟡0.714 | 🟡0.598 | 🟡0.675 | 🟡0.752 | 82.1 | 0.511 | 0.192 | 0.42 | **0.7712** |
| 6 | google/gemini-2.5-pro | ❌ P2 | 12 | 🟢0.376 | 🔴1.030 | 🟢0.105 | 🔴1.033 | 🟡0.636 | 96.4 | 0.051 | 0.933 | 0.42 | **0.7493** |
| 7 | openai/gpt-5-mini | ✅ Active | 12 | 🟢0.351 | 🟡0.674 | 🔴1.140 | 🔴1.244 | 🔴0.852 | 78.6 | 0.334 | 0.481 | 0.42 | **0.7259** |
| 8 | openai/gpt-5.2 | ✅ Active | 12 | 🟢0.316 | 🟡0.699 | 🔴1.671 | 🟡0.745 | 🔴0.858 | 75.0 | 0.306 | 0.508 | 0.42 | **0.7103** |
| 9 | anthropic/claude-sonnet-4-5 | ❌ P2 | 12 | 🟢0.333 | 🟡0.760 | 🔴1.388 | 🔴1.134 | 🔴0.904 | 67.9 | 0.275 | 0.533 | 0.42 | **0.6814** |
| 10 | anthropic/claude-haiku-4-5 | ✅ Active | 12 | 🟢0.128 | 🔴1.251 | 🔴1.386 | 🔴0.804 | 🔴0.892 | 71.4 | 0.094 | 0.768 | 0.42 | **0.6758** |
| 11 | xai/grok-4-fast-non-reasoning | ✅ Active | 12 | 🟢0.293 | 🟡0.695 | 🔴1.873 | 🟡0.768 | 🔴0.907 | 64.3 | 0.288 | 0.605 | 0.42 | **0.6508** |
| 12 | anthropic/claude-opus-4-5 | ✅ Active | 12 | 🟢0.288 | 🟡0.714 | 🔴1.897 | 🟡0.781 | 🔴0.920 | 60.7 | 0.288 | 0.611 | 0.42 | **0.6353** |
| 13 | anthropic/claude-3-5-sonnet-20241022 | ✅ Active | 12 | 🟢0.288 | 🟡0.714 | 🔴1.897 | 🟡0.781 | 🔴0.920 | 60.7 | 0.288 | 0.611 | 0.42 | **0.6353** |
| 14 | anthropic/claude-3-5-haiku-latest | ✅ Active | 12 | 🟢0.288 | 🟡0.714 | 🔴1.897 | 🟡0.781 | 🔴0.920 | 60.7 | 0.288 | 0.611 | 0.42 | **0.6353** |
| 15 | openai/gpt-4o | ✅ Active | 12 | 🟢0.288 | 🟡0.714 | 🔴1.897 | 🟡0.781 | 🔴0.920 | 60.7 | 0.288 | 0.611 | 0.42 | **0.6353** |
| 16 | openai/gpt-4o-mini | ✅ Active | 12 | 🟢0.288 | 🟡0.714 | 🔴1.897 | 🟡0.781 | 🔴0.920 | 60.7 | 0.288 | 0.611 | 0.42 | **0.6353** |
| 17 | openai/gpt-4.1-mini | ✅ Active | 12 | 🟢0.288 | 🟡0.714 | 🔴1.897 | 🟡0.781 | 🔴0.920 | 60.7 | 0.288 | 0.611 | 0.42 | **0.6353** |
| 18 | openai/gpt-5-nano | ✅ Active | 12 | 🟢0.288 | 🟡0.714 | 🔴1.897 | 🟡0.781 | 🔴0.920 | 60.7 | 0.288 | 0.611 | 0.42 | **0.6353** |
| 19 | xai/grok-2-vision | ✅ Active | 12 | 🟢0.288 | 🟡0.714 | 🔴1.897 | 🟡0.781 | 🔴0.920 | 60.7 | 0.288 | 0.611 | 0.42 | **0.6353** |
| 20 | mistral/ministral-3b-latest | ❌ P2 | 11 | 🟢0.109 | 🔴0.967 | 🔴1.813 | 🔴0.890 | 🔴0.945 | 32.1 | 0.083 | 0.801 | 0.42 | **0.5140** |
| 21 | google/gemini-2.0-flash | ❌ P2 | 12 | 🟢0.357 | 🔴0.837 | 🔴1.897 | 🔴1.570 | 🔴1.165 | 28.6 | 0.105 | 0.842 | 0.42 | **0.4879** |
| 22 | openai/gpt-4.1 | ✅ Active | 12 | 🟢0.198 | 🔴1.090 | 🔴2.040 | 🔴1.456 | 🔴1.196 | 25.0 | 0.128 | 0.945 | 0.42 | **0.4496** |
| 23 | xai/grok-4.1-fast-reasoning | ❌ P2 | 12 | 🟢0.072 | 🔴0.977 | 🔴2.683 | 🔴1.374 | 🔴1.276 | 21.4 | 0.027 | 1.114 | 0.42 | **0.4394** |
| 24 | perplexity/sonar-pro | ❌ P2 | 12 | 🟢0.163 | 🔴0.992 | 🔴3.111 | 🔴1.101 | 🔴1.342 | 17.9 | 0.124 | 1.200 | 0.42 | **0.4106** |
| 25 | mistral/ministral-8b-latest | ❌ P2 | 12 | 🟢0.074 | 🔴1.324 | 🔴2.317 | 🔴2.046 | 🔴1.440 | 14.3 | 0.051 | 1.342 | 0.42 | **0.4072** |
| 26 | xai/grok-4 | ❌ P2 | 12 | 🟢0.103 | 🔴1.194 | 🔴3.461 | 🔴1.008 | 🔴1.441 | 10.7 | 0.044 | 1.409 | 0.42 | **0.3940** |
| 27 | google/gemini-3-pro-preview | ❌ P0 | 4 | 🔴2.303 | 🔴2.260 | 🟢0.051 | 🔴2.303 | 🔴1.729 | 7.1 | 0.051 | 1.160 | 0.36 | **0.3852** |
| 28 | google/gemini-2.5-flash | ✅ Active | 12 | 🟢0.085 | 🔴1.495 | 🔴3.464 | 🔴3.074 | 🔴2.030 | 3.6 | 0.010 | 1.872 | 0.42 | **0.3706** |

**Legend:**
- 🟢 Good (≤0.5) | 🟡 OK (≤0.8) | 🔴 Poor (>0.8)
- %Rank: Percentile rank (higher=better) | BestWin: Best rolling window avg (lower=better)
- Stabil: Std dev of log loss (lower=better) | TtP: Time-to-pivot ratio (lower=better)
- Score: Composite (40% rank + 30% bestWin⁻¹ + 20% stabil⁻¹ + 10% TtP⁻¹)

## Per-Horizon Rankings (All Models)

### 15m Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | xai/grok-4.1-fast-reasoning | 🟢0.0721 | ❌ P2 |
| 2 | mistral/ministral-8b-latest | 🟢0.0741 | ❌ P2 |
| 3 | google/gemini-2.5-flash | 🟢0.0852 | ✅ Active |
| 4 | xai/grok-4 | 🟢0.1029 | ❌ P2 |
| 5 | mistral/ministral-3b-latest | 🟢0.1093 | ❌ P2 |
| 6 | anthropic/claude-haiku-4-5 | 🟢0.1278 | ✅ Active |
| 7 | perplexity/sonar-pro | 🟢0.1631 | ❌ P2 |
| 8 | anthropic/claude-3-7-sonnet-latest | 🟢0.1827 | ✅ Active |
| 9 | openai/gpt-4.1 | 🟢0.1985 | ✅ Active |
| 10 | google/gemini-2.5-flash-lite | 🟢0.2877 | ✅ Active |

### 1h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | openai/gpt-5-mini | 🟡0.6742 | ✅ Active |
| 2 | xai/grok-4-fast-non-reasoning | 🟡0.6950 | ✅ Active |
| 3 | openai/gpt-5.2 | 🟡0.6993 | ✅ Active |
| 4 | mistral/pixtral-12b-2409 | 🟡0.7102 | ❌ P2 |
| 5 | openai/gpt-5 | 🟡0.7136 | ✅ Active |
| 6 | anthropic/claude-opus-4-5 | 🟡0.7136 | ✅ Active |
| 7 | anthropic/claude-3-5-sonnet-20241022 | 🟡0.7136 | ✅ Active |
| 8 | anthropic/claude-3-5-haiku-latest | 🟡0.7136 | ✅ Active |
| 9 | openai/gpt-4o | 🟡0.7136 | ✅ Active |
| 10 | openai/gpt-4o-mini | 🟡0.7136 | ✅ Active |

### 4h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | google/gemini-3-pro-preview | 🟢0.0513 | ❌ P0 |
| 2 | google/gemini-2.5-pro | 🟢0.1054 | ❌ P2 |
| 3 | mistral/pixtral-12b-2409 | 🟢0.4790 | ❌ P2 |
| 4 | openai/gpt-5 | 🟡0.5978 | ✅ Active |
| 5 | mistral/pixtral-large-latest | 🔴0.9163 | ❌ P2 |
| 6 | google/gemini-2.5-flash-lite | 🔴0.9576 | ✅ Active |
| 7 | anthropic/claude-3-7-sonnet-latest | 🔴1.0053 | ✅ Active |
| 8 | openai/gpt-5-mini | 🔴1.1395 | ✅ Active |
| 9 | anthropic/claude-haiku-4-5 | 🔴1.3863 | ✅ Active |
| 10 | anthropic/claude-sonnet-4-5 | 🔴1.3879 | ❌ P2 |

### 24h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | openai/gpt-5 | 🟡0.6749 | ✅ Active |
| 2 | mistral/pixtral-12b-2409 | 🟡0.6821 | ❌ P2 |
| 3 | anthropic/claude-3-7-sonnet-latest | 🟡0.7197 | ✅ Active |
| 4 | openai/gpt-5.2 | 🟡0.7448 | ✅ Active |
| 5 | xai/grok-4-fast-non-reasoning | 🟡0.7683 | ✅ Active |
| 6 | anthropic/claude-opus-4-5 | 🟡0.7811 | ✅ Active |
| 7 | anthropic/claude-3-5-sonnet-20241022 | 🟡0.7811 | ✅ Active |
| 8 | anthropic/claude-3-5-haiku-latest | 🟡0.7811 | ✅ Active |
| 9 | openai/gpt-4o | 🟡0.7811 | ✅ Active |
| 10 | openai/gpt-4o-mini | 🟡0.7811 | ✅ Active |

## Eliminated Models

| Model | Phase | Reason |
|-------|-------|--------|
| anthropic/claude-sonnet-4-5 | 2 | no qualified horizons remaining |
| google/gemini-2.0-flash | 2 | no qualified horizons remaining |
| google/gemini-2.5-pro | 2 | no qualified horizons remaining |
| google/gemini-3-pro-preview | 0 | Failed sanity check on all horizons |
| xai/grok-4.1-fast-reasoning | 2 | no qualified horizons remaining |
| xai/grok-4 | 2 | no qualified horizons remaining |
| mistral/pixtral-large-latest | 2 | no qualified horizons remaining |
| mistral/pixtral-12b-2409 | 2 | no qualified horizons remaining |
| mistral/ministral-3b-latest | 2 | no qualified horizons remaining |
| mistral/ministral-8b-latest | 2 | no qualified horizons remaining |
| perplexity/sonar-pro | 2 | no qualified horizons remaining |

## Model Failures

| Model | Failed Rounds |
|-------|---------------|
| mistral/ministral-3b-latest | 12 |

---
*Auto-generated by agent_006 benchmark*