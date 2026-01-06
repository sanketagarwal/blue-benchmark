# agent_006 Benchmark Results

**Symbol:** COINBASE_SPOT_BTC_USD
**Start Time:** 2025-12-20T12:00:00.000Z
**Progress:** Round 12/12 (Phase 3)
**Last Updated:** 2026-01-06T20:28:29.632Z

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

## Run Invariants

*Computed once, used consistently throughout this report.*

### Horizon Summary
| Horizon | Labels | True | False | pTrue | Rankable | Reason |
|---------|--------|------|-------|-------|----------|--------|
| 15m | 12 | 10 | 2 | 0.83 | ❌ No | only 2 negative examples (16.7%) |
| 1h | 12 | 7 | 5 | 0.58 | ✅ Yes | - |
| 4h | 12 | 12 | 0 | 1.00 | ❌ No | only 0 negative examples (0.0%) |
| 24h | 12 | 12 | 0 | 1.00 | ❌ No | only 0 negative examples (0.0%) |

### Model Sets
- **Evaluated:** 28 models
- **Effective:** 22 models (at least 1 successful prediction)
- **Valid (Phase 0A):** 20 models
- **Qualified (Phase 1):** 20 models
- **Arena Eligible:** 20 models (qualified + adequate coverage)

## Dataset Diagnostics

*Label distribution and baseline performance for interpreting model skill.*

| Horizon | N | True | False | pTrue | Random LL | Prevalence LL | Extreme True LL | Extreme False LL |
|---------|---|------|-------|-------|-----------|---------------|-----------------|------------------|
| 15m | 12 | 10 | 2 | 0.833 | 0.693 | 0.451 | 5.756 | 28.782 |
| 1h | 12 | 7 | 5 | 0.583 | 0.693 | 0.679 | 14.391 | 20.148 |
| 4h | 12 | 12 | 0 | 1.000 | 0.693 | 9.99e-16 | 0.000 | 34.539 |
| 24h | 12 | 12 | 0 | 1.000 | 0.693 | 9.99e-16 | 0.000 | 34.539 |

*Clipping: ε = 1e-15 (probabilities clipped to [ε, 1-ε] to avoid log(0))*

**Interpretation:**
- *Prevalence LL*: Best possible constant predictor. Models must beat this to show skill.
- *Extreme True/False LL*: Diagnostic baselines for p≈1 or p≈0 predictions. High values indicate label imbalance makes extreme predictions catastrophic.

**Per-round label distribution:**

| Horizon | Min | Median | Max |
|---------|-----|--------|-----|
| 15m | 0 | 1 | 1 |
| 1h | 0 | 1 | 1 |
| 4h | 1 | 1 | 1 |
| 24h | 1 | 1 | 1 |

⚠️ **15m horizon**: Only 2 negative examples (16.7%). Results are **not rankable** for this horizon.
⚠️ **4h horizon**: Only 0 negative examples (0.0%). Results are **not rankable** for this horizon.
⚠️ **24h horizon**: Only 0 negative examples (0.0%). Results are **not rankable** for this horizon.

## Prediction Diversity

*Variety of predictions per model. Low diversity suggests caching or degenerate behavior.*

*Stats (pMean, pStdDev, etc.) are computed only on successful predictions (Effective N). Failed rounds are excluded.*

### anthropic/claude-haiku-4-5

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.618 | 0.280 | 0.720 | 0.148 | 0.83 |
| 1h | 12 | 6 | 0.601 | 0.300 | 0.680 | 0.134 | 0.83 |
| 4h | 12 | 7 | 0.538 | 0.270 | 0.750 | 0.185 | 0.58 |
| 24h | 12 | 9 | 0.424 | 0.250 | 0.780 | 0.204 | 0.33 |

### anthropic/claude-sonnet-4-5

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 3 | 0.710 | 0.650 | 0.720 | 0.023 | 1.00 |
| 1h | 12 | 3 | 0.678 | 0.620 | 0.720 | 0.021 | 1.00 |
| 4h | 12 | 6 | 0.513 | 0.280 | 0.780 | 0.206 | 0.42 |
| 24h | 12 | 4 | 0.746 | 0.370 | 0.820 | 0.116 | 0.92 |

### anthropic/claude-opus-4-5

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.812 | 0.720 | 0.850 | 0.046 | 1.00 |
| 1h | 12 | 4 | 0.752 | 0.680 | 0.800 | 0.041 | 1.00 |
| 4h | 12 | 5 | 0.568 | 0.400 | 0.750 | 0.143 | 0.58 |
| 24h | 12 | 4 | 0.635 | 0.600 | 0.700 | 0.030 | 1.00 |

### anthropic/claude-3-5-sonnet-20241022

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.475 | 0.150 | 0.750 | 0.230 | 0.50 |
| 1h | 12 | 6 | 0.542 | 0.250 | 0.800 | 0.192 | 0.58 |
| 4h | 12 | 7 | 0.629 | 0.350 | 0.800 | 0.130 | 0.83 |
| 24h | 12 | 8 | 0.558 | 0.300 | 0.800 | 0.143 | 0.67 |

### anthropic/claude-3-5-haiku-latest

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.617 | 0.300 | 0.750 | 0.176 | 0.75 |
| 1h | 12 | 6 | 0.700 | 0.350 | 0.850 | 0.124 | 0.92 |
| 4h | 12 | 5 | 0.754 | 0.600 | 0.900 | 0.114 | 1.00 |
| 24h | 12 | 5 | 0.662 | 0.550 | 0.900 | 0.117 | 1.00 |

