# agent_006 Benchmark Results

**Symbol:** COINBASE_SPOT_BTC_USD
**Start Time:** 2025-12-18T18:00:00.000Z
**Progress:** Round 12/12 (Phase 3)
**Last Updated:** 2026-01-04T15:34:56.013Z

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
- **Phase 0 – Sanity filter**: Disqualifies horizons where model performs worse than random baseline, shows degenerate predictions (all mapped p ≥ 0.9 or p ≤ 0.1), or has high extreme error rate (>20% confidently wrong)
- **Phase 1 – Percentile filter**: Retains models above performance threshold per horizon
- **Phase 2 – Stability filter**: Evaluates consistency using rolling windows; eliminates models with no qualified horizons remaining
- **Phase 3 – Final ranking**: Composite scoring of surviving models

> **Quick mode note:** This verification run only calculates raw log loss per horizon. Full Phase 0–3 elimination is applied in the complete benchmark only.

**Status codes:**
- `✅ Active`: Survived all phases with ≥1 qualified horizon
- `❌ P0`: Eliminated in Phase 0 (all horizons failed sanity checks)
- `❌ P2`: Eliminated in Phase 2 (no qualified horizons remaining)

## Dataset Diagnostics

*Label distribution and baseline performance for interpreting model skill.*

| Horizon | N | True | False | pTrue | Random LL | Prevalence LL | Extreme True LL | Extreme False LL |
|---------|---|------|-------|-------|-----------|---------------|-----------------|------------------|
| 15m | 12 | 9 | 3 | 0.750 | 0.693 | 0.562 | 8.635 | 25.904 |
| 1h | 12 | 6 | 6 | 0.500 | 0.693 | 0.693 | 17.269 | 17.269 |
| 4h | 12 | 4 | 8 | 0.333 | 0.693 | 0.637 | 23.026 | 11.513 |
| 24h | 12 | 4 | 8 | 0.333 | 0.693 | 0.637 | 23.026 | 11.513 |

*Clipping: ε = 1e-15 (probabilities clipped to [ε, 1-ε] to avoid log(0))*

**Interpretation:**
- *Prevalence LL*: Best possible constant predictor. Models must beat this to show skill.
- *Extreme True/False LL*: Diagnostic baselines for p≈1 or p≈0 predictions. High values indicate label imbalance makes extreme predictions catastrophic.

**Per-round label distribution:**

| Horizon | Min | Median | Max |
|---------|-----|--------|-----|
| 15m | 0 | 1 | 1 |
| 1h | 0 | 0.5 | 1 |
| 4h | 0 | 0 | 1 |
| 24h | 0 | 0 | 1 |

⚠️ **15m horizon**: Only 3 negative examples (25.0%). Results are **not rankable** for this horizon.
⚠️ **4h horizon**: Only 4 positive examples (33.3%). Results are **not rankable** for this horizon.
⚠️ **24h horizon**: Only 4 positive examples (33.3%). Results are **not rankable** for this horizon.

## Prediction Diversity

*Variety of predictions per model. Low diversity suggests caching or degenerate behavior.*

### anthropic/claude-haiku-4-5

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.650 | 0.300 | 0.720 | 0.137 | 0.83 |
| 1h | 12 | 6 | 0.554 | 0.250 | 0.720 | 0.172 | 0.67 |
| 4h | 12 | 7 | 0.450 | 0.250 | 0.750 | 0.196 | 0.42 |
| 24h | 12 | 8 | 0.315 | 0.200 | 0.720 | 0.136 | 0.08 |

### anthropic/claude-sonnet-4-5

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.654 | 0.280 | 0.720 | 0.118 | 0.92 |
| 1h | 12 | 6 | 0.607 | 0.220 | 0.680 | 0.121 | 0.92 |
| 4h | 12 | 9 | 0.442 | 0.300 | 0.750 | 0.151 | 0.25 |
| 24h | 12 | 7 | 0.446 | 0.250 | 0.720 | 0.167 | 0.33 |

### anthropic/claude-opus-4-5

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.781 | 0.600 | 0.850 | 0.073 | 1.00 |
| 1h | 12 | 5 | 0.715 | 0.550 | 0.800 | 0.060 | 1.00 |
| 4h | 12 | 4 | 0.654 | 0.450 | 0.750 | 0.069 | 0.92 |
| 24h | 12 | 5 | 0.510 | 0.400 | 0.650 | 0.087 | 0.42 |

