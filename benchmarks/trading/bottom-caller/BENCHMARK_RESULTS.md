# agent_006 Benchmark Results

**Symbol:** COINBASE_SPOT_BTC_USD
**Start Time:** 2025-12-26T17:00:00.000Z
**Progress:** Round 12/12 (Phase 3)
**Last Updated:** 2026-01-03T01:19:41.669Z

## Summary

- **Active Models:** 16
- **Eliminated:** 12
- **Models with Failures:** 8

## Arena Results by Horizon

### 15m Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | mistral/ministral-8b-latest | 0.85 | 🟢0.09 | 0.06 | 0.000 |
| 🥈 | mistral/ministral-3b-latest | 0.72 | 🟢0.26 | 0.00 | 0.000 |
| 🥉 | google/gemini-3-pro-preview | 0.68 | 🟢0.16 | 0.12 | 0.000 |
| 4 | openai/gpt-4o | 0.57 | 🟢0.36 | 0.00 | 0.000 |
| 5 | perplexity/sonar-pro | 0.49 | 🟢0.24 | 0.23 | 0.000 |
| 6 | xai/grok-4 | 0.46 | 🟢0.21 | 0.17 | 0.001 |
| 7 | anthropic/claude-opus-4-5 | 0.41 | 🟢0.27 | 0.24 | 0.000 |
| 8 | anthropic/claude-sonnet-4-5 | 0.35 | 🟢0.33 | 0.32 | 0.000 |

### 1h Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | mistral/ministral-8b-latest | 0.94 | 🟢0.09 | 0.08 | 0.000 |
| 🥈 | mistral/ministral-3b-latest | 0.81 | 🟢0.27 | 0.00 | 0.000 |
| 🥉 | perplexity/sonar-pro | 0.54 | 🟢0.31 | 0.29 | 0.000 |
| 4 | google/gemini-3-pro-preview | 0.50 | 🟢0.30 | 0.22 | 0.002 |
| 5 | openai/gpt-4o | 0.50 | 🟡0.71 | 0.00 | 0.000 |
| 6 | anthropic/claude-opus-4-5 | 0.43 | 🟢0.38 | 0.35 | 0.000 |
| 7 | anthropic/claude-sonnet-4-5 | 0.42 | 🟢0.38 | 0.37 | 0.000 |
| 8 | anthropic/claude-3-5-haiku-latest | 0.38 | 🟢0.38 | 0.29 | 0.002 |

### 4h Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | mistral/ministral-8b-latest | 0.87 | 🟢0.18 | 0.17 | 0.000 |
| 🥈 | mistral/ministral-3b-latest | 0.50 | 🔴0.89 | 0.00 | 0.000 |
| 🥉 | anthropic/claude-3-5-haiku-latest | 0.40 | 🟢0.40 | 0.40 | 0.001 |
| 4 | perplexity/sonar-pro | 0.26 | 🟢0.43 | 0.31 | 0.008 |
| 5 | xai/grok-2-vision | 0.10 | 🟢0.49 | 0.40 | 0.010 |
| 6 | xai/grok-4.1-fast-reasoning | 0.00 | 🟡0.57 | 0.43 | 0.010 |

### 24h Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | google/gemini-3-pro-preview | 0.98 | 🟢0.24 | 0.19 | 0.001 |
| 🥈 | mistral/ministral-8b-latest | 0.94 | 🟢0.26 | 0.23 | 0.000 |
| 🥉 | openai/gpt-4.1-mini | 0.64 | 🟢0.34 | 0.37 | 0.001 |
| 4 | anthropic/claude-3-5-haiku-latest | 0.00 | 🟡0.53 | 0.49 | 0.003 |
| 5 | xai/grok-4.1-fast-reasoning | 0.00 | 🟡0.68 | 0.58 | 0.004 |

## Cross-Horizon Strength

*Models appearing in multiple horizon arenas demonstrate consistent performance.*