### anthropic/claude-3-7-sonnet-latest

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.608 | 0.250 | 0.750 | 0.182 | 0.75 |
| 1h | 12 | 8 | 0.586 | 0.300 | 0.800 | 0.181 | 0.67 |
| 4h | 12 | 6 | 0.643 | 0.350 | 0.750 | 0.103 | 0.92 |
| 24h | 12 | 8 | 0.447 | 0.200 | 0.750 | 0.152 | 0.33 |

### openai/gpt-4.1

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 8 | 0.755 | 0.600 | 0.950 | 0.109 | 1.00 |
| 1h | 12 | 6 | 0.779 | 0.700 | 0.930 | 0.076 | 1.00 |
| 4h | 12 | 7 | 0.826 | 0.700 | 0.950 | 0.065 | 1.00 |
| 24h | 12 | 6 | 0.851 | 0.700 | 0.950 | 0.067 | 1.00 |

### openai/gpt-5.2

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 8 | 0.666 | 0.380 | 0.860 | 0.141 | 0.83 |
| 1h | 12 | 11 | 0.622 | 0.340 | 0.810 | 0.133 | 0.83 |
| 4h | 12 | 9 | 0.709 | 0.600 | 0.780 | 0.050 | 1.00 |
| 24h | 12 | 8 | 0.730 | 0.620 | 0.900 | 0.106 | 1.00 |

### google/gemini-2.0-flash

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 4 | 0.600 | 0.200 | 0.700 | 0.178 | 0.75 |
| 1h | 12 | 3 | 0.529 | 0.300 | 0.650 | 0.133 | 0.75 |
| 4h | 12 | 5 | 0.558 | 0.300 | 0.700 | 0.102 | 0.83 |
| 24h | 12 | 7 | 0.504 | 0.200 | 0.700 | 0.159 | 0.58 |

### google/gemini-2.5-flash

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 9 | 0.658 | 0.150 | 0.900 | 0.232 | 0.75 |
| 1h | 12 | 8 | 0.529 | 0.000 | 0.850 | 0.275 | 0.58 |
| 4h | 12 | 4 | 0.862 | 0.800 | 0.950 | 0.051 | 1.00 |
| 24h | 12 | 3 | 0.940 | 0.900 | 0.980 | 0.024 | 1.00 |

### google/gemini-2.5-flash-lite

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 7 | 0.592 | 0.250 | 0.850 | 0.208 | 0.67 |
| 1h | 12 | 7 | 0.546 | 0.150 | 0.850 | 0.257 | 0.58 |
| 4h | 12 | 9 | 0.637 | 0.100 | 0.900 | 0.265 | 0.67 |
| 24h | 12 | 8 | 0.679 | 0.050 | 0.950 | 0.305 | 0.75 |

### google/gemini-2.5-pro

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 8 | 0.633 | 0.150 | 0.900 | 0.267 | 0.67 |
| 1h | 12 | 6 | 0.650 | 0.150 | 0.950 | 0.224 | 0.83 |
| 4h | 12 | 5 | 0.871 | 0.700 | 0.950 | 0.069 | 1.00 |
| 24h | 12 | 3 | 0.944 | 0.900 | 0.980 | 0.021 | 1.00 |

### google/gemini-3-pro-preview

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 7 | 0.721 | 0.250 | 0.900 | 0.200 | 0.83 |
| 1h | 12 | 6 | 0.650 | 0.200 | 0.800 | 0.195 | 0.83 |
| 4h | 12 | 4 | 0.910 | 0.850 | 0.950 | 0.034 | 1.00 |
| 24h | 12 | 3 | 0.932 | 0.900 | 0.980 | 0.028 | 1.00 |

### xai/grok-2-vision

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 3 | 0.758 | 0.700 | 0.800 | 0.045 | 1.00 |
| 1h | 12 | 7 | 0.700 | 0.400 | 0.900 | 0.115 | 0.92 |
| 4h | 12 | 6 | 0.650 | 0.400 | 0.900 | 0.161 | 0.75 |
| 24h | 12 | 6 | 0.588 | 0.400 | 0.850 | 0.134 | 0.58 |

### xai/grok-4-fast-non-reasoning

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 4 | 0.750 | 0.700 | 0.850 | 0.058 | 1.00 |
| 1h | 12 | 4 | 0.708 | 0.650 | 0.800 | 0.057 | 1.00 |
| 4h | 12 | 7 | 0.521 | 0.250 | 0.900 | 0.220 | 0.50 |
| 24h | 12 | 5 | 0.350 | 0.150 | 0.750 | 0.153 | 0.08 |

### xai/grok-4.1-fast-reasoning

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.764 | 0.300 | 0.920 | 0.165 | 0.92 |
| 1h | 12 | 6 | 0.732 | 0.250 | 0.880 | 0.156 | 0.92 |
| 4h | 12 | 5 | 0.752 | 0.700 | 0.850 | 0.059 | 1.00 |
| 24h | 12 | 8 | 0.638 | 0.300 | 0.900 | 0.189 | 0.75 |