### anthropic/claude-3-5-sonnet-20241022

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.483 | 0.150 | 0.750 | 0.243 | 0.58 |
| 1h | 12 | 6 | 0.354 | 0.150 | 0.650 | 0.198 | 0.33 |
| 4h | 12 | 7 | 0.304 | 0.150 | 0.600 | 0.109 | 0.08 |
| 24h | 12 | 7 | 0.296 | 0.100 | 0.450 | 0.088 | 0.00 |

### anthropic/claude-3-5-haiku-latest

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.617 | 0.250 | 0.850 | 0.199 | 0.75 |
| 1h | 12 | 7 | 0.608 | 0.150 | 0.800 | 0.214 | 0.75 |
| 4h | 12 | 5 | 0.658 | 0.200 | 0.800 | 0.159 | 0.92 |
| 24h | 12 | 6 | 0.629 | 0.350 | 0.900 | 0.145 | 0.92 |

### anthropic/claude-3-7-sonnet-latest

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 8 | 0.550 | 0.150 | 0.800 | 0.228 | 0.67 |
| 1h | 12 | 6 | 0.475 | 0.150 | 0.700 | 0.221 | 0.58 |
| 4h | 12 | 8 | 0.417 | 0.150 | 0.650 | 0.183 | 0.42 |
| 24h | 12 | 6 | 0.333 | 0.100 | 0.600 | 0.121 | 0.08 |

### openai/gpt-4.1

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 9 | 0.471 | 0.200 | 0.800 | 0.209 | 0.42 |
| 1h | 12 | 7 | 0.462 | 0.150 | 0.750 | 0.217 | 0.42 |
| 4h | 12 | 7 | 0.544 | 0.200 | 0.800 | 0.252 | 0.58 |
| 24h | 12 | 9 | 0.581 | 0.150 | 0.850 | 0.276 | 0.67 |

### openai/gpt-5.2

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 9 | 0.544 | 0.320 | 0.700 | 0.139 | 0.67 |
| 1h | 12 | 9 | 0.468 | 0.280 | 0.620 | 0.118 | 0.44 |
| 4h | 12 | 9 | 0.473 | 0.300 | 0.680 | 0.132 | 0.44 |
| 24h | 12 | 8 | 0.419 | 0.280 | 0.600 | 0.111 | 0.22 |
**Failures:** 3 parse, 0 schema (effectiveN: 9/12)


### google/gemini-2.0-flash

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 3 | 0.525 | 0.200 | 0.700 | 0.209 | 0.58 |
| 1h | 12 | 3 | 0.442 | 0.200 | 0.600 | 0.161 | 0.50 |
| 4h | 12 | 4 | 0.529 | 0.300 | 0.600 | 0.116 | 0.75 |
| 24h | 12 | 5 | 0.533 | 0.200 | 0.700 | 0.148 | 0.67 |

### google/gemini-2.5-flash

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 9 | 0.489 | 0.020 | 0.850 | 0.310 | 0.58 |
| 1h | 12 | 9 | 0.371 | 0.050 | 0.750 | 0.263 | 0.33 |
| 4h | 12 | 6 | 0.271 | 0.100 | 0.800 | 0.220 | 0.17 |
| 24h | 12 | 6 | 0.346 | 0.050 | 0.900 | 0.328 | 0.25 |

### google/gemini-2.5-flash-lite

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.350 | 0.150 | 0.800 | 0.218 | 0.17 |
| 1h | 12 | 7 | 0.262 | 0.100 | 0.750 | 0.161 | 0.08 |
| 4h | 12 | 9 | 0.348 | 0.080 | 0.850 | 0.269 | 0.33 |
| 24h | 12 | 7 | 0.383 | 0.050 | 0.900 | 0.329 | 0.42 |

### google/gemini-2.5-pro

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 8 | 0.433 | 0.050 | 0.850 | 0.295 | 0.42 |
| 1h | 12 | 7 | 0.296 | 0.100 | 0.900 | 0.229 | 0.17 |
| 4h | 12 | 7 | 0.300 | 0.100 | 0.900 | 0.286 | 0.25 |
| 24h | 12 | 7 | 0.304 | 0.050 | 0.950 | 0.349 | 0.25 |

### google/gemini-3-pro-preview

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 2 | 0.938 | 0.900 | 0.950 | 0.022 | 1.00 |
| 1h | 12 | 3 | 0.850 | 0.800 | 0.900 | 0.035 | 1.00 |
| 4h | 12 | 3 | 0.738 | 0.650 | 0.800 | 0.054 | 1.00 |
| 24h | 12 | 3 | 0.600 | 0.400 | 0.700 | 0.122 | 0.75 |

