# agent_006 Benchmark Results

**Symbol:** COINBASE_SPOT_BTC_USD
**Start Time:** 2025-12-26T17:00:00.000Z
**Progress:** Round 2/12 (Phase 0)
**Last Updated:** 2026-01-01T15:38:39.268Z

## Summary

- **Active Models:** 28
- **Eliminated:** 0
- **Models with Failures:** 17

## Full Results (All Models)

| Rank | Model | Status | Rnds | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|------|-------|--------|------|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| 🥇 | anthropic/claude-3-7-sonnet-latest | ✅ Active | 2 | 🟢0.255 | 🔴1.060 | 🔴1.407 | 🟡0.511 | 🔴0.808 | 100.0 | 0.572 | 0.519 | 0.41 | **0.7696** |
| 🥈 | anthropic/claude-haiku-4-5 | ✅ Active | 2 | 🟢0.322 | 🔴0.805 | 🔴1.642 | 🟡0.511 | 🔴0.820 | 90.9 | 0.446 | 0.524 | 0.41 | **0.7512** |
| 🥉 | anthropic/claude-opus-4-5 | ✅ Active | 2 | 🟢0.268 | 🟡0.714 | 🔴1.897 | 🟡0.511 | 🔴0.847 | 81.8 | 0.349 | 0.634 | 0.41 | **0.7072** |
| 4 | anthropic/claude-3-5-sonnet-20241022 | ✅ Active | 2 | 🟢0.288 | 🟡0.714 | 🔴1.897 | 🟡0.511 | 🔴0.852 | 72.7 | 0.362 | 0.630 | 0.41 | **0.6698** |
| 5 | anthropic/claude-3-5-haiku-latest | ✅ Active | 2 | 🟢0.288 | 🟡0.714 | 🔴1.897 | 🟡0.511 | 🔴0.852 | 72.7 | 0.362 | 0.630 | 0.41 | **0.6698** |
| 6 | openai/gpt-4o | ✅ Active | 2 | 🟢0.288 | 🟡0.714 | 🔴1.897 | 🟡0.511 | 🔴0.852 | 72.7 | 0.362 | 0.630 | 0.41 | **0.6698** |
| 7 | openai/gpt-4o-mini | ✅ Active | 2 | 🟢0.288 | 🟡0.714 | 🔴1.897 | 🟡0.511 | 🔴0.852 | 72.7 | 0.362 | 0.630 | 0.41 | **0.6698** |
| 8 | openai/gpt-4.1-mini | ✅ Active | 2 | 🟢0.288 | 🟡0.714 | 🔴1.897 | 🟡0.511 | 🔴0.852 | 72.7 | 0.362 | 0.630 | 0.41 | **0.6698** |
| 9 | openai/gpt-5.2 | ✅ Active | 2 | 🟢0.301 | 🟡0.701 | 🔴1.932 | 🟡0.511 | 🔴0.861 | 27.3 | 0.371 | 0.641 | 0.41 | **0.4844** |
| 10 | anthropic/claude-sonnet-4-5 | ✅ Active | 2 | 🟢0.288 | 🟡0.763 | 🔴1.897 | 🟡0.528 | 🔴0.869 | 9.1 | 0.572 | 0.645 | 0.41 | **0.3808** |
| 11 | openai/gpt-4.1 | ✅ Active | 2 | 🟢0.198 | 🔴1.090 | 🔴2.040 | 🟢0.128 | 🔴0.864 | 18.2 | 0.765 | 0.911 | 0.41 | **0.3349** |

**Legend:**
- 🟢 Good (≤0.5) | 🟡 OK (≤0.8) | 🔴 Poor (>0.8)
- %Rank: Percentile rank (higher=better) | BestWin: Best rolling window avg (lower=better)
- Stabil: Std dev of log loss (lower=better) | TtP: Time-to-pivot ratio (lower=better)
- Score: Composite (40% rank + 30% bestWin⁻¹ + 20% stabil⁻¹ + 10% TtP⁻¹)

## Per-Horizon Rankings (All Models)

### 15m Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | openai/gpt-4.1 | 🟢0.1985 | ✅ Active |
| 2 | anthropic/claude-3-7-sonnet-latest | 🟢0.2554 | ✅ Active |
| 3 | anthropic/claude-opus-4-5 | 🟢0.2681 | ✅ Active |
| 4 | anthropic/claude-3-5-sonnet-20241022 | 🟢0.2877 | ✅ Active |
| 5 | anthropic/claude-3-5-haiku-latest | 🟢0.2877 | ✅ Active |
| 6 | openai/gpt-4o | 🟢0.2877 | ✅ Active |
| 7 | openai/gpt-4o-mini | 🟢0.2877 | ✅ Active |
| 8 | openai/gpt-4.1-mini | 🟢0.2877 | ✅ Active |
| 9 | anthropic/claude-sonnet-4-5 | 🟢0.2877 | ✅ Active |
| 10 | openai/gpt-5.2 | 🟢0.3012 | ✅ Active |

