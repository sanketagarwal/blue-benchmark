# agent_006 Benchmark Results

**Symbol:** COINBASE_SPOT_BTC_USD
**Start Time:** 2026-01-05T04:04:12.620Z
**Progress:** Round 2/12 (Phase 0)
**Last Updated:** 2026-01-05T04:10:49.607Z

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

> **Quick mode note:** Verification runs apply the same Phase 0–3 scoring pipeline as full benchmarks but with fewer rounds (N=3 per horizon). All metrics (log loss, best window, stability) are computed; however, with limited samples, rankings are indicative only and should not be used for final model selection.

**Status codes:**
- `✅ Active`: Survived all phases with ≥1 qualified horizon
- `❌ P0`: Eliminated in Phase 0 (all horizons failed sanity checks)
- `❌ P2`: Eliminated in Phase 2 (no qualified horizons remaining)

## Summary

- **Active Models:** 28
- **Eliminated:** 0
- **Models with Failures:** 7

## Final Standings (Survivors)

*No models survived all elimination phases with adequate coverage.*

## All Models (Research Reference)

*Rankings are by composite score among models with adequate coverage (≥80% and ≥10 rounds).*

*No models have adequate coverage (≥80% and ≥10 rounds).*

### Not Ranked (Low Coverage or Early Stopped)

*These models had <80% coverage OR <10 effective rounds and are shown for reference only, not as competitive rankings.*

| Model | Status | Rnds | Cov | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|-------|--------|------|-----|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| google/gemini-2.5-flash | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.164 | 🔴0.805 | 🟢0.260 | 🟢0.197 | 🟢0.356 | 100.0 | 0.208 | 0.398 | 0.50 | 0.8393 |
| anthropic/claude-3-5-sonnet-20241022 | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.394 | 🟢0.471 | 🟡0.636 | 🟢0.443 | 🟢0.486 | 95.7 | 0.433 | 0.186 | 0.50 | 0.8305 |
| openai/gpt-5.2 | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.301 | 🟢0.408 | 🔴0.881 | 🟡0.562 | 🟡0.538 | 87.0 | 0.334 | 0.221 | 0.50 | 0.8035 |
| mistral/pixtral-large-latest | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.434 | 🔴1.407 | 🟢0.164 | 🟢0.134 | 🟡0.535 | 91.3 | 0.124 | 0.529 | 0.50 | 0.7907 |
| anthropic/claude-3-7-sonnet-latest | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.322 | 🟢0.394 | 🔴0.983 | 🟡0.554 | 🟡0.563 | 82.6 | 0.334 | 0.261 | 0.50 | 0.7782 |
| xai/grok-4.1-fast-reasoning | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.163 | 🟢0.223 | 🔴1.204 | 🟡0.714 | 🟡0.576 | 78.3 | 0.183 | 0.433 | 0.50 | 0.7490 |
| xai/grok-2-vision | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.223 | 🟢0.322 | 🔴1.060 | 🔴0.871 | 🟡0.619 | 73.9 | 0.245 | 0.373 | 0.50 | 0.7343 |
| anthropic/claude-opus-4-5 | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.180 | 🟢0.255 | 🔴1.263 | 🔴0.824 | 🟡0.631 | 69.6 | 0.216 | 0.460 | 0.50 | 0.7037 |
| anthropic/claude-3-5-haiku-latest | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.322 | 🟢0.327 | 🔴1.060 | 🔴0.924 | 🟡0.658 | 65.2 | 0.314 | 0.355 | 0.50 | 0.6928 |
| openai/gpt-5 | ✅ Active | 1 | 4/48 (8%)⚠️ | 🟢0.446 | 🟡0.545 | 🔴0.844 | 🔴0.968 | 🟡0.701 | 60.9 | 0.612 | 0.213 | 0.50 | 0.6592 |
| anthropic/claude-sonnet-4-5 | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.329 | 🟢0.386 | 🔴1.177 | 🔴0.959 | 🟡0.712 | 56.5 | 0.348 | 0.382 | 0.50 | 0.6476 |
| google/gemini-2.0-flash | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.357 | 🟡0.714 | 🔴0.916 | 🔴1.001 | 🟡0.747 | 43.5 | 0.543 | 0.287 | 0.50 | 0.5851 |
| anthropic/claude-haiku-4-5 | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.380 | 🟡0.763 | 🔴0.834 | 🔴0.953 | 🟡0.732 | 47.8 | 0.633 | 0.423 | 0.50 | 0.5617 |
| google/gemini-3-pro-preview | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.051 | 🟢0.134 | 🔴1.609 | 🔴1.218 | 🟡0.753 | 39.1 | 0.088 | 0.681 | 0.50 | 0.5571 |
| openai/gpt-4.1 | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.278 | 🟢0.340 | 🔴1.407 | 🔴1.086 | 🟡0.777 | 34.8 | 0.293 | 0.501 | 0.50 | 0.5451 |
| xai/grok-4-fast-non-reasoning | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟡0.746 | 🔴0.805 | 🔴1.060 | 🟢0.297 | 🟡0.727 | 52.2 | 0.611 | 0.626 | 0.50 | 0.5418 |
| openai/gpt-4.1-mini | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.163 | 🟢0.322 | 🔴1.204 | 🔴1.473 | 🟡0.791 | 30.4 | 0.227 | 0.598 | 0.50 | 0.5180 |
| perplexity/sonar-pro | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.134 | 🟢0.193 | 🔴1.956 | 🔴1.295 | 🔴0.894 | 26.1 | 0.143 | 0.789 | 0.50 | 0.4751 |
| mistral/ministral-8b-latest | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.078 | 🟢0.067 | 🔴2.009 | 🔴1.642 | 🔴0.949 | 17.4 | 0.080 | 0.897 | 0.50 | 0.4282 |
| mistral/ministral-3b-latest | ✅ Active | 1 | 4/48 (8%)⚠️ | 🟢0.223 | 🟢0.288 | 🔴1.897 | 🔴1.204 | 🔴0.903 | 21.7 | 0.803 | 0.693 | 0.50 | 0.3780 |
| google/gemini-2.5-pro | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.322 | 🟡0.714 | 🔴1.263 | 🔴1.551 | 🔴0.962 | 13.0 | 0.550 | 1.039 | 0.50 | 0.3197 |
| google/gemini-2.5-flash-lite | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟡0.669 | 🟡0.774 | 🔴1.263 | 🔴2.100 | 🔴1.201 | 8.7 | 0.591 | 0.959 | 0.50 | 0.3043 |
| xai/grok-4 | ✅ Active | 2 | 8/48 (17%)⚠️ | 🔴1.060 | 🔴1.295 | 🔴1.060 | 🔴2.100 | 🔴1.379 | 4.3 | 1.108 | 0.525 | 0.50 | 0.2962 |

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
| openai/gpt-5 | 2 |
| openai/gpt-5-mini | 1, 2 |
| openai/gpt-5-nano | 1, 2 |
| mistral/pixtral-12b-2409 | 1, 2 |
| mistral/ministral-3b-latest | 2 |

---
*Auto-generated by agent_006 benchmark*