# agent_006 Benchmark Results

**Symbol:** COINBASE_SPOT_BTC_USD
**Start Time:** 2026-01-04T01:05:00.673Z
**Progress:** Round 3/12 (Phase 0)
**Last Updated:** 2026-01-04T01:14:52.249Z

## Benchmark Overview

This benchmark evaluates LLMs on a **binary classification task** across 4 horizons (15m, 1h, 4h, 24h):

> For each horizon, predict whether the current reference low will hold (*no new low*) or be undercut within the forward window.

**Label definition (`noNewLow`):**
- `1` (true): Forward window low ≥ reference low (bottom held)
- `0` (false): Forward window low < reference low (new low made)

**Horizons** share the same symbol and time but differ in bar size, lookback window, and forward prediction window.

## Methodology

### Ground Truth
- **Reference low**: Minimum low price across lookback candles
- **Forward low**: Minimum low price in the forward window (prediction horizon)
- **Label**: `y = 1` if forward low ≥ reference low, else `y = 0`

### Probability Mapping
Models output `{ noNewLow: boolean; confidence ∈ [0.5, 1.0] }` per horizon.
- Probability of no new low: `p = noNewLow ? confidence : (1 - confidence)`

### Scoring
- **Log loss** (primary): `LL = -(y·log(p) + (1−y)·log(1−p))`, with p clipped to [ε, 1−ε]
- **Random baseline**: p=0.5 gives LL ≈ 0.693
- **Brier score**: Used in Phase 0 sanity checks only (not shown in tables)

### Phases & Elimination
- **Phase 0 – Sanity filter**: Disqualifies horizons where model performs worse than random baseline, shows degenerate predictions (all mapped p ≥ 0.9 or p ≤ 0.1), or has high extreme error rate (>20% confidently wrong)
- **Phase 1 – Percentile filter**: Retains models above performance threshold per horizon
- **Phase 2 – Stability filter**: Evaluates consistency using rolling windows; eliminates models with no qualified horizons remaining
- **Phase 3 – Final ranking**: Composite scoring of surviving models

> **Quick mode note:** This verification run only calculates raw log loss per horizon. Full Phase 0–3 elimination is applied in the complete benchmark only.

**Status codes:**
- `✅ Active`: Survived all phases with ≥1 qualified horizon
- `❌ P0`: Eliminated in Phase 0 (all horizons failed sanity checks)
- `❌ P2`: Eliminated in Phase 2 (no qualified horizons remaining)

## Summary

- **Active Models:** 28
- **Eliminated:** 0
- **Models with Failures:** 9

## Full Results (All Models)

