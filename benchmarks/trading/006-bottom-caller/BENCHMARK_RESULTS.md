# agent_006 Benchmark Results

**Symbol:** COINBASE_SPOT_BTC_USD
**Start Time:** 2026-01-06T19:53:10.959Z
**Progress:** Round 2/12 (Phase 0)
**Last Updated:** 2026-01-06T20:00:04.759Z

## Run Configuration

| Setting | Value |
|---------|-------|
| Tolerance | 0% strict undercut |
| Unique snapTimes | 12 |
| Models tested | 28 |

**Per-Horizon Configuration:**

| Horizon | Bar Size | Lookback Bars | Horizon Bars |
|---------|----------|---------------|--------------|
| 15m | 5m | 24 | 3 |
| 1h | 15m | 32 | 4 |
| 4h | 1h | 32 | 4 |
| 24h | 4h | 48 | 6 |

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
- **Phase 0 – Sanity filter**: Disqualifies horizons where model log loss > random baseline × 1.1 (≈0.762), shows degenerate predictions (all mapped p ≥ 0.9 or p ≤ 0.1), or has high extreme error rate (>20% confident wrong predictions where p > 0.8 but actual = false)
- **Phase 1 – Percentile filter**: Retains models above performance threshold per horizon
- **Phase 2 – Stability filter**: Evaluates consistency using rolling windows; eliminates models with no qualified horizons remaining
- **Phase 3 – Final ranking**: Composite scoring of surviving models

> **Quick mode note:** Verification runs apply the same Phase 0–3 scoring pipeline as full benchmarks. With limited samples, rankings are indicative only and should not be used for final model selection.

**Status codes:**
- `✅ Active`: Survived all phases with ≥1 qualified horizon
- `❌ P0`: Eliminated in Phase 0 (all horizons failed sanity checks)
- `❌ P2`: Eliminated in Phase 2 (no qualified horizons remaining)

## Summary

- **Active Models:** 28
- **Eliminated:** 0
- **Models with Failures:** 8

## Final Standings (Survivors)

*No models survived all elimination phases with adequate coverage.*

## All Models (Research Reference)

*Rankings are by composite score among models with adequate coverage (≥80% and ≥10 rounds).*

*No models have adequate coverage (≥80% and ≥10 rounds).*

### Not Ranked (Low Coverage or Early Stopped)

*These models had <80% coverage OR <10 effective rounds and are shown for reference only, not as competitive rankings.*