### xai/grok-4

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 9 | 0.579 | 0.200 | 0.950 | 0.246 | 0.58 |
| 1h | 12 | 7 | 0.604 | 0.250 | 0.850 | 0.230 | 0.67 |
| 4h | 12 | 6 | 0.771 | 0.350 | 0.900 | 0.149 | 0.92 |
| 24h | 12 | 5 | 0.767 | 0.250 | 0.950 | 0.250 | 0.83 |

### mistral/pixtral-large-latest

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 7 | 0.554 | 0.150 | 0.900 | 0.279 | 0.50 |
| 1h | 12 | 9 | 0.537 | 0.200 | 0.850 | 0.256 | 0.58 |
| 4h | 12 | 6 | 0.692 | 0.400 | 0.800 | 0.126 | 0.92 |
| 24h | 12 | 8 | 0.713 | 0.450 | 0.900 | 0.142 | 0.83 |

### mistral/ministral-8b-latest

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 3 | 0.925 | 0.850 | 0.950 | 0.032 | 1.00 |
| 1h | 12 | 5 | 0.890 | 0.750 | 0.950 | 0.054 | 1.00 |
| 4h | 12 | 6 | 0.853 | 0.750 | 0.980 | 0.065 | 1.00 |
| 24h | 12 | 6 | 0.802 | 0.700 | 0.970 | 0.077 | 1.00 |

### perplexity/sonar-pro

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.721 | 0.300 | 0.850 | 0.153 | 0.92 |
| 1h | 12 | 4 | 0.763 | 0.650 | 0.800 | 0.046 | 1.00 |
| 4h | 12 | 7 | 0.792 | 0.600 | 0.900 | 0.093 | 1.00 |
| 24h | 12 | 8 | 0.625 | 0.250 | 0.900 | 0.228 | 0.67 |

### openai/gpt-5-mini

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 2 | 0.625 | 0.400 | 0.850 | 0.225 | 0.50 |
| 1h | 12 | 2 | 0.475 | 0.250 | 0.700 | 0.225 | 0.50 |
| 4h | 12 | 2 | 0.825 | 0.800 | 0.850 | 0.025 | 1.00 |
| 24h | 12 | 2 | 0.800 | 0.700 | 0.900 | 0.100 | 1.00 |
**Failures:** 10 schema


### openai/gpt-4.1-mini

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 4 | 0.750 | 0.650 | 0.850 | 0.076 | 1.00 |
| 1h | 12 | 4 | 0.775 | 0.700 | 0.850 | 0.048 | 1.00 |
| 4h | 12 | 4 | 0.825 | 0.700 | 0.900 | 0.063 | 1.00 |
| 24h | 12 | 5 | 0.842 | 0.700 | 0.950 | 0.098 | 1.00 |
**Failures:** 6 schema


## Failure Audit

*Failed rounds are excluded from scoring.*

**Aggregate:**
- Total model calls: 336 (28 models × 12 rounds)
- Failed model calls: 40 (11.9%)
- Total horizon predictions: 1344 (28 models × 12 rounds × 4 horizons)
- Failed horizon predictions: 160 (11.9%)

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
| openai/gpt-4.1-mini | 6/12 | 24 | 0 | 0 | 0 | 6 | 0 |
| openai/gpt-5 | 4/12 | 16 | 0 | 0 | 0 | 4 | 0 |
| openai/gpt-5-mini | 10/12 | 40 | 0 | 0 | 0 | 10 | 0 |
| openai/gpt-5-nano | 4/12 | 16 | 0 | 0 | 0 | 4 | 0 |
| openai/gpt-5.2 | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
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
| mistral/ministral-3b-latest | 4/12 | 16 | 0 | 0 | 0 | 4 | 0 |
| mistral/ministral-8b-latest | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| perplexity/sonar-pro | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |

## Summary

- **Active Models:** 21
- **Eliminated:** 7
- **Models with Failures:** 8

## Phase 0A Validity Gates

*Strict filters to block garbage models before qualification.*

### Summary by Horizon (Violation Counts)

| Horizon | Evaluated | Valid | Invalid | Coverage | Failures | Degeneracy | Extreme Wrong |
|---------|-----------|-------|---------|----------|----------|------------|---------------|
| 15m | 28 | 19 | 9 | 8 | 8 | 0 | 0 |
| 1h | 28 | 18 | 10 | 8 | 8 | 0 | 2 |
| 4h | 28 | 20 | 8 | 8 | 8 | 0 | 0 |
| 24h | 28 | 16 | 12 | 8 | 8 | 0 | 1 |

*Note: Reason counts are not mutually exclusive. A single model can fail multiple gates.*

### Invalid Models Detail

**openai/gpt-4o** (failed 4 gates on: 15m, 1h, 4h, 24h)
- 15m: coverage (0.0%), failure_rate (33.3%)
- 1h: coverage (0.0%), failure_rate (33.3%)
- 4h: coverage (0.0%), failure_rate (33.3%)
- 24h: coverage (0.0%), failure_rate (33.3%)

**openai/gpt-4o-mini** (failed 4 gates on: 15m, 1h, 4h, 24h)
- 15m: coverage (0.0%), failure_rate (33.3%)
- 1h: coverage (0.0%), failure_rate (33.3%)
- 4h: coverage (0.0%), failure_rate (33.3%)
- 24h: coverage (0.0%), failure_rate (33.3%)