| Model | Arenas | Horizons | Avg Rank |
|-------|--------|----------|----------|
| ⭐ mistral/ministral-8b-latest | 4/4 | 15m, 1h, 4h, 24h | 1.3 |
| mistral/ministral-3b-latest | 3/4 | 15m, 1h, 4h | 2.0 |
| google/gemini-3-pro-preview | 3/4 | 15m, 1h, 24h | 2.7 |
| perplexity/sonar-pro | 3/4 | 15m, 1h, 4h | 4.0 |
| anthropic/claude-3-5-haiku-latest | 3/4 | 1h, 4h, 24h | 5.0 |
| openai/gpt-4o | 2/4 | 15m, 1h | 4.5 |
| xai/grok-4.1-fast-reasoning | 2/4 | 4h, 24h | 5.5 |
| anthropic/claude-opus-4-5 | 2/4 | 15m, 1h | 6.5 |
| anthropic/claude-sonnet-4-5 | 2/4 | 15m, 1h | 7.5 |

**Legend:** ⭐ = Top performer across all horizons

## Full Results (All Models)

| Rank | Model | Status | Rnds | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|------|-------|--------|------|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| 🥇 | mistral/ministral-8b-latest | ✅ Active | 12 | 🟢0.086 | 🟢0.090 | 🟢0.184 | 🟢0.255 | 🟢0.154 | 100.0 | 0.051 | 0.091 | 0.50 | **0.9241** |
| 🥈 | google/gemini-3-pro-preview | ✅ Active | 12 | 🟢0.160 | 🟢0.304 | 🟡0.542 | 🟢0.242 | 🟢0.312 | 95.7 | 0.087 | 0.248 | 0.50 | **0.8698** |
| 🥉 | anthropic/claude-3-5-haiku-latest | ✅ Active | 12 | 🟢0.368 | 🟢0.376 | 🟢0.404 | 🟡0.528 | 🟢0.419 | 91.3 | 0.247 | 0.221 | 0.50 | **0.8339** |
| 4 | perplexity/sonar-pro | ✅ Active | 12 | 🟢0.241 | 🟢0.313 | 🟢0.434 | 🔴0.828 | 🟢0.454 | 87.0 | 0.204 | 0.387 | 0.50 | **0.7897** |
| 5 | xai/grok-4.1-fast-reasoning | ✅ Active | 12 | 🟢0.254 | 🟢0.487 | 🟡0.567 | 🟡0.680 | 🟢0.497 | 78.3 | 0.117 | 0.386 | 0.50 | **0.7683** |
| 6 | xai/grok-2-vision | ✅ Active | 12 | 🟢0.356 | 🟢0.372 | 🟢0.495 | 🟡0.729 | 🟢0.488 | 82.6 | 0.224 | 0.395 | 0.50 | **0.7677** |
| 7 | anthropic/claude-opus-4-5 | ✅ Active | 12 | 🟢0.271 | 🟢0.376 | 🟡0.629 | 🔴0.953 | 🟡0.557 | 73.9 | 0.224 | 0.294 | 0.50 | **0.7532** |
| 8 | openai/gpt-4.1-mini | ✅ Active | 9 | 🟢0.470 | 🟡0.706 | 🔴0.826 | 🟢0.337 | 🟡0.585 | 69.6 | 0.143 | 0.596 | 0.50 | **0.6876** |
| 9 | xai/grok-4 | ✅ Active | 12 | 🟢0.214 | 🟢0.365 | 🟡0.733 | 🔴1.085 | 🟡0.599 | 65.2 | 0.143 | 0.536 | 0.50 | **0.6822** |
| 10 | xai/grok-4-fast-non-reasoning | ✅ Active | 12 | 🟢0.443 | 🟡0.552 | 🟡0.711 | 🔴0.903 | 🟡0.652 | 60.9 | 0.269 | 0.426 | 0.50 | **0.6679** |
| 11 | openai/gpt-5.2 | ✅ Active | 12 | 🟢0.438 | 🟡0.654 | 🟡0.775 | 🔴0.913 | 🟡0.695 | 52.2 | 0.323 | 0.245 | 0.50 | **0.6612** |
| 12 | openai/gpt-4.1 | ✅ Active | 12 | 🟢0.367 | 🟡0.516 | 🔴0.856 | 🔴1.073 | 🟡0.703 | 47.8 | 0.232 | 0.401 | 0.50 | **0.6264** |
| 13 | mistral/ministral-3b-latest | ✅ Active | 2 | 🟢0.260 | 🟢0.268 | 🔴0.886 | 🔴1.295 | 🟡0.677 | 56.5 | 0.233 | 0.765 | 0.50 | **0.5881** |
| 14 | openai/gpt-4o | ✅ Active | 2 | 🟢0.357 | 🟡0.714 | 🔴0.983 | 🔴0.949 | 🟡0.750 | 43.5 | 0.408 | 0.428 | 0.50 | **0.5771** |
| 15 | anthropic/claude-sonnet-4-5 | ✅ Active | 12 | 🟢0.326 | 🟢0.381 | 🔴1.046 | 🔴1.353 | 🟡0.777 | 39.1 | 0.315 | 0.444 | 0.50 | **0.5705** |
| 16 | mistral/pixtral-large-latest | ❌ P2 | 12 | 🟢0.403 | 🟡0.622 | 🔴1.010 | 🔴1.297 | 🔴0.833 | 34.8 | 0.203 | 0.658 | 0.50 | **0.5271** |
| 17 | google/gemini-2.5-pro | ❌ P2 | 12 | 🟢0.445 | 🔴0.889 | 🔴1.136 | 🔴0.937 | 🔴0.852 | 30.4 | 0.183 | 0.703 | 0.50 | **0.5037** |
| 18 | google/gemini-2.0-flash | ❌ P0 | 4 | 🟡0.780 | 🔴1.076 | 🟡0.785 | 🔴0.867 | 🔴0.877 | 26.1 | 0.511 | 0.404 | 0.50 | **0.4969** |
| 19 | anthropic/claude-haiku-4-5 | ❌ P2 | 12 | 🟢0.404 | 🔴1.052 | 🔴1.138 | 🔴1.119 | 🔴0.928 | 17.4 | 0.315 | 0.455 | 0.50 | **0.4813** |
| 20 | google/gemini-2.5-flash-lite | ❌ P2 | 12 | 🟡0.748 | 🔴0.997 | 🔴0.920 | 🔴0.852 | 🔴0.879 | 21.7 | 0.349 | 0.677 | 0.50 | **0.4493** |
| 21 | anthropic/claude-3-5-sonnet-20241022 | ✅ Active | 12 | 🟢0.400 | 🔴1.083 | 🔴1.342 | 🔴1.573 | 🔴1.099 | 13.0 | 0.334 | 0.529 | 0.50 | **0.4464** |
| 22 | anthropic/claude-3-7-sonnet-latest | ❌ P0 | 4 | 🔴0.982 | 🔴1.508 | 🔴1.396 | 🔴0.994 | 🔴1.220 | 8.7 | 0.693 | 0.516 | 0.50 | **0.3777** |
| 23 | google/gemini-2.5-flash | ❌ P2 | 12 | 🟢0.379 | 🟡0.714 | 🔴4.124 | 🔴0.833 | 🔴1.512 | 4.3 | 0.124 | 4.851 | 0.50 | **0.3487** |