### xai/grok-2-vision

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 4 | 0.762 | 0.700 | 0.850 | 0.048 | 1.00 |
| 1h | 12 | 4 | 0.738 | 0.400 | 0.900 | 0.141 | 0.88 |
| 4h | 12 | 4 | 0.706 | 0.650 | 0.900 | 0.081 | 1.00 |
| 24h | 12 | 4 | 0.662 | 0.500 | 0.950 | 0.143 | 0.88 |

### xai/grok-4-fast-non-reasoning

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 7 | 0.692 | 0.300 | 0.850 | 0.171 | 0.83 |
| 1h | 12 | 6 | 0.633 | 0.250 | 0.800 | 0.197 | 0.75 |
| 4h | 12 | 8 | 0.567 | 0.200 | 0.850 | 0.229 | 0.58 |
| 24h | 12 | 8 | 0.417 | 0.150 | 0.700 | 0.171 | 0.25 |

### xai/grok-4.1-fast-reasoning

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.799 | 0.200 | 0.920 | 0.190 | 0.92 |
| 1h | 12 | 7 | 0.713 | 0.150 | 0.880 | 0.234 | 0.83 |
| 4h | 12 | 9 | 0.683 | 0.200 | 0.850 | 0.192 | 0.83 |
| 24h | 12 | 7 | 0.557 | 0.300 | 0.850 | 0.175 | 0.58 |

### xai/grok-4

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 9 | 0.521 | 0.200 | 0.900 | 0.273 | 0.50 |
| 1h | 12 | 8 | 0.500 | 0.200 | 0.850 | 0.232 | 0.50 |
| 4h | 12 | 7 | 0.596 | 0.200 | 0.800 | 0.219 | 0.67 |
| 24h | 12 | 7 | 0.717 | 0.150 | 0.900 | 0.234 | 0.83 |

### mistral/pixtral-large-latest

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 7 | 0.463 | 0.100 | 0.850 | 0.293 | 0.50 |
| 1h | 12 | 6 | 0.433 | 0.100 | 0.800 | 0.289 | 0.50 |
| 4h | 12 | 9 | 0.362 | 0.050 | 0.900 | 0.282 | 0.33 |
| 24h | 12 | 8 | 0.337 | 0.050 | 0.950 | 0.290 | 0.33 |

### mistral/ministral-8b-latest

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 4 | 0.896 | 0.750 | 0.950 | 0.056 | 1.00 |
| 1h | 12 | 5 | 0.842 | 0.650 | 0.950 | 0.081 | 1.00 |
| 4h | 12 | 8 | 0.715 | 0.150 | 0.950 | 0.224 | 0.83 |
| 24h | 12 | 8 | 0.598 | 0.100 | 0.820 | 0.244 | 0.67 |

### perplexity/sonar-pro

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 2 | 0.837 | 0.750 | 0.850 | 0.033 | 1.00 |
| 1h ⚠️ | 12 | 1 | 0.800 | 0.800 | 0.800 | 0.000 | 1.00 |
| 4h | 12 | 2 | 0.762 | 0.750 | 0.850 | 0.033 | 1.00 |
| 24h | 12 | 2 | 0.675 | 0.650 | 0.700 | 0.025 | 1.00 |

### openai/gpt-4.1-mini

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.517 | 0.100 | 0.800 | 0.245 | 0.67 |
| 1h | 12 | 5 | 0.522 | 0.150 | 0.850 | 0.270 | 0.67 |
| 4h | 12 | 6 | 0.544 | 0.100 | 0.900 | 0.317 | 0.56 |
| 24h | 12 | 7 | 0.511 | 0.050 | 0.900 | 0.349 | 0.56 |
**Failures:** 3 parse, 0 schema (effectiveN: 9/12)


**Warnings:**
- ⚠️ perplexity/sonar-pro (1h): Constant predictor detected

## Failure Audit

*Failed rounds are excluded from scoring.*

**Aggregate:**
- Total model calls: 336 (28 models × 12 rounds)
- Failed model calls: 34 (10.1%)
- Total horizon predictions: 1344 (28 models × 12 rounds × 4 horizons)
- Failed horizon predictions: 136 (10.1%)

**Per-Model Breakdown:**