**openai/gpt-4.1-mini** (failed 4 gates on: 15m, 1h, 4h, 24h)
- 15m: coverage (50.0%), failure_rate (50.0%)
- 1h: coverage (50.0%), failure_rate (50.0%)
- 4h: coverage (50.0%), failure_rate (50.0%)
- 24h: coverage (50.0%), failure_rate (50.0%)

**openai/gpt-5** (failed 4 gates on: 15m, 1h, 4h, 24h)
- 15m: coverage (0.0%), failure_rate (33.3%)
- 1h: coverage (0.0%), failure_rate (33.3%)
- 4h: coverage (0.0%), failure_rate (33.3%)
- 24h: coverage (0.0%), failure_rate (33.3%)

**openai/gpt-5-mini** (failed 4 gates on: 15m, 1h, 4h, 24h)
- 15m: coverage (16.7%), failure_rate (83.3%)
- 1h: coverage (16.7%), failure_rate (83.3%)
- 4h: coverage (16.7%), failure_rate (83.3%)
- 24h: coverage (16.7%), failure_rate (83.3%)

**openai/gpt-5-nano** (failed 4 gates on: 15m, 1h, 4h, 24h)
- 15m: coverage (0.0%), failure_rate (33.3%)
- 1h: coverage (0.0%), failure_rate (33.3%)
- 4h: coverage (0.0%), failure_rate (33.3%)
- 24h: coverage (0.0%), failure_rate (33.3%)

**google/gemini-2.5-flash** (failed 1 gate on: 24h)
- 24h: extreme_predictions

**google/gemini-2.5-pro** (failed 1 gate on: 24h)
- 24h: extreme_predictions

**google/gemini-3-pro-preview** (failed 1 gate on: 24h)
- 24h: extreme_predictions

**xai/grok-4-fast-non-reasoning** (failed 1 gate on: 24h)
- 24h: extreme_wrong_rate (25.0%)

**mistral/pixtral-large-latest** (failed 1 gate on: 1h)
- 1h: extreme_wrong_rate (25.0%)

**mistral/pixtral-12b-2409** (failed 4 gates on: 15m, 1h, 4h, 24h)
- 15m: coverage (0.0%), failure_rate (33.3%)
- 1h: coverage (0.0%), failure_rate (33.3%)
- 4h: coverage (0.0%), failure_rate (33.3%)
- 24h: coverage (0.0%), failure_rate (33.3%)

**mistral/ministral-3b-latest** (failed 4 gates on: 15m, 1h, 4h, 24h)
- 15m: coverage (0.0%), failure_rate (33.3%)
- 1h: coverage (0.0%), failure_rate (33.3%)
- 4h: coverage (0.0%), failure_rate (33.3%)
- 24h: coverage (0.0%), failure_rate (33.3%)

**mistral/ministral-8b-latest** (failed 2 gates on: 15m, 1h)
- 15m: extreme_predictions
- 1h: extreme_wrong_rate (41.7%)

## Extension Rule Outcome

*Horizons with >5 qualified models get 6 additional rounds (rankability determines purpose: refine rankings vs achieve rankability).*

| Horizon | Rankable | Qualified | Eligible | Extend? | Extra Rounds | Models Included |
|---------|----------|-----------|----------|---------|--------------|-----------------|
| 15m | ✅ Yes | 10 | 19 | ✅ Yes | 6 | 19 (all eligible) |
| 1h | ✅ Yes | 11 | 18 | ✅ Yes | 6 | 18 (all eligible) |
| 4h | ✅ Yes | 22 | 20 | ✅ Yes | 6 | 20 (all eligible) |
| 24h | ✅ Yes | 22 | 16 | ✅ Yes | 6 | 16 (all eligible) |

**Summary:** 4 horizons will receive extension rounds (24 total extra rounds).

### Extension Details

**15m Horizon** (extending by 6 rounds)
- Reason: 10 qualified models > threshold (5)
- Models: anthropic/claude-haiku-4-5, anthropic/claude-sonnet-4-5, anthropic/claude-opus-4-5, ... (19 total)

**1h Horizon** (extending by 6 rounds)
- Reason: 11 qualified models > threshold (5)
- Models: anthropic/claude-haiku-4-5, anthropic/claude-sonnet-4-5, anthropic/claude-opus-4-5, ... (18 total)

**4h Horizon** (extending by 6 rounds)
- Reason: 22 qualified models > threshold (5)
- Models: anthropic/claude-haiku-4-5, anthropic/claude-sonnet-4-5, anthropic/claude-opus-4-5, ... (20 total)

**24h Horizon** (extending by 6 rounds)
- Reason: 22 qualified models > threshold (5)
- Models: anthropic/claude-haiku-4-5, anthropic/claude-sonnet-4-5, anthropic/claude-opus-4-5, ... (16 total)

## Meta Ensemble Benchmark

*Score-weighted composite prediction per horizon (online, leakage-safe).*

### Strict Ensemble (Valid Models Only)

*Uses only models that pass Phase 0A validity gates.*

| Horizon | Ensemble LL | Best Eligible | Prevalence | vs Prevalence | vs Best Eligible |
|---------|-------------|---------------|------------|---------------|------------------|
| 15m | 0.521 | 0.411 | 0.451 | ❌ +0.071 | ❌ +0.110 |
| 1h | 0.738 | 0.648 | 0.679 | ❌ +0.059 | ❌ +0.091 |
| 4h | 0.259 | 0.095 | Infinity | ✅ -Infinity | ❌ +0.164 |
| 24h | 0.238 | 0.058 | Infinity | ✅ -Infinity | ❌ +0.180 |