**Legend:**
- 🟢 Good (≤0.5) | 🟡 OK (≤0.8) | 🔴 Poor (>0.8)
- %Rank: Percentile rank (higher=better) | BestWin: Best rolling window avg (lower=better)
- Stabil: Std dev of log loss (lower=better) | TtP: Time-to-pivot ratio (lower=better)
- Score: Composite (40% rank + 30% bestWin⁻¹ + 20% stabil⁻¹ + 10% TtP⁻¹)

## Per-Horizon Rankings (All Models)

### 15m Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | mistral/ministral-8b-latest | 🟢0.0860 | ✅ Active |
| 2 | google/gemini-3-pro-preview | 🟢0.1604 | ✅ Active |
| 3 | xai/grok-4 | 🟢0.2140 | ✅ Active |
| 4 | perplexity/sonar-pro | 🟢0.2413 | ✅ Active |
| 5 | xai/grok-4.1-fast-reasoning | 🟢0.2540 | ✅ Active |
| 6 | mistral/ministral-3b-latest | 🟢0.2596 | ✅ Active |
| 7 | anthropic/claude-opus-4-5 | 🟢0.2707 | ✅ Active |
| 8 | anthropic/claude-sonnet-4-5 | 🟢0.3265 | ✅ Active |
| 9 | xai/grok-2-vision | 🟢0.3565 | ✅ Active |
| 10 | openai/gpt-4o | 🟢0.3567 | ✅ Active |