| Model | Calls Failed/Total | Horizons Failed | Transport | Timeout | Parse | Schema | Other |
|-------|--------------------|--------------------|-----------|---------|-------|--------|-------|
| anthropic/claude-haiku-4-5 | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| anthropic/claude-sonnet-4-5 | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| anthropic/claude-opus-4-5 | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| anthropic/claude-3-5-sonnet-20241022 | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| anthropic/claude-3-5-haiku-latest | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| anthropic/claude-3-7-sonnet-latest | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| openai/gpt-4o | 4/12 | 16 | 0 | 0 | 0 | 4 | 0 |
| openai/gpt-4o-mini | 4/12 | 16 | 0 | 0 | 0 | 4 | 0 |
| openai/gpt-4.1 | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| openai/gpt-4.1-mini | 3/12 | 12 | 0 | 0 | 0 | 3 | 0 |
| openai/gpt-5 | 4/12 | 16 | 0 | 0 | 0 | 4 | 0 |
| openai/gpt-5-mini | 4/12 | 16 | 0 | 0 | 0 | 4 | 0 |
| openai/gpt-5-nano | 4/12 | 16 | 0 | 0 | 0 | 4 | 0 |
| openai/gpt-5.2 | 3/12 | 12 | 0 | 0 | 0 | 3 | 0 |
| google/gemini-2.0-flash | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| google/gemini-2.5-flash | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| google/gemini-2.5-flash-lite | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| google/gemini-2.5-pro | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| google/gemini-3-pro-preview | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| xai/grok-2-vision | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| xai/grok-4-fast-non-reasoning | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| xai/grok-4.1-fast-reasoning | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| xai/grok-4 | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| mistral/pixtral-large-latest | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| mistral/pixtral-12b-2409 | 4/12 | 16 | 0 | 0 | 0 | 4 | 0 |
| mistral/ministral-3b-latest | 4/12 | 16 | 0 | 0 | 1 | 3 | 0 |
| mistral/ministral-8b-latest | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| perplexity/sonar-pro | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |

## Summary

- **Active Models:** 12
- **Eliminated:** 16
- **Models with Failures:** 9

## Arena Results by Horizon

*Models with <10 scored rounds on a given horizon are excluded from that arena.*

### 15m Arena Winners

*This horizon is not rankable: only 3 negative examples (25.0%). Rankings would not be statistically meaningful.*

### 1h Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | anthropic/claude-sonnet-4-5 | 0.28 | 🔴0.82 | 0.79 | 0.010 |
| 🥈 | anthropic/claude-haiku-4-5 | 0.19 | 🔴0.87 | 0.71 | 0.016 |
| 🥉 | anthropic/claude-3-7-sonnet-latest | 0.13 | 🔴0.91 | 0.73 | 0.013 |
| 4 | mistral/pixtral-large-latest | 0.00 | 🔴1.01 | 0.80 | 0.018 |

### 4h Arena Winners

*This horizon is not rankable: only 4 positive examples (33.3%). Rankings would not be statistically meaningful.*

### 24h Arena Winners

*This horizon is not rankable: only 4 positive examples (33.3%). Rankings would not be statistically meaningful.*

## Cross-Horizon Strength

*Models appearing in multiple horizon arenas demonstrate consistent performance.*

| Model | Arenas | Horizons | Avg Rank |
|-------|--------|----------|----------|
| anthropic/claude-3-7-sonnet-latest | 3/4 | 15m, 1h, 4h | 3.3 |
| openai/gpt-5.2 | 3/4 | 15m, 1h, 24h | 3.3 |
| anthropic/claude-haiku-4-5 | 3/4 | 15m, 1h, 24h | 4.0 |
| anthropic/claude-sonnet-4-5 | 3/4 | 15m, 1h, 24h | 4.3 |
| mistral/pixtral-large-latest | 2/4 | 1h, 4h | 3.5 |

**Legend:** ⭐ = Top performer across all horizons

## Final Standings (Survivors)

*Models with <80% coverage or <10 effective rounds on all horizons are excluded.*