> ⚠️ **Note**: Weight entropy is high (2.75 / max 1.61 = 171%), indicating nearly uniform weighting. This occurs when models have similar performance or insufficient history for differentiation.


**Top Contributors (Valid Models):**

**15m Horizon:**
1. xai/grok-4 (avg weight: 0.088)
2. google/gemini-2.5-flash-lite (avg weight: 0.074)
3. google/gemini-3-pro-preview (avg weight: 0.068)
4. google/gemini-2.5-pro (avg weight: 0.060)
5. google/gemini-2.0-flash (avg weight: 0.059)

**1h Horizon:**
1. xai/grok-4 (avg weight: 0.088)
2. google/gemini-2.0-flash (avg weight: 0.084)
3. anthropic/claude-3-5-sonnet-20241022 (avg weight: 0.084)
4. xai/grok-2-vision (avg weight: 0.066)
5. xai/grok-4.1-fast-reasoning (avg weight: 0.060)

**4h Horizon:**
1. google/gemini-3-pro-preview (avg weight: 0.112)
2. google/gemini-2.5-flash (avg weight: 0.101)
3. google/gemini-2.5-pro (avg weight: 0.100)
4. mistral/ministral-8b-latest (avg weight: 0.088)
5. openai/gpt-4.1 (avg weight: 0.073)

**24h Horizon:**
1. google/gemini-2.5-pro (avg weight: 0.143)
2. google/gemini-2.5-flash (avg weight: 0.142)
3. google/gemini-3-pro-preview (avg weight: 0.131)
4. openai/gpt-4.1 (avg weight: 0.086)
5. mistral/ministral-8b-latest (avg weight: 0.070)

### Wide Ensemble (All Models - Diagnostic)

*Uses all models regardless of validity. For diagnostic purposes only.*

| Horizon | Ensemble LL | Best Overall | Prevalence | vs Prevalence | vs Best Overall |
|---------|-------------|--------------|------------|---------------|-----------------|
| 15m | 0.522 | 0.411 | 0.451 | ❌ +0.071 | ❌ +0.110 |
| 1h | 0.743 | 0.648 | 0.679 | ❌ +0.064 | ❌ +0.095 |
| 4h | 0.256 | 0.095 | Infinity | ✅ -Infinity | ❌ +0.161 |
| 24h | 0.234 | 0.058 | Infinity | ✅ -Infinity | ❌ +0.177 |

> ⚠️ **Note**: Weight entropy is high (2.78 / max 1.61 = 173%), indicating nearly uniform weighting. This occurs when models have similar performance or insufficient history for differentiation.


### Ensemble Diagnostics

| Horizon | Mean LL | Best Window | Stability | Scorable Rounds | Avg Weight Entropy |
|---------|---------|-------------|-----------|-----------------|-------------------|
| 15m | 0.521 | 0.481 | 0.322 | 12/12 | 2.86 |
| 1h | 0.738 | 0.515 | 0.371 | 12/12 | 2.80 |
| 4h | 0.259 | 0.243 | 0.050 | 12/12 | 2.73 |
| 24h | 0.238 | 0.206 | 0.080 | 12/12 | 2.60 |

## Arena Results by Horizon

*Eligibility: Models must have ≥10 scored rounds on this horizon AND be qualified for this horizon (not disqualified in Phase 0/1/2 for that specific horizon).*

*Note: A model may show log loss in Final Standings but not appear here if it was disqualified at this horizon during Phase 0/1/2.*

### 15m Arena Winners

*Ranked by Arena Score (50% log loss + 30% best window + 20% stability)*

*This horizon is not rankable: only 2 negative examples (16.7%). Rankings would not be statistically meaningful.*

### 1h Arena Winners

*Ranked by Arena Score (50% log loss + 30% best window + 20% stability)*

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | anthropic/claude-3-5-sonnet-20241022 | 0.50 | 🟡0.72 | 0.59 | 0.005 |

### 4h Arena Winners

*Ranked by Arena Score (50% log loss + 30% best window + 20% stability)*

*This horizon is not rankable: only 0 negative examples (0.0%). Rankings would not be statistically meaningful.*

### 24h Arena Winners

*Ranked by Arena Score (50% log loss + 30% best window + 20% stability)*

*This horizon is not rankable: only 0 negative examples (0.0%). Rankings would not be statistically meaningful.*

## Cross-Horizon Strength

*Cross-horizon analysis requires at least 2 rankable horizons. This run has only 1.*

## Final Standings (Survivors)

*Models with <80% coverage or <10 effective rounds on all horizons are excluded.*