| Rank | Model | Status | Rnds | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|------|-------|--------|------|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| 🥇 | mistral/ministral-8b-latest | ✅ Active | 3 | 🟢0.069 | 🟢0.052 | 🟢0.074 | 🟢0.108 | 🟢0.076 | 100.0 | 0.052 | 0.053 | 0.50 | **0.9317** |
| 🥈 | xai/grok-4 | ✅ Active | 3 | 🟢0.436 | 🟡0.565 | 🟢0.247 | 🟢0.106 | 🟢0.339 | 95.7 | 0.106 | 0.255 | 0.50 | **0.8656** |
| 🥉 | xai/grok-2-vision | ✅ Active | 3 | 🟢0.245 | 🟢0.335 | 🟢0.478 | 🟢0.459 | 🟢0.379 | 87.0 | 0.245 | 0.193 | 0.50 | **0.8225** |
| 4 | perplexity/sonar-pro | ✅ Active | 3 | 🟢0.288 | 🟢0.268 | 🟢0.317 | 🟡0.635 | 🟢0.377 | 91.3 | 0.268 | 0.314 | 0.50 | **0.8122** |
| 5 | openai/gpt-4.1-mini | ✅ Active | 1 | 🟢0.223 | 🟢0.357 | 🟢0.431 | 🟡0.511 | 🟢0.380 | 82.6 | 0.337 | 0.106 | 0.50 | **0.8087** |
| 6 | anthropic/claude-3-5-haiku-latest | ✅ Active | 3 | 🟢0.335 | 🟢0.406 | 🟢0.436 | 🟡0.540 | 🟢0.429 | 78.3 | 0.311 | 0.154 | 0.50 | **0.7856** |
| 7 | xai/grok-4.1-fast-reasoning | ✅ Active | 3 | 🟢0.156 | 🟢0.236 | 🟢0.467 | 🔴0.922 | 🟢0.445 | 73.9 | 0.156 | 0.407 | 0.50 | **0.7407** |
| 8 | anthropic/claude-opus-4-5 | ✅ Active | 3 | 🟢0.329 | 🟢0.431 | 🟡0.749 | 🟡0.771 | 🟡0.570 | 65.2 | 0.329 | 0.236 | 0.50 | **0.7144** |
| 9 | mistral/ministral-3b-latest | ✅ Active | 1 | 🟢0.163 | 🟢0.105 | 🟢0.051 | 🔴1.609 | 🟢0.482 | 69.6 | 0.106 | 0.652 | 0.50 | **0.6819** |
| 10 | openai/gpt-5.2 | ✅ Active | 3 | 🟢0.447 | 🟡0.669 | 🟡0.745 | 🟡0.569 | 🟡0.607 | 60.9 | 0.447 | 0.240 | 0.50 | **0.6785** |
| 11 | xai/grok-4-fast-non-reasoning | ✅ Active | 3 | 🟢0.312 | 🟢0.358 | 🟡0.707 | 🔴1.126 | 🟡0.626 | 56.5 | 0.312 | 0.510 | 0.50 | **0.6273** |
| 12 | anthropic/claude-sonnet-4-5 | ✅ Active | 3 | 🟢0.348 | 🟢0.416 | 🔴1.022 | 🔴1.342 | 🟡0.782 | 47.8 | 0.348 | 0.422 | 0.50 | **0.6048** |
| 13 | openai/gpt-4.1 | ✅ Active | 3 | 🟡0.612 | 🟡0.619 | 🟡0.719 | 🔴1.265 | 🔴0.804 | 43.5 | 0.568 | 0.352 | 0.50 | **0.5684** |
| 14 | openai/gpt-5-mini | ✅ Active | 1 | 🟢0.223 | 🔴1.204 | 🔴1.204 | 🟢0.431 | 🟡0.765 | 52.2 | 0.877 | 0.445 | 0.50 | **0.5382** |
| 15 | google/gemini-2.0-flash | ✅ Active | 3 | 🟡0.639 | 🔴0.973 | 🟡0.781 | 🔴0.973 | 🔴0.842 | 34.8 | 0.639 | 0.350 | 0.50 | **0.5234** |
| 16 | google/gemini-3-pro-preview | ✅ Active | 3 | 🟡0.646 | 🔴0.999 | 🔴1.081 | 🟡0.599 | 🔴0.831 | 39.1 | 0.599 | 0.515 | 0.50 | **0.5137** |
| 17 | google/gemini-2.5-flash | ✅ Active | 3 | 🟡0.646 | 🔴1.043 | 🔴1.801 | 🟡0.639 | 🔴1.032 | 26.1 | 0.639 | 0.608 | 0.50 | **0.4369** |
| 18 | anthropic/claude-haiku-4-5 | ✅ Active | 2 | 🟢0.329 | 🔴1.386 | 🔴1.514 | 🔴1.427 | 🔴1.164 | 21.7 | 0.681 | 0.505 | 0.50 | **0.4337** |
| 19 | mistral/pixtral-large-latest | ✅ Active | 3 | 🔴0.847 | 🟡0.799 | 🟡0.776 | 🔴1.474 | 🔴0.974 | 30.4 | 0.776 | 0.698 | 0.50 | **0.4157** |
| 20 | anthropic/claude-3-5-sonnet-20241022 | ✅ Active | 3 | 🟢0.431 | 🔴1.386 | 🔴1.609 | 🔴1.897 | 🔴1.331 | 8.7 | 0.431 | 0.550 | 0.50 | **0.4101** |
| 21 | anthropic/claude-3-7-sonnet-latest | ✅ Active | 3 | 🔴1.081 | 🔴1.631 | 🔴1.461 | 🟡0.742 | 🔴1.229 | 13.0 | 0.742 | 0.468 | 0.50 | **0.3974** |
| 22 | google/gemini-2.5-pro | ✅ Active | 3 | 🟡0.687 | 🔴1.312 | 🔴1.936 | 🔴0.946 | 🔴1.220 | 17.4 | 0.687 | 0.753 | 0.50 | **0.3659** |
| 23 | google/gemini-2.5-flash-lite | ✅ Active | 3 | 🟡0.612 | 🔴1.570 | 🔴2.072 | 🔴1.936 | 🔴1.548 | 4.3 | 0.612 | 0.684 | 0.50 | **0.3387** |

**Legend:**

*Log loss color coding:*
- 🟢 Good (≤ 0.5) | 🟡 OK (≤ 0.8) | 🔴 Poor (> 0.8)

*Column definitions:*
- `15m, 1h, 4h, 24h`: Mean log loss for that horizon across all valid rounds
- `Mean`: Arithmetic mean of the four horizon log losses
- `%Rank`: Percentile rank among all models by composite Score (higher = better)
- `BestWin`: Best rolling-window average log loss (lower = better)
- `Stabil`: Standard deviation of per-round log loss (lower = better)
- `TtP`: Time-to-pivot ratio (lower = better). *Note: With the current no-new-low ground truth system, timing data is not available; all models show TtP = 0.50.*
- `Score`: Composite metric combining rank, best window, stability, and timing (40% rank + 30% bestWin⁻¹ + 20% stabil⁻¹ + 10% TtP⁻¹)
- `Rnds`: Number of successful rounds (failed rounds are excluded from metrics)