| Rank | Model | Status | Rnds | Cov | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|------|-------|--------|------|-----|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| 🥇 | xai/grok-4 | ✅ Active | 12 | 100% | 🟡0.512 | 🟡0.628 | 🟡0.797 | 🔴1.286 | 🔴0.806 | 100.0 | 0.269 | 0.448 | 0.50 | **0.8201** |
| 🥈 | anthropic/claude-opus-4-5 | ✅ Active | 12 | 100% | 🟢0.456 | 🟡0.743 | 🔴0.872 | 🟡0.797 | 🟡0.717 | 90.5 | 0.311 | 0.466 | 0.50 | **0.7721** |
| 🥉 | google/gemini-2.0-flash | ✅ Active | 12 | 100% | 🟡0.532 | 🟡0.781 | 🔴0.938 | 🔴1.026 | 🔴0.819 | 85.7 | 0.357 | 0.394 | 0.50 | **0.7607** |
| 4 | anthropic/claude-3-5-haiku-latest | ✅ Active | 12 | 100% | 🟢0.446 | 🟡0.729 | 🔴1.092 | 🔴1.079 | 🔴0.837 | 90.5 | 0.358 | 0.503 | 0.50 | **0.7576** |
| 5 | anthropic/claude-sonnet-4-5 | ✅ Active | 12 | 100% | 🟡0.594 | 🔴0.820 | 🔴0.880 | 🔴0.837 | 🟡0.783 | 66.7 | 0.473 | 0.357 | 0.50 | **0.6744** |
| 6 | anthropic/claude-haiku-4-5 | ✅ Active | 12 | 100% | 🟡0.675 | 🔴0.867 | 🔴0.872 | 🟡0.624 | 🟡0.759 | 47.6 | 0.367 | 0.369 | 0.50 | **0.6116** |
| 7 | xai/grok-4-fast-non-reasoning | ✅ Active | 12 | 100% | 🟡0.629 | 🔴0.898 | 🔴1.012 | 🟡0.766 | 🔴0.826 | 47.6 | 0.334 | 0.528 | 0.50 | **0.5849** |
| 8 | openai/gpt-4.1 | ✅ Active | 12 | 100% | 🟡0.749 | 🔴0.912 | 🔴1.368 | 🔴1.554 | 🔴1.146 | 47.6 | 0.565 | 0.509 | 0.50 | **0.5539** |
| 9 | anthropic/claude-3-7-sonnet-latest | ✅ Active | 12 | 100% | 🟡0.560 | 🔴0.915 | 🔴1.047 | 🔴0.840 | 🔴0.840 | 47.6 | 0.523 | 0.544 | 0.50 | **0.5531** |
| 10 | mistral/pixtral-large-latest | ✅ Active | 12 | 100% | 🔴0.824 | 🔴1.006 | 🔴1.148 | 🔴1.193 | 🔴1.043 | 38.1 | 0.314 | 0.775 | 0.50 | **0.5002** |

## All Models (Research Reference)

*Includes eliminated models for comparative analysis. Rankings are by raw composite score, not tournament outcome.*