| Rank | Model | Status | Rnds | Cov | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|------|-------|--------|------|-----|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| 🥇 | xai/grok-2-vision | ✅ Active | 12 | 48/48 (100%) | 🟢0.465 | 🟡0.648 | 🟢0.466 | 🟡0.558 | 🟡0.534 | 27.3 | 0.250 | 0.465 | 0.50 | **0.5286** |
| 🥈 | anthropic/claude-sonnet-4-5 | ✅ Active | 12 | 48/48 (100%) | 🟢0.473 | 🟡0.697 | 🟡0.748 | 🟢0.311 | 🟡0.557 | 18.2 | 0.386 | 0.373 | 0.50 | **0.4903** |
| 🥉 | google/gemini-3-pro-preview | ✅ Active | 12 | 48/48 (100%) | 🟢0.411 | 🟡0.698 | 🟢0.095 | 🟢0.071 | 🟢0.319 | 18.2 | 0.268 | 0.504 | 0.50 | **0.4818** |
| 4 | google/gemini-2.0-flash | ✅ Active | 12 | 48/48 (100%) | 🟡0.578 | 🟡0.742 | 🟡0.604 | 🟡0.745 | 🟡0.667 | 13.6 | 0.459 | 0.290 | 0.50 | **0.4777** |
| 5 | xai/grok-4 | ✅ Active | 12 | 48/48 (100%) | 🟡0.551 | 🟡0.717 | 🟢0.287 | 🟢0.354 | 🟢0.477 | 13.6 | 0.247 | 0.533 | 0.50 | **0.4608** |
| 6 | anthropic/claude-opus-4-5 | ✅ Active | 12 | 48/48 (100%) | 🟢0.470 | 🟡0.739 | 🟡0.599 | 🟢0.455 | 🟡0.566 | 13.6 | 0.223 | 0.553 | 0.50 | **0.4604** |
| 7 | google/gemini-2.5-pro | ✅ Active | 12 | 48/48 (100%) | 🟢0.498 | 🟡0.750 | 🟢0.142 | 🟢0.058 | 🟢0.362 | 13.6 | 0.232 | 0.592 | 0.50 | **0.4514** |
| 8 | perplexity/sonar-pro | ✅ Active | 12 | 48/48 (100%) | 🟡0.575 | 🟡0.758 | 🟢0.241 | 🟡0.555 | 🟡0.532 | 13.6 | 0.245 | 0.587 | 0.50 | **0.4505** |
| 9 | anthropic/claude-3-5-sonnet-20241022 | ✅ Active | 12 | 48/48 (100%) | 🔴0.813 | 🟡0.718 | 🟢0.489 | 🟡0.619 | 🟡0.660 | 13.6 | 0.565 | 0.389 | 0.50 | **0.4420** |
| 10 | xai/grok-4.1-fast-reasoning | ✅ Active | 12 | 48/48 (100%) | 🟡0.652 | 🟡0.748 | 🟢0.289 | 🟡0.501 | 🟡0.548 | 13.6 | 0.223 | 0.680 | 0.50 | **0.4350** |
| 11 | anthropic/claude-haiku-4-5 | ✅ Active | 12 | 48/48 (100%) | 🟡0.616 | 🟡0.793 | 🟡0.688 | 🔴0.961 | 🟡0.764 | 9.1 | 0.637 | 0.349 | 0.50 | **0.4210** |
| 12 | anthropic/claude-3-5-haiku-latest | ✅ Active | 12 | 48/48 (100%) | 🟡0.539 | 🔴0.812 | 🟢0.294 | 🟢0.426 | 🟡0.518 | 4.5 | 0.289 | 0.553 | 0.50 | **0.4143** |
| 13 | openai/gpt-5.2 | ✅ Active | 12 | 48/48 (100%) | 🟡0.538 | 🔴0.817 | 🟢0.346 | 🟢0.325 | 🟡0.507 | 4.5 | 0.598 | 0.403 | 0.50 | **0.3979** |
| 14 | anthropic/claude-3-7-sonnet-latest | ✅ Active | 12 | 48/48 (100%) | 🟡0.581 | 🔴0.915 | 🟢0.458 | 🔴0.873 | 🟡0.707 | 4.5 | 0.578 | 0.466 | 0.50 | **0.3884** |
| 15 | google/gemini-2.5-flash-lite | ✅ Active | 12 | 48/48 (100%) | 🟢0.481 | 🔴0.849 | 🟡0.598 | 🟡0.617 | 🟡0.636 | 4.5 | 0.530 | 0.600 | 0.50 | **0.3686** |
| 16 | openai/gpt-4.1 | ✅ Active | 12 | 48/48 (100%) | 🟡0.607 | 🔴0.927 | 🟢0.194 | 🟢0.165 | 🟢0.473 | 4.5 | 0.250 | 0.817 | 0.50 | **0.3673** |
| 17 | mistral/ministral-8b-latest | ✅ Active | 12 | 48/48 (100%) | 🟡0.507 | 🔴0.977 | 🟢0.162 | 🟢0.226 | 🟢0.468 | 4.5 | 0.073 | 1.035 | 0.50 | **0.3573** |
| 18 | mistral/pixtral-large-latest | ✅ Active | 12 | 48/48 (100%) | 🟡0.766 | 🔴0.850 | 🟢0.388 | 🟢0.361 | 🟡0.591 | 4.5 | 0.734 | 0.608 | 0.50 | **0.3365** |
| 19 | google/gemini-2.5-flash | ✅ Active | 12 | 48/48 (100%) | 🟡0.560 | 🔴3.767 | 🟢0.150 | 🟢0.062 | 🔴1.135 | 0.0 | 0.908 | 9.293 | 0.50 | **0.2138** |

## All Models (Research Reference)

*Rankings are by composite score among models with adequate coverage (≥80% and ≥10 rounds).*

