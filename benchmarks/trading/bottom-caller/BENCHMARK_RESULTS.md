# agent_006 Benchmark Results

**Symbol:** COINBASE_SPOT_BTC_USD
**Start Time:** 2026-01-03T01:26:11.058Z
**Progress:** Round 1/12 (Phase 0)
**Last Updated:** 2026-01-03T01:28:29.449Z

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
- **Phase 0 – Sanity filter**: Disqualifies horizons where model performs worse than random baseline, shows degenerate predictions (all >0.9 or <0.1), or has high extreme error rate (>20% confidently wrong)
- **Phase 1 – Percentile filter**: Retains models above performance threshold per horizon
- **Phase 2 – Stability filter**: Evaluates consistency using rolling windows; eliminates models with no qualified horizons remaining
- **Phase 3 – Final ranking**: Composite scoring of surviving models

**Status codes:**
- `✅ Active`: Survived all phases with ≥1 qualified horizon
- `❌ P0`: Eliminated in Phase 0 (all horizons failed sanity checks)
- `❌ P2`: Eliminated in Phase 2 (no qualified horizons remaining)

## Summary

- **Active Models:** 28
- **Eliminated:** 0
- **Models with Failures:** 8

## Full Results (All Models)

| Rank | Model | Status | Rnds | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|------|-------|--------|------|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| 🥇 | mistral/ministral-8b-latest | ✅ Active | 1 | 🟢0.051 | 🟢0.105 | 🟢0.163 | 🟢0.051 | 🟢0.093 | 100.0 | 0.106 | 0.046 | 0.50 | **0.9248** |
| 🥈 | xai/grok-2-vision | ✅ Active | 1 | 🟢0.357 | 🟢0.223 | 🟢0.105 | 🟢0.051 | 🟢0.184 | 95.0 | 0.127 | 0.117 | 0.50 | **0.8875** |
| 🥉 | xai/grok-4-fast-non-reasoning | ✅ Active | 1 | 🟢0.288 | 🟢0.223 | 🟢0.163 | 🟢0.357 | 🟢0.258 | 90.0 | 0.224 | 0.072 | 0.50 | **0.8619** |
| 4 | perplexity/sonar-pro | ✅ Active | 1 | 🟢0.357 | 🟢0.288 | 🟢0.223 | 🔴1.050 | 🟢0.479 | 85.0 | 0.289 | 0.333 | 0.50 | **0.7801** |
| 5 | anthropic/claude-opus-4-5 | ✅ Active | 1 | 🟢0.329 | 🟢0.431 | 🟡0.545 | 🔴0.968 | 🟡0.568 | 80.0 | 0.435 | 0.243 | 0.50 | **0.7562** |
| 6 | anthropic/claude-3-5-haiku-latest | ✅ Active | 1 | 🔴1.204 | 🔴1.050 | 🟢0.223 | 🟢0.105 | 🟡0.646 | 75.0 | 0.459 | 0.486 | 0.50 | **0.6838** |
| 7 | xai/grok-4 | ✅ Active | 1 | 🟢0.223 | 🟢0.357 | 🔴1.050 | 🔴1.386 | 🟡0.754 | 70.0 | 0.543 | 0.481 | 0.50 | **0.6522** |
| 8 | anthropic/claude-sonnet-4-5 | ✅ Active | 1 | 🟢0.329 | 🟢0.386 | 🔴1.050 | 🔴1.386 | 🟡0.788 | 65.0 | 0.588 | 0.447 | 0.50 | **0.6324** |
| 9 | google/gemini-3-pro-preview | ✅ Active | 1 | 🟢0.431 | 🔴1.204 | 🔴1.386 | 🟡0.511 | 🔴0.883 | 60.0 | 1.007 | 0.418 | 0.50 | **0.5553** |
| 10 | anthropic/claude-haiku-4-5 | ✅ Active | 1 | 🟢0.329 | 🟢0.386 | 🔴1.386 | 🔴1.514 | 🔴0.904 | 55.0 | 0.700 | 0.549 | 0.50 | **0.5552** |
| 11 | google/gemini-2.0-flash | ✅ Active | 1 | 🔴1.204 | 🔴1.204 | 🔴0.916 | 🟡0.511 | 🔴0.959 | 45.0 | 0.877 | 0.284 | 0.50 | **0.5416** |
| 12 | mistral/pixtral-large-latest | ✅ Active | 1 | 🔴1.386 | 🔴1.609 | 🟢0.431 | 🟢0.357 | 🔴0.946 | 50.0 | 0.799 | 0.558 | 0.50 | **0.5185** |
| 13 | openai/gpt-4.1 | ✅ Active | 1 | 🔴0.916 | 🔴1.204 | 🔴1.204 | 🔴1.386 | 🔴1.178 | 40.0 | 1.108 | 0.168 | 0.50 | **0.5101** |
| 14 | openai/gpt-4.1-mini | ✅ Active | 1 | 🟢0.431 | 🔴0.916 | 🔴1.609 | 🔴1.897 | 🔴1.213 | 35.0 | 0.986 | 0.576 | 0.50 | **0.4271** |
| 15 | anthropic/claude-3-5-sonnet-20241022 | ✅ Active | 1 | 🟢0.431 | 🔴1.386 | 🔴1.609 | 🔴1.897 | 🔴1.331 | 25.0 | 1.142 | 0.550 | 0.50 | **0.3686** |
| 16 | xai/grok-4.1-fast-reasoning | ✅ Active | 1 | 🟢0.288 | 🔴1.609 | 🔴1.897 | 🔴1.204 | 🔴1.250 | 30.0 | 1.265 | 0.607 | 0.50 | **0.3588** |
| 17 | google/gemini-2.5-flash | ✅ Active | 1 | 🔴1.050 | 🔴1.386 | 🔴1.897 | 🔴1.204 | 🔴1.384 | 20.0 | 1.444 | 0.319 | 0.50 | **0.3495** |
| 18 | google/gemini-2.5-pro | ✅ Active | 1 | 🔴1.050 | 🔴1.386 | 🔴1.897 | 🔴1.204 | 🔴1.384 | 20.0 | 1.444 | 0.319 | 0.50 | **0.3495** |
| 19 | anthropic/claude-3-7-sonnet-latest | ✅ Active | 1 | 🔴1.386 | 🔴1.897 | 🔴1.609 | 🔴1.204 | 🔴1.524 | 10.0 | 1.570 | 0.259 | 0.50 | **0.3027** |
| 20 | google/gemini-2.5-flash-lite | ✅ Active | 1 | 🔴1.386 | 🔴1.609 | 🔴1.897 | 🔴2.303 | 🔴1.799 | 5.0 | 1.631 | 0.343 | 0.50 | **0.2568** |

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
| 1 | mistral/ministral-8b-latest | 🟢0.0513 | ✅ Active |
| 2 | xai/grok-4 | 🟢0.2231 | ✅ Active |
| 3 | xai/grok-4-fast-non-reasoning | 🟢0.2877 | ✅ Active |
| 4 | xai/grok-4.1-fast-reasoning | 🟢0.2877 | ✅ Active |
| 5 | anthropic/claude-opus-4-5 | 🟢0.3285 | ✅ Active |
| 6 | anthropic/claude-sonnet-4-5 | 🟢0.3285 | ✅ Active |
| 7 | anthropic/claude-haiku-4-5 | 🟢0.3285 | ✅ Active |
| 8 | xai/grok-2-vision | 🟢0.3567 | ✅ Active |
| 9 | perplexity/sonar-pro | 🟢0.3567 | ✅ Active |
| 10 | google/gemini-3-pro-preview | 🟢0.4308 | ✅ Active |