| Rank | Model | Status | Rnds | Cov | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|------|-------|--------|------|-----|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| 🥇 | openai/gpt-5.2 | ✅ Active | 9 | 100%⚠️ | 🟡0.562 | 🟡0.639 | 🔴0.859 | 🔴0.822 | 🟡0.720 | 100.0 | 0.461 | 0.228 | 0.50 | **0.8351** |
| 🥈 | xai/grok-4 | ✅ Active | 12 | 100% | 🟡0.512 | 🟡0.628 | 🟡0.797 | 🔴1.286 | 🔴0.806 | 100.0 | 0.269 | 0.448 | 0.50 | **0.8201** |
| 🥉 | anthropic/claude-opus-4-5 | ✅ Active | 12 | 100% | 🟢0.456 | 🟡0.743 | 🔴0.872 | 🟡0.797 | 🟡0.717 | 90.5 | 0.311 | 0.466 | 0.50 | **0.7721** |
| 4 | google/gemini-2.0-flash | ✅ Active | 12 | 100% | 🟡0.532 | 🟡0.781 | 🔴0.938 | 🔴1.026 | 🔴0.819 | 85.7 | 0.357 | 0.394 | 0.50 | **0.7607** |
| 5 | anthropic/claude-3-5-haiku-latest | ✅ Active | 12 | 100% | 🟢0.446 | 🟡0.729 | 🔴1.092 | 🔴1.079 | 🔴0.837 | 90.5 | 0.358 | 0.503 | 0.50 | **0.7576** |
| 6 | anthropic/claude-sonnet-4-5 | ✅ Active | 12 | 100% | 🟡0.594 | 🔴0.820 | 🔴0.880 | 🔴0.837 | 🟡0.783 | 66.7 | 0.473 | 0.357 | 0.50 | **0.6744** |
| 7 | anthropic/claude-haiku-4-5 | ✅ Active | 12 | 100% | 🟡0.675 | 🔴0.867 | 🔴0.872 | 🟡0.624 | 🟡0.759 | 47.6 | 0.367 | 0.369 | 0.50 | **0.6116** |
| 8 | xai/grok-4-fast-non-reasoning | ✅ Active | 12 | 100% | 🟡0.629 | 🔴0.898 | 🔴1.012 | 🟡0.766 | 🔴0.826 | 47.6 | 0.334 | 0.528 | 0.50 | **0.5849** |
| 9 | anthropic/claude-3-5-sonnet-20241022 | ❌ P2 | 12 | 100% | 🟡0.718 | 🔴0.929 | 🔴0.821 | 🟡0.753 | 🔴0.805 | 47.6 | 0.314 | 0.633 | 0.50 | **0.5668** |
| 10 | google/gemini-2.5-pro | ❌ P2 | 12 | 100% | 🟡0.749 | 🔴0.891 | 🔴1.254 | 🔴1.566 | 🔴1.115 | 47.6 | 0.184 | 0.750 | 0.50 | **0.5629** |
| 11 | openai/gpt-4.1 | ✅ Active | 12 | 100% | 🟡0.749 | 🔴0.912 | 🔴1.368 | 🔴1.554 | 🔴1.146 | 47.6 | 0.565 | 0.509 | 0.50 | **0.5539** |
| 12 | anthropic/claude-3-7-sonnet-latest | ✅ Active | 12 | 100% | 🟡0.560 | 🔴0.915 | 🔴1.047 | 🔴0.840 | 🔴0.840 | 47.6 | 0.523 | 0.544 | 0.50 | **0.5531** |
| 13 | google/gemini-2.5-flash-lite | ❌ P2 | 12 | 100% | 🔴1.204 | 🔴1.002 | 🔴1.161 | 🔴1.415 | 🔴1.195 | 38.1 | 0.245 | 0.715 | 0.50 | **0.5226** |
| 14 | mistral/ministral-8b-latest | ❌ P2 | 12 | 100% | 🟡0.594 | 🔴0.976 | 🔴1.216 | 🔴0.933 | 🔴0.930 | 42.9 | 0.143 | 0.893 | 0.50 | **0.5214** |
| 15 | xai/grok-4.1-fast-reasoning | ❌ P2 | 12 | 100% | 🟡0.784 | 🔴1.016 | 🔴1.172 | 🔴0.996 | 🔴0.992 | 38.1 | 0.195 | 0.804 | 0.50 | **0.5123** |
| 16 | mistral/pixtral-large-latest | ✅ Active | 12 | 100% | 🔴0.824 | 🔴1.006 | 🔴1.148 | 🔴1.193 | 🔴1.043 | 38.1 | 0.314 | 0.775 | 0.50 | **0.5002** |
| 17 | google/gemini-3-pro-preview | ❌ P0 | 4 | 100%⚠️ | 🟢0.065 | 🔴0.944 | 🔴1.358 | 🔴0.959 | 🔴0.831 | 42.9 | 0.626 | 0.816 | 0.50 | **0.4643** |
| 18 | google/gemini-2.5-flash | ❌ P2 | 12 | 100% | 🟡0.767 | 🔴1.130 | 🔴1.084 | 🔴1.468 | 🔴1.112 | 19.0 | 0.190 | 0.837 | 0.50 | **0.4303** |
| 19 | openai/gpt-4.1-mini | ✅ Active | 9 | 100%⚠️ | 🔴0.858 | 🔴1.082 | 🔴1.541 | 🔴2.002 | 🔴1.371 | 33.3 | 0.830 | 0.685 | 0.50 | **0.4219** |
| 20 | perplexity/sonar-pro | ❌ P1 | 8 | 100%⚠️ | 🔴0.829 | 🔴1.263 | 🔴1.450 | 🔴1.127 | 🔴1.167 | 4.8 | 0.685 | 0.600 | 0.50 | **0.3462** |
| 21 | xai/grok-2-vision | ❌ P1 | 8 | 100%⚠️ | 🟡0.757 | 🔴1.178 | 🔴1.287 | 🔴1.271 | 🔴1.123 | 9.5 | 0.730 | 0.694 | 0.50 | **0.3398** |

**Legend:**

*Log loss color coding:*
- 🟢 Good (≤ 0.5) | 🟡 OK (≤ 0.8) | 🔴 Poor (> 0.8)