| Rank | Model | Status | Rnds | Cov | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|------|-------|--------|------|-----|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| 🥇 | xai/grok-2-vision | ✅ Active | 12 | 48/48 (100%) | 🟢0.465 | 🟡0.648 | 🟢0.466 | 🟡0.558 | 🟡0.534 | 27.3 | 0.250 | 0.465 | 0.50 | **0.5286** |
| 🥈 | anthropic/claude-sonnet-4-5 | ✅ Active | 12 | 48/48 (100%) | 🟢0.473 | 🟡0.697 | 🟡0.748 | 🟢0.311 | 🟡0.557 | 18.2 | 0.386 | 0.373 | 0.50 | **0.4903** |
| 🥉 | google/gemini-3-pro-preview | ✅ Active | 12 | 48/48 (100%) | 🟢0.411 | 🟡0.698 | 🟢0.095 | 🟢0.071 | 🟢0.319 | 18.2 | 0.268 | 0.504 | 0.50 | **0.4818** |
| 4 | google/gemini-2.0-flash | ✅ Active | 12 | 48/48 (100%) | 🟡0.578 | 🟡0.742 | 🟡0.604 | 🟡0.745 | 🟡0.667 | 13.6 | 0.459 | 0.290 | 0.50 | **0.4777** |
| 5 | xai/grok-4 | ✅ Active | 12 | 48/48 (100%) | 🟡0.551 | 🟡0.717 | 🟢0.287 | 🟢0.354 | 🟢0.477 | 13.6 | 0.247 | 0.533 | 0.50 | **0.4608** |
| 6 | anthropic/claude-opus-4-5 | ✅ Active | 12 | 48/48 (100%) | 🟢0.470 | 🟡0.739 | 🟡0.599 | 🟢0.455 | 🟡0.566 | 13.6 | 0.223 | 0.553 | 0.50 | **0.4604** |
| 7 | google/gemini-2.5-pro | ✅ Active | 12 | 48/48 (100%) | 🟢0.498 | 🟡0.750 | 🟢0.142 | 🟢0.058 | 🟢0.362 | 13.6 | 0.232 | 0.592 | 0.50 | **0.4514** |
| 8 | perplexity/sonar-pro | ✅ Active | 12 | 48/48 (100%) | 🟡0.575 | 🟡0.758 | 🟢0.241 | 🟡0.555 | 🟡0.532 | 13.6 | 0.245 | 0.587 | 0.50 | **0.4505** |
| 9 | anthropic/claude-3-5-sonnet-20241022 | ✅ Active | 12 | 48/48 (100%) | 🔴0.813 | 🟡0.718 | 🟢0.489 | 🟡0.619 | 🟡0.660 | 13.6 | 0.565 | 0.389 | 0.50 | **0.4420** |
| 10 | xai/grok-4-fast-non-reasoning | ❌ P2 | 12 | 48/48 (100%) | 🟡0.580 | 🟡0.774 | 🟡0.752 | 🔴1.140 | 🔴0.811 | 9.1 | 0.311 | 0.508 | 0.50 | **0.4381** |
| 11 | xai/grok-4.1-fast-reasoning | ✅ Active | 12 | 48/48 (100%) | 🟡0.652 | 🟡0.748 | 🟢0.289 | 🟡0.501 | 🟡0.548 | 13.6 | 0.223 | 0.680 | 0.50 | **0.4350** |
| 12 | anthropic/claude-haiku-4-5 | ✅ Active | 12 | 48/48 (100%) | 🟡0.616 | 🟡0.793 | 🟡0.688 | 🔴0.961 | 🟡0.764 | 9.1 | 0.637 | 0.349 | 0.50 | **0.4210** |
| 13 | anthropic/claude-3-5-haiku-latest | ✅ Active | 12 | 48/48 (100%) | 🟡0.539 | 🔴0.812 | 🟢0.294 | 🟢0.426 | 🟡0.518 | 4.5 | 0.289 | 0.553 | 0.50 | **0.4143** |
| 14 | openai/gpt-5.2 | ✅ Active | 12 | 48/48 (100%) | 🟡0.538 | 🔴0.817 | 🟢0.346 | 🟢0.325 | 🟡0.507 | 4.5 | 0.598 | 0.403 | 0.50 | **0.3979** |
| 15 | anthropic/claude-3-7-sonnet-latest | ✅ Active | 12 | 48/48 (100%) | 🟡0.581 | 🔴0.915 | 🟢0.458 | 🔴0.873 | 🟡0.707 | 4.5 | 0.578 | 0.466 | 0.50 | **0.3884** |
| 16 | google/gemini-2.5-flash-lite | ✅ Active | 12 | 48/48 (100%) | 🟢0.481 | 🔴0.849 | 🟡0.598 | 🟡0.617 | 🟡0.636 | 4.5 | 0.530 | 0.600 | 0.50 | **0.3686** |
| 17 | openai/gpt-4.1 | ✅ Active | 12 | 48/48 (100%) | 🟡0.607 | 🔴0.927 | 🟢0.194 | 🟢0.165 | 🟢0.473 | 4.5 | 0.250 | 0.817 | 0.50 | **0.3673** |
| 18 | mistral/ministral-8b-latest | ✅ Active | 12 | 48/48 (100%) | 🟡0.507 | 🔴0.977 | 🟢0.162 | 🟢0.226 | 🟢0.468 | 4.5 | 0.073 | 1.035 | 0.50 | **0.3573** |
| 19 | mistral/pixtral-large-latest | ✅ Active | 12 | 48/48 (100%) | 🟡0.766 | 🔴0.850 | 🟢0.388 | 🟢0.361 | 🟡0.591 | 4.5 | 0.734 | 0.608 | 0.50 | **0.3365** |
| 20 | google/gemini-2.5-flash | ✅ Active | 12 | 48/48 (100%) | 🟡0.560 | 🔴3.767 | 🟢0.150 | 🟢0.062 | 🔴1.135 | 0.0 | 0.908 | 9.293 | 0.50 | **0.2138** |