| Model | Status | Rnds | Cov | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|-------|--------|------|-----|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| google/gemini-2.5-pro | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.134 | 🔴0.837 | 🟢0.078 | 🟢0.036 | 🟢0.271 | 100.0 | 0.059 | 0.429 | 0.50 | 0.8554 |
| google/gemini-2.5-flash | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.193 | 🔴0.837 | 🟢0.078 | 🟢0.036 | 🟢0.286 | 95.0 | 0.041 | 0.425 | 0.50 | 0.8389 |
| google/gemini-3-pro-preview | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.193 | 🔴0.871 | 🟢0.105 | 🟢0.078 | 🟢0.312 | 90.0 | 0.087 | 0.416 | 0.50 | 0.8138 |
| xai/grok-4 | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.197 | 🟡0.714 | 🟢0.260 | 🟢0.308 | 🟢0.369 | 85.0 | 0.205 | 0.340 | 0.50 | 0.7911 |
| openai/gpt-5.2 | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.268 | 🟡0.635 | 🟢0.406 | 🟢0.362 | 🟢0.418 | 80.0 | 0.262 | 0.254 | 0.50 | 0.7800 |
| mistral/pixtral-large-latest | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.134 | 🔴1.060 | 🟢0.255 | 🟢0.322 | 🟢0.443 | 75.0 | 0.164 | 0.554 | 0.50 | 0.7146 |
| openai/gpt-4.1 | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.315 | 🔴0.983 | 🟢0.268 | 🟢0.225 | 🟢0.448 | 70.0 | 0.233 | 0.446 | 0.50 | 0.7058 |
| anthropic/claude-3-5-haiku-latest | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.357 | 🟡0.636 | 🟢0.308 | 🟡0.514 | 🟢0.454 | 60.0 | 0.312 | 0.268 | 0.50 | 0.6896 |
| xai/grok-4.1-fast-reasoning | ✅ Active | 2 | 8/48 (17%)⚠️ | 🔴0.817 | 🟢0.322 | 🟢0.193 | 🟡0.511 | 🟢0.461 | 55.0 | 0.224 | 0.366 | 0.50 | 0.6631 |
| mistral/ministral-8b-latest | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.134 | 🔴1.177 | 🟢0.193 | 🟢0.288 | 🟢0.448 | 65.0 | 0.106 | 0.705 | 0.50 | 0.6530 |
| xai/grok-2-vision | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.255 | 🟡0.669 | 🟡0.636 | 🟡0.562 | 🟡0.531 | 45.0 | 0.266 | 0.295 | 0.50 | 0.6310 |
| perplexity/sonar-pro | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.337 | 🟡0.714 | 🟢0.268 | 🟡0.746 | 🟡0.516 | 50.0 | 0.214 | 0.472 | 0.50 | 0.6234 |
| anthropic/claude-opus-4-5 | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.193 | 🔴0.837 | 🟡0.674 | 🟢0.471 | 🟡0.544 | 40.0 | 0.224 | 0.386 | 0.50 | 0.5992 |
| anthropic/claude-3-5-sonnet-20241022 | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.288 | 🟡0.714 | 🟡0.703 | 🟡0.674 | 🟡0.595 | 30.0 | 0.266 | 0.369 | 0.50 | 0.5562 |
| google/gemini-2.5-flash-lite | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.357 | 🔴0.805 | 🟡0.511 | 🟡0.628 | 🟡0.575 | 35.0 | 0.312 | 0.485 | 0.50 | 0.5461 |
| anthropic/claude-sonnet-4-5 | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.329 | 🟡0.763 | 🔴1.009 | 🟢0.288 | 🟡0.597 | 25.0 | 0.348 | 0.357 | 0.50 | 0.5266 |
| google/gemini-2.0-flash | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.357 | 🟡0.714 | 🔴0.857 | 🔴0.983 | 🟡0.728 | 20.0 | 0.408 | 0.440 | 0.50 | 0.4808 |
| xai/grok-4-fast-non-reasoning | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.290 | 🔴0.909 | 🟡0.674 | 🔴1.151 | 🟡0.756 | 15.0 | 0.337 | 0.433 | 0.50 | 0.4728 |
| anthropic/claude-3-7-sonnet-latest | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.322 | 🟡0.718 | 🟡0.780 | 🔴1.204 | 🟡0.756 | 10.0 | 0.343 | 0.430 | 0.50 | 0.4525 |
| anthropic/claude-haiku-4-5 | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.329 | 🟡0.763 | 🟡0.746 | 🔴1.309 | 🟡0.787 | 5.0 | 0.348 | 0.458 | 0.50 | 0.4264 |

**Legend:**

*Log loss color coding:*
- 🟢 Good (≤ 0.5) | 🟡 OK (≤ 0.8) | 🔴 Poor (> 0.8)

*Column definitions:*
- `Rnds`: Number of successful rounds (failed rounds are excluded from metrics)
- `Cov`: Coverage as effective/intended (percent). ⚠️ indicates <80% coverage or <10 effective rounds on any horizon
- `15m, 1h, 4h, 24h`: Mean log loss for that horizon across all valid rounds
- `Mean`: Arithmetic mean of the four horizon log losses
- `%Rank`: Percentile rank among all models by composite Score (higher = better)
- `BestWin`: Best rolling-window average log loss (lower = better)
- `Stabil`: Standard deviation of per-round log loss (lower = better)
- `TtP`: Time-to-pivot ratio (lower = better). *Note: With the current no-new-low ground truth system, timing data is not available; all models show TtP = 0.50.*
- `Score`: Composite metric combining rank, best window, stability, and timing (40% rank + 30% bestWin⁻¹ + 20% stabil⁻¹ + 10% TtP⁻¹). *Non-rankable horizons (insufficient label diversity) are excluded from composite score calculation.*

## Per-Horizon Rankings (Top 10)

*No ranking data available.*

## Model Failures

*Note: Failed rounds (API errors, malformed responses) are excluded from scoring. The `Rnds` column shows successful rounds used in metric calculation.*

| Model | Failed Rounds |
|-------|---------------|
| openai/gpt-4o | 1, 2 |
| openai/gpt-4o-mini | 1, 2 |
| openai/gpt-4.1-mini | 1, 2 |
| openai/gpt-5 | 1, 2 |
| openai/gpt-5-mini | 1, 2 |
| openai/gpt-5-nano | 1, 2 |
| mistral/pixtral-12b-2409 | 1, 2 |
| mistral/ministral-3b-latest | 1, 2 |

---
*Auto-generated by agent_006 benchmark*