*Column definitions:*
- `Rnds`: Number of successful rounds (failed rounds are excluded from metrics)
- `Cov`: Coverage percentage (effective rounds / intended rounds). ⚠️ indicates <80% coverage or <10 effective rounds on any horizon
- `15m, 1h, 4h, 24h`: Mean log loss for that horizon across all valid rounds
- `Mean`: Arithmetic mean of the four horizon log losses
- `%Rank`: Percentile rank among all models by composite Score (higher = better)
- `BestWin`: Best rolling-window average log loss (lower = better)
- `Stabil`: Standard deviation of per-round log loss (lower = better)
- `TtP`: Time-to-pivot ratio (lower = better). *Note: With the current no-new-low ground truth system, timing data is not available; all models show TtP = 0.50.*
- `Score`: Composite metric combining rank, best window, stability, and timing (40% rank + 30% bestWin⁻¹ + 20% stabil⁻¹ + 10% TtP⁻¹). *Non-rankable horizons (insufficient label diversity) are excluded from composite score calculation.*

## Per-Horizon Rankings (All Models)

### 15m Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | google/gemini-3-pro-preview | 🟢0.0648 | ❌ P0 |
| 2 | anthropic/claude-3-5-haiku-latest | 🟢0.4463 | ✅ Active |
| 3 | anthropic/claude-opus-4-5 | 🟢0.4562 | ✅ Active |
| 4 | xai/grok-4 | 🟡0.5115 | ✅ Active |
| 5 | google/gemini-2.0-flash | 🟡0.5317 | ✅ Active |
| 6 | anthropic/claude-3-7-sonnet-latest | 🟡0.5601 | ✅ Active |
| 7 | openai/gpt-5.2 | 🟡0.5623 | ✅ Active |
| 8 | mistral/ministral-8b-latest | 🟡0.5935 | ❌ P2 |
| 9 | anthropic/claude-sonnet-4-5 | 🟡0.5940 | ✅ Active |
| 10 | xai/grok-4-fast-non-reasoning | 🟡0.6288 | ✅ Active |

### 1h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | xai/grok-4 | 🟡0.6278 | ✅ Active |
| 2 | openai/gpt-5.2 | 🟡0.6390 | ✅ Active |
| 3 | anthropic/claude-3-5-haiku-latest | 🟡0.7288 | ✅ Active |
| 4 | anthropic/claude-opus-4-5 | 🟡0.7432 | ✅ Active |
| 5 | google/gemini-2.0-flash | 🟡0.7807 | ✅ Active |
| 6 | anthropic/claude-sonnet-4-5 | 🔴0.8197 | ✅ Active |
| 7 | anthropic/claude-haiku-4-5 | 🔴0.8670 | ✅ Active |
| 8 | google/gemini-2.5-pro | 🔴0.8905 | ❌ P2 |
| 9 | xai/grok-4-fast-non-reasoning | 🔴0.8982 | ✅ Active |
| 10 | openai/gpt-4.1 | 🔴0.9124 | ✅ Active |

### 4h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | xai/grok-4 | 🟡0.7971 | ✅ Active |
| 2 | anthropic/claude-3-5-sonnet-20241022 | 🔴0.8210 | ❌ P2 |
| 3 | openai/gpt-5.2 | 🔴0.8587 | ✅ Active |
| 4 | anthropic/claude-haiku-4-5 | 🔴0.8719 | ✅ Active |
| 5 | anthropic/claude-opus-4-5 | 🔴0.8724 | ✅ Active |
| 6 | anthropic/claude-sonnet-4-5 | 🔴0.8795 | ✅ Active |
| 7 | google/gemini-2.0-flash | 🔴0.9377 | ✅ Active |
| 8 | xai/grok-4-fast-non-reasoning | 🔴1.0124 | ✅ Active |
| 9 | anthropic/claude-3-7-sonnet-latest | 🔴1.0469 | ✅ Active |
| 10 | google/gemini-2.5-flash | 🔴1.0835 | ❌ P2 |

### 24h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | anthropic/claude-haiku-4-5 | 🟡0.6235 | ✅ Active |
| 2 | anthropic/claude-3-5-sonnet-20241022 | 🟡0.7533 | ❌ P2 |
| 3 | xai/grok-4-fast-non-reasoning | 🟡0.7656 | ✅ Active |
| 4 | anthropic/claude-opus-4-5 | 🟡0.7969 | ✅ Active |
| 5 | openai/gpt-5.2 | 🔴0.8219 | ✅ Active |
| 6 | anthropic/claude-sonnet-4-5 | 🔴0.8374 | ✅ Active |
| 7 | anthropic/claude-3-7-sonnet-latest | 🔴0.8398 | ✅ Active |
| 8 | mistral/ministral-8b-latest | 🔴0.9335 | ❌ P2 |
| 9 | google/gemini-3-pro-preview | 🔴0.9588 | ❌ P0 |
| 10 | xai/grok-4.1-fast-reasoning | 🔴0.9960 | ❌ P2 |