## Per-Horizon Rankings (All Models)

### 15m Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | mistral/ministral-8b-latest | 🟢0.0693 | ✅ Active |
| 2 | xai/grok-4.1-fast-reasoning | 🟢0.1563 | ✅ Active |
| 3 | mistral/ministral-3b-latest | 🟢0.1625 | ✅ Active |
| 4 | openai/gpt-4.1-mini | 🟢0.2231 | ✅ Active |
| 5 | openai/gpt-5-mini | 🟢0.2231 | ✅ Active |
| 6 | xai/grok-2-vision | 🟢0.2447 | ✅ Active |
| 7 | perplexity/sonar-pro | 🟢0.2877 | ✅ Active |
| 8 | xai/grok-4-fast-non-reasoning | 🟢0.3122 | ✅ Active |
| 9 | anthropic/claude-opus-4-5 | 🟢0.3285 | ✅ Active |
| 10 | anthropic/claude-haiku-4-5 | 🟢0.3285 | ✅ Active |

### 1h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | mistral/ministral-8b-latest | 🟢0.0516 | ✅ Active |
| 2 | mistral/ministral-3b-latest | 🟢0.1054 | ✅ Active |
| 3 | xai/grok-4.1-fast-reasoning | 🟢0.2359 | ✅ Active |
| 4 | perplexity/sonar-pro | 🟢0.2677 | ✅ Active |
| 5 | xai/grok-2-vision | 🟢0.3354 | ✅ Active |
| 6 | openai/gpt-4.1-mini | 🟢0.3567 | ✅ Active |
| 7 | xai/grok-4-fast-non-reasoning | 🟢0.3584 | ✅ Active |
| 8 | anthropic/claude-3-5-haiku-latest | 🟢0.4061 | ✅ Active |
| 9 | anthropic/claude-sonnet-4-5 | 🟢0.4165 | ✅ Active |
| 10 | anthropic/claude-opus-4-5 | 🟢0.4308 | ✅ Active |

### 4h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | mistral/ministral-3b-latest | 🟢0.0513 | ✅ Active |
| 2 | mistral/ministral-8b-latest | 🟢0.0738 | ✅ Active |
| 3 | xai/grok-4 | 🟢0.2474 | ✅ Active |
| 4 | perplexity/sonar-pro | 🟢0.3167 | ✅ Active |
| 5 | openai/gpt-4.1-mini | 🟢0.4308 | ✅ Active |
| 6 | anthropic/claude-3-5-haiku-latest | 🟢0.4364 | ✅ Active |
| 7 | xai/grok-4.1-fast-reasoning | 🟢0.4675 | ✅ Active |
| 8 | xai/grok-2-vision | 🟢0.4785 | ✅ Active |
| 9 | xai/grok-4-fast-non-reasoning | 🟡0.7068 | ✅ Active |
| 10 | openai/gpt-4.1 | 🟡0.7195 | ✅ Active |

### 24h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | xai/grok-4 | 🟢0.1064 | ✅ Active |
| 2 | mistral/ministral-8b-latest | 🟢0.1083 | ✅ Active |
| 3 | openai/gpt-5-mini | 🟢0.4308 | ✅ Active |
| 4 | xai/grok-2-vision | 🟢0.4594 | ✅ Active |
| 5 | openai/gpt-4.1-mini | 🟡0.5108 | ✅ Active |
| 6 | anthropic/claude-3-5-haiku-latest | 🟡0.5398 | ✅ Active |
| 7 | openai/gpt-5.2 | 🟡0.5689 | ✅ Active |
| 8 | google/gemini-3-pro-preview | 🟡0.5991 | ✅ Active |
| 9 | perplexity/sonar-pro | 🟡0.6352 | ✅ Active |
| 10 | google/gemini-2.5-flash | 🟡0.6391 | ✅ Active |

## Model Failures

*Note: Failed rounds (API errors, malformed responses) are excluded from scoring. The `Rnds` column shows successful rounds used in metric calculation.*

| Model | Failed Rounds |
|-------|---------------|
| anthropic/claude-haiku-4-5 | 1 |
| openai/gpt-4o | 1, 2, 3 |
| openai/gpt-4o-mini | 1, 2, 3 |
| openai/gpt-4.1-mini | 1, 2 |
| openai/gpt-5 | 1, 2, 3 |
| openai/gpt-5-mini | 1, 2 |
| openai/gpt-5-nano | 1, 2, 3 |
| mistral/pixtral-12b-2409 | 1, 2, 3 |
| mistral/ministral-3b-latest | 2, 3 |

---
*Auto-generated by agent_006 benchmark*