### 1h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | mistral/ministral-8b-latest | 🟢0.1054 | ✅ Active |
| 2 | xai/grok-2-vision | 🟢0.2231 | ✅ Active |
| 3 | xai/grok-4-fast-non-reasoning | 🟢0.2231 | ✅ Active |
| 4 | perplexity/sonar-pro | 🟢0.2877 | ✅ Active |
| 5 | xai/grok-4 | 🟢0.3567 | ✅ Active |
| 6 | anthropic/claude-sonnet-4-5 | 🟢0.3857 | ✅ Active |
| 7 | anthropic/claude-haiku-4-5 | 🟢0.3857 | ✅ Active |
| 8 | anthropic/claude-opus-4-5 | 🟢0.4308 | ✅ Active |
| 9 | openai/gpt-4.1-mini | 🔴0.9163 | ✅ Active |
| 10 | anthropic/claude-3-5-haiku-latest | 🔴1.0498 | ✅ Active |

### 4h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | xai/grok-2-vision | 🟢0.1054 | ✅ Active |
| 2 | mistral/ministral-8b-latest | 🟢0.1625 | ✅ Active |
| 3 | xai/grok-4-fast-non-reasoning | 🟢0.1625 | ✅ Active |
| 4 | perplexity/sonar-pro | 🟢0.2231 | ✅ Active |
| 5 | anthropic/claude-3-5-haiku-latest | 🟢0.2231 | ✅ Active |
| 6 | mistral/pixtral-large-latest | 🟢0.4308 | ✅ Active |
| 7 | anthropic/claude-opus-4-5 | 🟡0.5447 | ✅ Active |
| 8 | google/gemini-2.0-flash | 🔴0.9163 | ✅ Active |
| 9 | xai/grok-4 | 🔴1.0498 | ✅ Active |
| 10 | anthropic/claude-sonnet-4-5 | 🔴1.0498 | ✅ Active |

### 24h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | mistral/ministral-8b-latest | 🟢0.0513 | ✅ Active |
| 2 | xai/grok-2-vision | 🟢0.0513 | ✅ Active |
| 3 | anthropic/claude-3-5-haiku-latest | 🟢0.1054 | ✅ Active |
| 4 | xai/grok-4-fast-non-reasoning | 🟢0.3567 | ✅ Active |
| 5 | mistral/pixtral-large-latest | 🟢0.3567 | ✅ Active |
| 6 | google/gemini-3-pro-preview | 🟡0.5108 | ✅ Active |
| 7 | google/gemini-2.0-flash | 🟡0.5108 | ✅ Active |
| 8 | anthropic/claude-opus-4-5 | 🔴0.9676 | ✅ Active |
| 9 | perplexity/sonar-pro | 🔴1.0498 | ✅ Active |
| 10 | xai/grok-4.1-fast-reasoning | 🔴1.2040 | ✅ Active |

## Model Failures

*Note: Failed rounds (API errors, malformed responses) are excluded from scoring. The `Rnds` column shows successful rounds used in metric calculation.*

| Model | Failed Rounds |
|-------|---------------|
| openai/gpt-4o | 1 |
| openai/gpt-4o-mini | 1 |
| openai/gpt-5 | 1 |
| openai/gpt-5-mini | 1 |
| openai/gpt-5-nano | 1 |
| openai/gpt-5.2 | 1 |
| mistral/pixtral-12b-2409 | 1 |
| mistral/ministral-3b-latest | 1 |

---
*Auto-generated by agent_006 benchmark*