## Elimination Audit

*Detailed per-horizon elimination reasons for each eliminated model.*

### anthropic/claude-3-5-sonnet-20241022 (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 2 | high regret or instability | 0.718 |
| 1h | 2 | high regret or instability | 0.929 |
| 4h | 2 | high regret or instability | 0.821 |
| 24h | 2 | high regret or instability | 0.753 |

### openai/gpt-4o (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | - | No scored rounds | N/A |
| 1h | - | No scored rounds | N/A |
| 4h | - | No scored rounds | N/A |
| 24h | - | No scored rounds | N/A |

### openai/gpt-4o-mini (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | - | No scored rounds | N/A |
| 1h | - | No scored rounds | N/A |
| 4h | - | No scored rounds | N/A |
| 24h | - | No scored rounds | N/A |

### openai/gpt-5 (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | - | No scored rounds | N/A |
| 1h | - | No scored rounds | N/A |
| 4h | - | No scored rounds | N/A |
| 24h | - | No scored rounds | N/A |

### openai/gpt-5-mini (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | - | No scored rounds | N/A |
| 1h | - | No scored rounds | N/A |
| 4h | - | No scored rounds | N/A |
| 24h | - | No scored rounds | N/A |

### openai/gpt-5-nano (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | - | No scored rounds | N/A |
| 1h | - | No scored rounds | N/A |
| 4h | - | No scored rounds | N/A |
| 24h | - | No scored rounds | N/A |

### google/gemini-2.5-flash (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 2 | high regret or instability | 0.767 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 1.130 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 1.084 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 1.468 |

### google/gemini-2.5-flash-lite (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 1.204 |
| 1h | 2 | high regret or instability | 1.002 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 1.161 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 1.415 |

### google/gemini-2.5-pro (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 2 | high regret or instability | 0.749 |
| 1h | 2 | high regret or instability | 0.891 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 1.254 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 1.566 |

### google/gemini-3-pro-preview (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 0 | Phase 0: Failed sanity check on 15m | 0.065 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 0.944 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 1.358 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 0.959 |

### xai/grok-2-vision (Eliminated Phase 1)

**Model-level reason:** qualifies for 0 horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 0.757 |
| 1h | 1 | bottom 30% percentile | 1.178 |
| 4h | 1 | bottom 30% percentile | 1.287 |
| 24h | 1 | bottom 30% percentile | 1.271 |

### xai/grok-4.1-fast-reasoning (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 0.784 |
| 1h | 1 | bottom 30% percentile | 1.016 |
| 4h | 1 | bottom 30% percentile | 1.172 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 0.996 |

### mistral/pixtral-12b-2409 (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | - | No scored rounds | N/A |
| 1h | - | No scored rounds | N/A |
| 4h | - | No scored rounds | N/A |
| 24h | - | No scored rounds | N/A |

### mistral/ministral-3b-latest (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | - | No scored rounds | N/A |
| 1h | - | No scored rounds | N/A |
| 4h | - | No scored rounds | N/A |
| 24h | - | No scored rounds | N/A |

### mistral/ministral-8b-latest (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 0.594 |
| 1h | 1 | bottom 30% percentile | 0.976 |
| 4h | 1 | bottom 30% percentile | 1.216 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 0.933 |

### perplexity/sonar-pro (Eliminated Phase 1)

**Model-level reason:** qualifies for 0 horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 0.829 |
| 1h | 1 | bottom 30% percentile | 1.263 |
| 4h | 1 | bottom 30% percentile | 1.450 |
| 24h | 1 | bottom 30% percentile | 1.127 |

## Model Failures

*Note: Failed rounds (API errors, malformed responses) are excluded from scoring. The `Rnds` column shows successful rounds used in metric calculation.*

| Model | Failed Rounds |
|-------|---------------|
| openai/gpt-4o | 1, 2, 3, 4 |
| openai/gpt-4o-mini | 1, 2, 3, 4 |
| openai/gpt-4.1-mini | 1, 4, 5 |
| openai/gpt-5 | 1, 2, 3, 4 |
| openai/gpt-5-mini | 1, 2, 3, 4 |
| openai/gpt-5-nano | 1, 2, 3, 4 |
| openai/gpt-5.2 | 4, 5, 11 |
| mistral/pixtral-12b-2409 | 1, 2, 3, 4 |
| mistral/ministral-3b-latest | 1, 2, 3, 4 |

---
*Auto-generated by agent_006 benchmark*