### Not Ranked (Low Coverage or Early Stopped)

*These models had <80% coverage OR <10 effective rounds and are shown for reference only, not as competitive rankings.*

| Model | Status | Rnds | Cov | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|-------|--------|------|-----|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| openai/gpt-4.1-mini | ✅ Active | 6 | 24/48 (50%)⚠️ | 🟡0.685 | 🔴0.812 | 🟢0.195 | 🟢0.179 | 🟢0.468 | 4.5 | 0.224 | 0.600 | 0.50 | 0.4144 |
| openai/gpt-5-mini | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟡0.539 | 🔴1.295 | 🟢0.193 | 🟢0.231 | 🟡0.565 | 0.0 | 1.295 | 0.091 | 0.50 | 0.3375 |

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

*Same data as Arena Winners, showing top 10 per horizon. Ranked by Arena Score (50% log loss + 30% best window + 20% stability). Eligibility: ≥10 scored rounds AND not disqualified at this horizon in Phase 0/1/2.*

### 15m Horizon (Diagnostic Only)

*This horizon is not rankable: only 2 negative examples (16.7%). Data shown for reference only, not as competitive rankings.*

| Model | Log Loss | Status |
|-------|----------|--------|
| google/gemini-3-pro-preview | 0.4113 | ✅ Active |
| anthropic/claude-sonnet-4-5 | 0.4733 | ✅ Active |
| google/gemini-2.5-flash-lite | 0.4810 | ✅ Active |
| google/gemini-2.5-pro | 0.4980 | ✅ Active |
| anthropic/claude-3-5-haiku-latest | 0.5388 | ✅ Active |
| openai/gpt-5.2 | 0.5384 | ✅ Active |
| xai/grok-4 | 0.5514 | ✅ Active |

### 1h Horizon (Top 10)

| Rank | Model | Score | Log Loss |
|------|-------|-------|----------|
| 1 | anthropic/claude-3-5-sonnet-20241022 | 0.5000 | 🟡0.7182 |

### 4h Horizon (Diagnostic Only)

*This horizon is not rankable: only 0 negative examples (0.0%). Data shown for reference only, not as competitive rankings.*

| Model | Log Loss | Status |
|-------|----------|--------|
| google/gemini-3-pro-preview | 0.0950 | ✅ Active |
| mistral/ministral-8b-latest | 0.1615 | ✅ Active |
| google/gemini-2.5-pro | 0.1417 | ✅ Active |
| openai/gpt-4.1 | 0.1945 | ✅ Active |
| perplexity/sonar-pro | 0.2411 | ✅ Active |
| xai/grok-4.1-fast-reasoning | 0.2885 | ✅ Active |

### 24h Horizon (Diagnostic Only)

*This horizon is not rankable: only 0 negative examples (0.0%). Data shown for reference only, not as competitive rankings.*

| Model | Log Loss | Status |
|-------|----------|--------|
| openai/gpt-4.1 | 0.1648 | ✅ Active |
| mistral/ministral-8b-latest | 0.2256 | ✅ Active |
| openai/gpt-5.2 | 0.3250 | ✅ Active |
| mistral/pixtral-large-latest | 0.3609 | ✅ Active |
| anthropic/claude-opus-4-5 | 0.4552 | ✅ Active |
| anthropic/claude-3-5-haiku-latest | 0.4260 | ✅ Active |

## Elimination Audit

*Detailed per-horizon elimination reasons for each eliminated model.*

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

### openai/gpt-5-nano (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | - | No scored rounds | N/A |
| 1h | - | No scored rounds | N/A |
| 4h | - | No scored rounds | N/A |
| 24h | - | No scored rounds | N/A |

### xai/grok-4-fast-non-reasoning (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 2 | high regret or instability | 0.580 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 0.774 |
| 4h | 1 | bottom 30% percentile | 0.752 |
| 24h | 1 | bottom 30% percentile | 1.140 |

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

## Model Failures

*Note: Failed rounds (API errors, malformed responses) are excluded from scoring. The `Rnds` column shows successful rounds used in metric calculation.*

| Model | Failed Rounds |
|-------|---------------|
| openai/gpt-4o | 1, 2, 3, 4 |
| openai/gpt-4o-mini | 1, 2, 3, 4 |
| openai/gpt-4.1-mini | 1, 2, 3, 8, 11, 12 |
| openai/gpt-5 | 1, 2, 3, 4 |
| openai/gpt-5-mini | 1, 2, 4, 5, 6, 8, 9, 10, 11, 12 |
| openai/gpt-5-nano | 1, 2, 3, 4 |
| mistral/pixtral-12b-2409 | 1, 2, 3, 4 |
| mistral/ministral-3b-latest | 1, 2, 3, 4 |

---
*Auto-generated by agent_006 benchmark*