### 1h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | mistral/ministral-8b-latest | 🟢0.0901 | ✅ Active |
| 2 | mistral/ministral-3b-latest | 🟢0.2681 | ✅ Active |
| 3 | google/gemini-3-pro-preview | 🟢0.3037 | ✅ Active |
| 4 | perplexity/sonar-pro | 🟢0.3126 | ✅ Active |
| 5 | xai/grok-4 | 🟢0.3652 | ✅ Active |
| 6 | xai/grok-2-vision | 🟢0.3720 | ✅ Active |
| 7 | anthropic/claude-3-5-haiku-latest | 🟢0.3756 | ✅ Active |
| 8 | anthropic/claude-opus-4-5 | 🟢0.3761 | ✅ Active |
| 9 | anthropic/claude-sonnet-4-5 | 🟢0.3812 | ✅ Active |
| 10 | xai/grok-4.1-fast-reasoning | 🟢0.4872 | ✅ Active |

### 4h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | mistral/ministral-8b-latest | 🟢0.1840 | ✅ Active |
| 2 | anthropic/claude-3-5-haiku-latest | 🟢0.4043 | ✅ Active |
| 3 | perplexity/sonar-pro | 🟢0.4342 | ✅ Active |
| 4 | xai/grok-2-vision | 🟢0.4946 | ✅ Active |
| 5 | google/gemini-3-pro-preview | 🟡0.5421 | ✅ Active |
| 6 | xai/grok-4.1-fast-reasoning | 🟡0.5675 | ✅ Active |
| 7 | anthropic/claude-opus-4-5 | 🟡0.6294 | ✅ Active |
| 8 | xai/grok-4-fast-non-reasoning | 🟡0.7105 | ✅ Active |
| 9 | xai/grok-4 | 🟡0.7334 | ✅ Active |
| 10 | openai/gpt-5.2 | 🟡0.7748 | ✅ Active |

### 24h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | google/gemini-3-pro-preview | 🟢0.2417 | ✅ Active |
| 2 | mistral/ministral-8b-latest | 🟢0.2555 | ✅ Active |
| 3 | openai/gpt-4.1-mini | 🟢0.3370 | ✅ Active |
| 4 | anthropic/claude-3-5-haiku-latest | 🟡0.5285 | ✅ Active |
| 5 | xai/grok-4.1-fast-reasoning | 🟡0.6796 | ✅ Active |
| 6 | xai/grok-2-vision | 🟡0.7291 | ✅ Active |
| 7 | perplexity/sonar-pro | 🔴0.8277 | ✅ Active |
| 8 | google/gemini-2.5-flash | 🔴0.8333 | ❌ P2 |
| 9 | google/gemini-2.5-flash-lite | 🔴0.8516 | ❌ P2 |
| 10 | google/gemini-2.0-flash | 🔴0.8668 | ❌ P0 |

## Eliminated Models

| Model | Phase | Reason |
|-------|-------|--------|
| anthropic/claude-haiku-4-5 | 2 | no qualified horizons remaining |
| anthropic/claude-3-7-sonnet-latest | 0 | Failed sanity check on all horizons |
| openai/gpt-4o-mini | 0 | Failed sanity check on all horizons |
| openai/gpt-5 | 0 | Failed sanity check on all horizons |
| openai/gpt-5-mini | 0 | Failed sanity check on all horizons |
| openai/gpt-5-nano | 0 | Failed sanity check on all horizons |
| google/gemini-2.0-flash | 0 | Failed sanity check on all horizons |
| google/gemini-2.5-flash | 2 | no qualified horizons remaining |
| google/gemini-2.5-flash-lite | 2 | no qualified horizons remaining |
| google/gemini-2.5-pro | 2 | no qualified horizons remaining |
| mistral/pixtral-large-latest | 2 | no qualified horizons remaining |
| mistral/pixtral-12b-2409 | 0 | Failed sanity check on all horizons |

## Model Failures

| Model | Failed Rounds |
|-------|---------------|
| openai/gpt-4o | 1, 2, 3, 5, 6, 7, 8, 9, 10, 12 |
| openai/gpt-4o-mini | 1, 2, 3, 4 |
| openai/gpt-4.1-mini | 3, 4, 11 |
| openai/gpt-5 | 1, 2, 3, 4 |
| openai/gpt-5-mini | 1, 2, 3, 4 |
| openai/gpt-5-nano | 1, 2, 3, 4 |
| mistral/pixtral-12b-2409 | 1, 2, 3, 4 |
| mistral/ministral-3b-latest | 2, 3, 4, 6, 7, 8, 9, 10, 11, 12 |

---
*Auto-generated by agent_006 benchmark*