### 1h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | openai/gpt-5.2 | 🟡0.7012 | ✅ Active |
| 2 | anthropic/claude-opus-4-5 | 🟡0.7136 | ✅ Active |
| 3 | anthropic/claude-3-5-sonnet-20241022 | 🟡0.7136 | ✅ Active |
| 4 | anthropic/claude-3-5-haiku-latest | 🟡0.7136 | ✅ Active |
| 5 | openai/gpt-4o | 🟡0.7136 | ✅ Active |
| 6 | openai/gpt-4o-mini | 🟡0.7136 | ✅ Active |
| 7 | openai/gpt-4.1-mini | 🟡0.7136 | ✅ Active |
| 8 | anthropic/claude-sonnet-4-5 | 🟡0.7625 | ✅ Active |
| 9 | anthropic/claude-haiku-4-5 | 🔴0.8047 | ✅ Active |
| 10 | anthropic/claude-3-7-sonnet-latest | 🔴1.0601 | ✅ Active |

### 4h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | anthropic/claude-3-7-sonnet-latest | 🔴1.4067 | ✅ Active |
| 2 | anthropic/claude-haiku-4-5 | 🔴1.6417 | ✅ Active |
| 3 | anthropic/claude-opus-4-5 | 🔴1.8971 | ✅ Active |
| 4 | anthropic/claude-3-5-sonnet-20241022 | 🔴1.8971 | ✅ Active |
| 5 | anthropic/claude-3-5-haiku-latest | 🔴1.8971 | ✅ Active |
| 6 | openai/gpt-4o | 🔴1.8971 | ✅ Active |
| 7 | openai/gpt-4o-mini | 🔴1.8971 | ✅ Active |
| 8 | openai/gpt-4.1-mini | 🔴1.8971 | ✅ Active |
| 9 | anthropic/claude-sonnet-4-5 | 🔴1.8971 | ✅ Active |
| 10 | openai/gpt-5.2 | 🔴1.9316 | ✅ Active |

### 24h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | openai/gpt-4.1 | 🟢0.1278 | ✅ Active |
| 2 | anthropic/claude-3-7-sonnet-latest | 🟡0.5108 | ✅ Active |
| 3 | anthropic/claude-haiku-4-5 | 🟡0.5108 | ✅ Active |
| 4 | anthropic/claude-opus-4-5 | 🟡0.5108 | ✅ Active |
| 5 | anthropic/claude-3-5-sonnet-20241022 | 🟡0.5108 | ✅ Active |
| 6 | anthropic/claude-3-5-haiku-latest | 🟡0.5108 | ✅ Active |
| 7 | openai/gpt-4o | 🟡0.5108 | ✅ Active |
| 8 | openai/gpt-4o-mini | 🟡0.5108 | ✅ Active |
| 9 | openai/gpt-4.1-mini | 🟡0.5108 | ✅ Active |
| 10 | openai/gpt-5.2 | 🟡0.5108 | ✅ Active |

## Model Failures

| Model | Failed Rounds |
|-------|---------------|
| openai/gpt-5 | 1, 2 |
| openai/gpt-5-mini | 1, 2 |
| openai/gpt-5-nano | 1, 2 |
| google/gemini-2.0-flash | 1, 2 |
| google/gemini-2.5-flash | 1, 2 |
| google/gemini-2.5-flash-lite | 1, 2 |
| google/gemini-2.5-pro | 1, 2 |
| google/gemini-3-pro-preview | 1, 2 |
| xai/grok-2-vision | 1, 2 |
| xai/grok-4-fast-non-reasoning | 1, 2 |
| xai/grok-4.1-fast-reasoning | 1, 2 |
| xai/grok-4 | 1, 2 |
| mistral/pixtral-large-latest | 1, 2 |
| mistral/pixtral-12b-2409 | 1, 2 |
| mistral/ministral-3b-latest | 1, 2 |
| mistral/ministral-8b-latest | 1, 2 |
| perplexity/sonar-pro | 1, 2 |

---
*Auto-generated by agent_006 benchmark*