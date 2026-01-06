# agent_006 Benchmark Results

**Symbol:** COINBASE_SPOT_BTC_USD
**Start Time:** 2025-12-18T18:00:00.000Z
**Progress:** Round 12/12 (Phase 3)
**Last Updated:** 2026-01-05T04:38:10.636Z

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

*Stats (pMean, pStdDev, etc.) are computed only on successful predictions (Effective N). Failed rounds are excluded.*

### anthropic/claude-haiku-4-5

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.680 | 0.320 | 0.820 | 0.116 | 0.92 |
| 1h | 12 | 5 | 0.553 | 0.280 | 0.780 | 0.189 | 0.67 |
| 4h | 12 | 7 | 0.362 | 0.220 | 0.720 | 0.170 | 0.17 |
| 24h | 12 | 8 | 0.353 | 0.180 | 0.760 | 0.177 | 0.17 |

### anthropic/claude-sonnet-4-5

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 4 | 0.624 | 0.280 | 0.720 | 0.159 | 0.83 |
| 1h | 12 | 5 | 0.593 | 0.320 | 0.680 | 0.127 | 0.83 |
| 4h | 12 | 6 | 0.413 | 0.320 | 0.750 | 0.126 | 0.17 |
| 24h | 12 | 7 | 0.434 | 0.270 | 0.710 | 0.152 | 0.33 |

### anthropic/claude-opus-4-5

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.751 | 0.280 | 0.850 | 0.152 | 0.92 |
| 1h | 12 | 6 | 0.692 | 0.320 | 0.800 | 0.122 | 0.92 |
| 4h | 12 | 6 | 0.649 | 0.380 | 0.750 | 0.091 | 0.92 |
| 24h | 12 | 5 | 0.487 | 0.400 | 0.650 | 0.087 | 0.25 |

### anthropic/claude-3-5-sonnet-20241022

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 4 | 0.429 | 0.150 | 0.700 | 0.249 | 0.50 |
| 1h | 12 | 5 | 0.358 | 0.200 | 0.650 | 0.193 | 0.33 |
| 4h | 12 | 5 | 0.304 | 0.200 | 0.600 | 0.101 | 0.08 |
| 24h | 12 | 6 | 0.300 | 0.150 | 0.450 | 0.076 | 0.00 |

### anthropic/claude-3-5-haiku-latest

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.558 | 0.250 | 0.750 | 0.221 | 0.58 |
| 1h | 12 | 5 | 0.537 | 0.200 | 0.800 | 0.241 | 0.58 |
| 4h | 12 | 7 | 0.604 | 0.200 | 0.850 | 0.177 | 0.83 |
| 24h | 12 | 6 | 0.608 | 0.400 | 0.900 | 0.117 | 0.92 |

### anthropic/claude-3-7-sonnet-latest

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.458 | 0.150 | 0.750 | 0.248 | 0.50 |
| 1h | 12 | 6 | 0.417 | 0.150 | 0.700 | 0.219 | 0.42 |
| 4h | 12 | 7 | 0.421 | 0.200 | 0.650 | 0.146 | 0.33 |
| 24h | 12 | 8 | 0.392 | 0.150 | 0.600 | 0.119 | 0.17 |

### openai/gpt-4.1

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 9 | 0.493 | 0.150 | 0.900 | 0.218 | 0.42 |
| 1h | 12 | 8 | 0.457 | 0.200 | 0.800 | 0.213 | 0.33 |
| 4h | 12 | 8 | 0.529 | 0.150 | 0.850 | 0.256 | 0.50 |
| 24h | 12 | 10 | 0.547 | 0.200 | 0.900 | 0.234 | 0.58 |

### openai/gpt-4.1-mini

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.609 | 0.150 | 0.850 | 0.267 | 0.73 |
| 1h | 12 | 7 | 0.491 | 0.100 | 0.750 | 0.264 | 0.55 |
| 4h | 12 | 7 | 0.509 | 0.050 | 0.850 | 0.311 | 0.55 |
| 24h | 12 | 9 | 0.525 | 0.020 | 0.900 | 0.342 | 0.55 |
**Failures:** 1 schema (effectiveN: 11/12)


### openai/gpt-5

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 2 | 0.515 | 0.390 | 0.640 | 0.125 | 0.50 |
| 1h | 12 | 2 | 0.450 | 0.320 | 0.580 | 0.130 | 0.50 |
| 4h | 12 | 2 | 0.430 | 0.290 | 0.570 | 0.140 | 0.50 |
| 24h | 12 | 2 | 0.500 | 0.380 | 0.620 | 0.120 | 0.50 |
**Failures:** 10 schema (effectiveN: 2/12)


### openai/gpt-5.2

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 9 | 0.598 | 0.380 | 0.740 | 0.134 | 0.73 |
| 1h | 12 | 8 | 0.537 | 0.340 | 0.670 | 0.118 | 0.73 |
| 4h | 12 | 6 | 0.523 | 0.380 | 0.740 | 0.108 | 0.64 |
| 24h | 12 | 9 | 0.430 | 0.320 | 0.570 | 0.076 | 0.18 |
**Failures:** 1 schema (effectiveN: 11/12)


### google/gemini-2.0-flash

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 3 | 0.550 | 0.200 | 0.700 | 0.214 | 0.67 |
| 1h | 12 | 4 | 0.471 | 0.300 | 0.650 | 0.142 | 0.50 |
| 4h | 12 | 4 | 0.533 | 0.300 | 0.800 | 0.143 | 0.67 |
| 24h | 12 | 7 | 0.521 | 0.200 | 0.750 | 0.181 | 0.67 |

### google/gemini-2.5-flash

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 9 | 0.512 | 0.050 | 0.900 | 0.327 | 0.58 |
| 1h | 12 | 9 | 0.308 | 0.050 | 0.800 | 0.249 | 0.25 |
| 4h | 12 | 7 | 0.183 | 0.050 | 0.600 | 0.143 | 0.08 |
| 24h | 12 | 8 | 0.247 | 0.020 | 0.850 | 0.255 | 0.17 |

### google/gemini-2.5-flash-lite

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.408 | 0.150 | 0.800 | 0.215 | 0.25 |
| 1h | 12 | 6 | 0.317 | 0.150 | 0.850 | 0.223 | 0.17 |
| 4h | 12 | 7 | 0.279 | 0.100 | 0.900 | 0.267 | 0.17 |
| 24h | 12 | 9 | 0.437 | 0.050 | 0.950 | 0.352 | 0.50 |

### google/gemini-2.5-pro

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 9 | 0.575 | 0.100 | 0.850 | 0.268 | 0.67 |
| 1h | 12 | 8 | 0.375 | 0.100 | 0.800 | 0.248 | 0.25 |
| 4h | 12 | 4 | 0.329 | 0.100 | 0.900 | 0.306 | 0.25 |
| 24h | 12 | 8 | 0.379 | 0.050 | 0.950 | 0.363 | 0.33 |

### google/gemini-3-pro-preview

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 2 | 0.957 | 0.950 | 0.980 | 0.013 | 1.00 |
| 1h | 12 | 2 | 0.875 | 0.850 | 0.900 | 0.025 | 1.00 |
| 4h | 12 | 2 | 0.775 | 0.750 | 0.800 | 0.025 | 1.00 |
| 24h | 12 | 3 | 0.662 | 0.600 | 0.750 | 0.054 | 1.00 |

### xai/grok-2-vision

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 3 | 0.725 | 0.600 | 0.800 | 0.083 | 1.00 |
| 1h | 12 | 3 | 0.706 | 0.650 | 0.750 | 0.030 | 1.00 |
| 4h | 12 | 5 | 0.669 | 0.400 | 0.800 | 0.130 | 0.88 |
| 24h | 12 | 5 | 0.669 | 0.500 | 0.900 | 0.162 | 0.75 |

### xai/grok-4-fast-non-reasoning

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.667 | 0.300 | 0.850 | 0.174 | 0.83 |
| 1h | 12 | 6 | 0.633 | 0.250 | 0.800 | 0.209 | 0.75 |
| 4h | 12 | 8 | 0.579 | 0.200 | 0.850 | 0.247 | 0.67 |
| 24h | 12 | 8 | 0.400 | 0.150 | 0.800 | 0.200 | 0.25 |

### xai/grok-4.1-fast-reasoning

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 7 | 0.688 | 0.150 | 0.900 | 0.253 | 0.75 |
| 1h | 12 | 6 | 0.662 | 0.200 | 0.850 | 0.215 | 0.75 |
| 4h | 12 | 6 | 0.633 | 0.250 | 0.850 | 0.184 | 0.83 |
| 24h | 12 | 8 | 0.504 | 0.200 | 0.900 | 0.216 | 0.50 |

### xai/grok-4

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 8 | 0.613 | 0.150 | 0.950 | 0.271 | 0.67 |
| 1h | 12 | 7 | 0.525 | 0.100 | 0.900 | 0.277 | 0.50 |
| 4h | 12 | 7 | 0.696 | 0.300 | 0.850 | 0.168 | 0.83 |
| 24h | 12 | 6 | 0.758 | 0.200 | 0.900 | 0.192 | 0.92 |

### mistral/pixtral-large-latest

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 7 | 0.487 | 0.100 | 0.800 | 0.283 | 0.58 |
| 1h | 12 | 7 | 0.383 | 0.150 | 0.750 | 0.229 | 0.33 |
| 4h | 12 | 8 | 0.338 | 0.100 | 0.700 | 0.198 | 0.25 |
| 24h | 12 | 10 | 0.379 | 0.050 | 0.650 | 0.194 | 0.33 |

### mistral/ministral-3b-latest

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m ⚠️ | 12 | 1 | 0.800 | 0.800 | 0.800 | 0.000 | 1.00 |
| 1h ⚠️ | 12 | 1 | 0.750 | 0.750 | 0.750 | 0.000 | 1.00 |
| 4h ⚠️ | 12 | 1 | 0.850 | 0.850 | 0.850 | 0.000 | 1.00 |
| 24h ⚠️ | 12 | 1 | 0.700 | 0.700 | 0.700 | 0.000 | 1.00 |
**Failures:** 11 schema (effectiveN: 1/12)


### mistral/ministral-8b-latest

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 2 | 0.938 | 0.900 | 0.950 | 0.022 | 1.00 |
| 1h | 12 | 3 | 0.922 | 0.900 | 0.950 | 0.018 | 1.00 |
| 4h | 12 | 3 | 0.840 | 0.750 | 0.880 | 0.053 | 1.00 |
| 24h | 12 | 3 | 0.775 | 0.650 | 0.850 | 0.083 | 1.00 |

### perplexity/sonar-pro

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.775 | 0.350 | 0.950 | 0.177 | 0.88 |
| 1h | 12 | 5 | 0.750 | 0.400 | 0.900 | 0.148 | 0.88 |
| 4h | 12 | 4 | 0.819 | 0.750 | 0.900 | 0.061 | 1.00 |
| 24h | 12 | 5 | 0.669 | 0.350 | 0.900 | 0.192 | 0.75 |

### openai/gpt-5-nano

| Horizon | Effective N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|-------------|----------|-------|------|------|---------|---------------|
| 15m | 12 | 2 | 0.685 | 0.650 | 0.720 | 0.035 | 1.00 |
| 1h | 12 | 2 | 0.525 | 0.400 | 0.650 | 0.125 | 0.50 |
| 4h | 12 | 2 | 0.660 | 0.600 | 0.720 | 0.060 | 1.00 |
| 24h | 12 | 2 | 0.485 | 0.420 | 0.550 | 0.065 | 0.50 |
**Failures:** 10 schema (effectiveN: 2/12)


**Warnings:**
- ⚠️ mistral/ministral-3b-latest (15m): Constant predictor detected
- ⚠️ mistral/ministral-3b-latest (1h): Constant predictor detected
- ⚠️ mistral/ministral-3b-latest (4h): Constant predictor detected
- ⚠️ mistral/ministral-3b-latest (24h): Constant predictor detected

## Failure Audit

*Failed rounds are excluded from scoring.*

**Aggregate:**
- Total model calls: 336 (28 models × 12 rounds)
- Failed model calls: 49 (14.6%)
- Total horizon predictions: 1344 (28 models × 12 rounds × 4 horizons)
- Failed horizon predictions: 196 (14.6%)

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
| openai/gpt-4.1-mini | 1/12 | 4 | 0 | 0 | 0 | 1 | 0 |
| openai/gpt-5 | 10/12 | 40 | 0 | 0 | 0 | 10 | 0 |
| openai/gpt-5-mini | 4/12 | 16 | 0 | 0 | 0 | 4 | 0 |
| openai/gpt-5-nano | 10/12 | 40 | 0 | 0 | 0 | 10 | 0 |
| openai/gpt-5.2 | 1/12 | 4 | 0 | 0 | 0 | 1 | 0 |
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
| mistral/ministral-3b-latest | 11/12 | 44 | 0 | 0 | 0 | 11 | 0 |
| mistral/ministral-8b-latest | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| perplexity/sonar-pro | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |

## Summary

- **Active Models:** 14
- **Eliminated:** 14
- **Models with Failures:** 9

## Phase 0A Validity Gates

*Strict filters to block garbage models before qualification.*

### Summary by Horizon

| Horizon | Evaluated | Valid | Invalid | Coverage | Failures | Degeneracy | Extreme Wrong |
|---------|-----------|-------|---------|----------|----------|------------|---------------|
| 15m | 28 | 15 | 13 | 11 | 7 | 1 | 3 |
| 1h | 28 | 13 | 15 | 11 | 7 | 0 | 6 |
| 4h | 28 | 12 | 16 | 11 | 7 | 0 | 8 |
| 24h | 28 | 11 | 17 | 11 | 7 | 0 | 8 |

### Invalid Models Detail

**anthropic/claude-3-5-sonnet-20241022** (invalid on: 15m, 1h)
- 15m: extreme_wrong_rate (25.0%)
- 1h: extreme_wrong_rate (25.0%)

**openai/gpt-4o** (invalid on: 15m, 1h, 4h, 24h)
- 15m: coverage (0.0%), failure_rate (33.3%)
- 1h: coverage (0.0%), failure_rate (33.3%)
- 4h: coverage (0.0%), failure_rate (33.3%)
- 24h: coverage (0.0%), failure_rate (33.3%)

**openai/gpt-4o-mini** (invalid on: 15m, 1h, 4h, 24h)
- 15m: coverage (0.0%), failure_rate (33.3%)
- 1h: coverage (0.0%), failure_rate (33.3%)
- 4h: coverage (0.0%), failure_rate (33.3%)
- 24h: coverage (0.0%), failure_rate (33.3%)

**openai/gpt-4.1** (invalid on: 4h, 24h)
- 4h: extreme_wrong_rate (25.0%)
- 24h: extreme_wrong_rate (25.0%)

**openai/gpt-4.1-mini** (invalid on: 4h, 24h)
- 4h: extreme_wrong_rate (45.5%)
- 24h: extreme_wrong_rate (63.6%)

**openai/gpt-5** (invalid on: 15m, 1h, 4h, 24h)
- 15m: coverage (16.7%), failure_rate (83.3%)
- 1h: coverage (16.7%), failure_rate (83.3%)
- 4h: coverage (16.7%), failure_rate (83.3%)
- 24h: coverage (16.7%), failure_rate (83.3%)

**openai/gpt-5-mini** (invalid on: 15m, 1h, 4h, 24h)
- 15m: coverage (0.0%), failure_rate (33.3%)
- 1h: coverage (0.0%), failure_rate (33.3%)
- 4h: coverage (0.0%), failure_rate (33.3%)
- 24h: coverage (0.0%), failure_rate (33.3%)

**openai/gpt-5-nano** (invalid on: 15m, 1h, 4h, 24h)
- 15m: coverage (16.7%), failure_rate (83.3%)
- 1h: coverage (16.7%), failure_rate (83.3%)
- 4h: coverage (16.7%), failure_rate (83.3%)
- 24h: coverage (16.7%), failure_rate (83.3%)

**google/gemini-2.5-flash** (invalid on: 1h, 4h, 24h)
- 1h: extreme_wrong_rate (33.3%)
- 4h: extreme_wrong_rate (33.3%)
- 24h: extreme_wrong_rate (41.7%)

**google/gemini-2.5-flash-lite** (invalid on: 1h, 4h, 24h)
- 1h: extreme_wrong_rate (33.3%)
- 4h: extreme_wrong_rate (41.7%)
- 24h: extreme_wrong_rate (41.7%)

**google/gemini-2.5-pro** (invalid on: 4h, 24h)
- 4h: extreme_wrong_rate (50.0%)
- 24h: extreme_wrong_rate (58.3%)

**google/gemini-3-pro-preview** (invalid on: 15m, 1h, 4h, 24h)
- 15m: coverage (33.3%), constant_predictor (uniqueP=2, stdDev=0.01), extreme_predictions
- 1h: coverage (33.3%), extreme_wrong_rate (50.0%)
- 4h: coverage (33.3%)
- 24h: coverage (33.3%)

**xai/grok-2-vision** (invalid on: 15m, 1h, 4h, 24h)
- 15m: coverage (66.7%)
- 1h: coverage (66.7%)
- 4h: coverage (66.7%)
- 24h: coverage (66.7%), extreme_wrong_rate (37.5%)

**xai/grok-4.1-fast-reasoning** (invalid on: 15m)
- 15m: extreme_wrong_rate (25.0%)

**xai/grok-4** (invalid on: 24h)
- 24h: extreme_wrong_rate (33.3%)

**mistral/pixtral-large-latest** (invalid on: 1h)
- 1h: extreme_wrong_rate (25.0%)

**mistral/pixtral-12b-2409** (invalid on: 15m, 1h, 4h, 24h)
- 15m: coverage (0.0%), failure_rate (33.3%)
- 1h: coverage (0.0%), failure_rate (33.3%)
- 4h: coverage (0.0%), failure_rate (33.3%)
- 24h: coverage (0.0%), failure_rate (33.3%)

**mistral/ministral-3b-latest** (invalid on: 15m, 1h, 4h, 24h)
- 15m: coverage (8.3%), failure_rate (91.7%)
- 1h: coverage (8.3%), failure_rate (91.7%)
- 4h: coverage (8.3%), failure_rate (91.7%), extreme_wrong_rate (100.0%)
- 24h: coverage (8.3%), failure_rate (91.7%)

**mistral/ministral-8b-latest** (invalid on: 15m, 1h, 4h, 24h)
- 15m: coverage (33.3%), extreme_predictions
- 1h: coverage (33.3%), extreme_predictions, extreme_wrong_rate (50.0%)
- 4h: coverage (33.3%), extreme_wrong_rate (75.0%)
- 24h: coverage (33.3%), extreme_wrong_rate (50.0%)

**perplexity/sonar-pro** (invalid on: 15m, 1h, 4h, 24h)
- 15m: coverage (66.7%), extreme_wrong_rate (25.0%)
- 1h: coverage (66.7%)
- 4h: coverage (66.7%), extreme_wrong_rate (50.0%)
- 24h: coverage (66.7%)

## Extension Rule Outcome

*Horizons with >5 qualified models get 6 additional rounds.*

| Horizon | Rankable | Qualified | Eligible | Extend? | Extra Rounds | Models Included |
|---------|----------|-----------|----------|---------|--------------|-----------------|
| 15m | ✅ Yes | 16 | 16 | ❌ No | 0 | - |
| 1h | ✅ Yes | 7 | 15 | ❌ No | 0 | - |
| 4h | ✅ Yes | 2 | 14 | ❌ No | 0 | - |
| 24h | ✅ Yes | 5 | 13 | ❌ No | 0 | - |

**Summary:** 0 horizons will receive extension rounds (0 total extra rounds).

## Meta Ensemble Benchmark

*Score-weighted composite prediction per horizon (online, leakage-safe).*

### Ensemble vs Baselines

| Horizon | Ensemble LL | Prevalence | Best Single | Equal Weight | vs Prevalence | vs Best Single |
|---------|-------------|------------|-------------|--------------|---------------|----------------|
| 15m | 0.506 | 0.562 | 0.044 | 0.506 | ✅ -0.057 | ❌ +0.462 |
| 1h | 0.813 | 0.693 | 0.288 | 0.813 | ❌ +0.119 | ❌ +0.525 |
| 4h | 0.814 | 0.637 | 0.593 | 0.814 | ❌ +0.178 | ❌ +0.221 |
| 24h | 0.783 | 0.637 | 0.563 | 0.783 | ❌ +0.147 | ❌ +0.220 |

### Ensemble Diagnostics

| Horizon | Mean LL | Best Window | Stability | Scorable Rounds | Avg Weight Entropy |
|---------|---------|-------------|-----------|-----------------|-------------------|
| 15m | 0.506 | 0.356 | 0.288 | 12/12 | 2.75 |
| 1h | 0.813 | 0.797 | 0.377 | 12/12 | 2.69 |
| 4h | 0.814 | 0.512 | 0.397 | 12/12 | 2.31 |
| 24h | 0.783 | 0.622 | 0.256 | 12/12 | 2.39 |

### Top Contributing Models

**15m Horizon:**
1. xai/grok-4 (avg weight: 0.093)
2. google/gemini-2.5-pro (avg weight: 0.082)
3. google/gemini-2.5-flash (avg weight: 0.080)
4. anthropic/claude-3-5-sonnet-20241022 (avg weight: 0.057)
5. anthropic/claude-3-7-sonnet-latest (avg weight: 0.056)

**1h Horizon:**
1. anthropic/claude-3-5-sonnet-20241022 (avg weight: 0.090)
2. google/gemini-2.5-flash-lite (avg weight: 0.081)
3. perplexity/sonar-pro (avg weight: 0.070)
4. openai/gpt-5.2 (avg weight: 0.067)
5. google/gemini-2.0-flash (avg weight: 0.062)

**4h Horizon:**
1. google/gemini-2.5-flash (avg weight: 0.189)
2. mistral/pixtral-large-latest (avg weight: 0.166)
3. anthropic/claude-3-5-sonnet-20241022 (avg weight: 0.130)
4. anthropic/claude-sonnet-4-5 (avg weight: 0.075)
5. anthropic/claude-haiku-4-5 (avg weight: 0.070)

**24h Horizon:**
1. mistral/pixtral-large-latest (avg weight: 0.159)
2. anthropic/claude-3-5-sonnet-20241022 (avg weight: 0.148)
3. xai/grok-4-fast-non-reasoning (avg weight: 0.114)
4. anthropic/claude-3-7-sonnet-latest (avg weight: 0.086)
5. google/gemini-2.5-flash (avg weight: 0.076)

## Arena Results by Horizon

*Eligibility: Models must have ≥10 scored rounds on this horizon AND be qualified for this horizon (not disqualified in Phase 0/1/2 for that specific horizon).*

*Note: A model may show log loss in Final Standings but not appear here if it was disqualified at this horizon during Phase 0/1/2.*

### 15m Arena Winners

*Ranked by Arena Score (50% log loss + 30% best window + 20% stability)*

*This horizon is not rankable: only 3 negative examples (25.0%). Rankings would not be statistically meaningful.*

### 1h Arena Winners

*Ranked by Arena Score (50% log loss + 30% best window + 20% stability)*

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | openai/gpt-5.2 | 0.41 | 🟡0.67 | 0.63 | 0.002 |
| 🥈 | google/gemini-2.0-flash | 0.33 | 🟡0.75 | 0.68 | 0.002 |
| 🥉 | anthropic/claude-3-7-sonnet-latest | 0.00 | 🔴0.94 | 0.71 | 0.022 |
| 4 | openai/gpt-4.1-mini | 0.00 | 🔴1.08 | 0.93 | 0.012 |

### 4h Arena Winners

*Ranked by Arena Score (50% log loss + 30% best window + 20% stability)*

*This horizon is not rankable: only 4 positive examples (33.3%). Rankings would not be statistically meaningful.*

### 24h Arena Winners

*Ranked by Arena Score (50% log loss + 30% best window + 20% stability)*

*This horizon is not rankable: only 4 positive examples (33.3%). Rankings would not be statistically meaningful.*

## Cross-Horizon Strength

*Cross-horizon analysis requires at least 2 rankable horizons. This run has only 1.*

## Final Standings (Survivors)

*Models with <80% coverage or <10 effective rounds on all horizons are excluded.*

| Rank | Model | Status | Rnds | Cov | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|------|-------|--------|------|-----|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| 🥇 | openai/gpt-5.2 | ✅ Active | 11 | 44/48 (92%) | 🟡0.507 | 🟡0.669 | 🔴0.828 | 🟡0.734 | 🟡0.684 | 95.8 | 0.566 | 0.235 | 0.50 | **0.8014** |
| 🥈 | anthropic/claude-sonnet-4-5 | ✅ Active | 12 | 48/48 (100%) | 🟡0.560 | 🟡0.757 | 🟡0.795 | 🔴0.825 | 🟡0.734 | 87.5 | 0.485 | 0.332 | 0.50 | **0.7608** |
| 🥉 | google/gemini-2.0-flash | ✅ Active | 12 | 48/48 (100%) | 🟡0.591 | 🟡0.747 | 🔴1.022 | 🔴1.105 | 🔴0.866 | 87.5 | 0.588 | 0.306 | 0.50 | **0.7507** |
| 4 | anthropic/claude-haiku-4-5 | ✅ Active | 12 | 48/48 (100%) | 🟡0.502 | 🟡0.781 | 🔴0.863 | 🔴0.916 | 🟡0.766 | 75.0 | 0.386 | 0.432 | 0.50 | **0.7058** |
| 5 | xai/grok-4 | ✅ Active | 12 | 48/48 (100%) | 🟢0.425 | 🔴0.805 | 🔴0.863 | 🔴1.171 | 🔴0.816 | 70.8 | 0.472 | 0.585 | 0.50 | **0.6456** |
| 6 | openai/gpt-4.1 | ✅ Active | 12 | 48/48 (100%) | 🟡0.584 | 🔴0.870 | 🔴1.332 | 🔴1.320 | 🔴1.027 | 54.2 | 0.417 | 0.515 | 0.50 | **0.6011** |
| 7 | anthropic/claude-3-7-sonnet-latest | ✅ Active | 12 | 48/48 (100%) | 🟡0.684 | 🔴0.943 | 🔴0.911 | 🟡0.781 | 🔴0.830 | 37.5 | 0.314 | 0.552 | 0.50 | **0.5425** |
| 8 | google/gemini-2.5-pro | ✅ Active | 12 | 48/48 (100%) | 🟢0.416 | 🔴0.969 | 🔴1.360 | 🔴1.770 | 🔴1.129 | 37.5 | 0.204 | 0.677 | 0.50 | **0.5340** |
| 9 | anthropic/claude-3-5-haiku-latest | ✅ Active | 12 | 48/48 (100%) | 🟡0.628 | 🔴0.981 | 🔴1.140 | 🔴0.826 | 🔴0.894 | 37.5 | 0.619 | 0.561 | 0.50 | **0.4949** |
| 10 | mistral/pixtral-large-latest | ✅ Active | 12 | 48/48 (100%) | 🟡0.756 | 🔴1.021 | 🟡0.695 | 🟡0.563 | 🟡0.759 | 29.2 | 0.520 | 0.574 | 0.50 | **0.4739** |
| 11 | openai/gpt-4.1-mini | ✅ Active | 11 | 44/48 (92%) | 🟡0.661 | 🔴1.079 | 🔴1.589 | 🔴1.938 | 🔴1.317 | 20.8 | 0.616 | 0.553 | 0.50 | **0.4303** |
| 12 | xai/grok-4-fast-non-reasoning | ✅ Active | 12 | 48/48 (100%) | 🔴0.810 | 🔴1.140 | 🔴1.076 | 🟡0.741 | 🔴0.942 | 16.7 | 0.664 | 0.498 | 0.50 | **0.4175** |

## All Models (Research Reference)

*Rankings are by composite score among models with adequate coverage (≥80% and ≥10 rounds).*

| Rank | Model | Status | Rnds | Cov | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|------|-------|--------|------|-----|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| 🥇 | openai/gpt-5.2 | ✅ Active | 11 | 44/48 (92%) | 🟡0.507 | 🟡0.669 | 🔴0.828 | 🟡0.734 | 🟡0.684 | 95.8 | 0.566 | 0.235 | 0.50 | **0.8014** |
| 🥈 | anthropic/claude-sonnet-4-5 | ✅ Active | 12 | 48/48 (100%) | 🟡0.560 | 🟡0.757 | 🟡0.795 | 🔴0.825 | 🟡0.734 | 87.5 | 0.485 | 0.332 | 0.50 | **0.7608** |
| 🥉 | google/gemini-2.0-flash | ✅ Active | 12 | 48/48 (100%) | 🟡0.591 | 🟡0.747 | 🔴1.022 | 🔴1.105 | 🔴0.866 | 87.5 | 0.588 | 0.306 | 0.50 | **0.7507** |
| 4 | anthropic/claude-haiku-4-5 | ✅ Active | 12 | 48/48 (100%) | 🟡0.502 | 🟡0.781 | 🔴0.863 | 🔴0.916 | 🟡0.766 | 75.0 | 0.386 | 0.432 | 0.50 | **0.7058** |
| 5 | xai/grok-4 | ✅ Active | 12 | 48/48 (100%) | 🟢0.425 | 🔴0.805 | 🔴0.863 | 🔴1.171 | 🔴0.816 | 70.8 | 0.472 | 0.585 | 0.50 | **0.6456** |
| 6 | anthropic/claude-opus-4-5 | ❌ P2 | 12 | 48/48 (100%) | 🟡0.569 | 🔴0.835 | 🔴0.961 | 🟡0.778 | 🟡0.786 | 58.3 | 0.311 | 0.485 | 0.50 | **0.6398** |
| 7 | anthropic/claude-3-5-sonnet-20241022 | ❌ P2 | 12 | 48/48 (100%) | 🟡0.733 | 🔴0.852 | 🟡0.766 | 🟡0.700 | 🟡0.763 | 58.3 | 0.223 | 0.556 | 0.50 | **0.6387** |
| 8 | openai/gpt-4.1 | ✅ Active | 12 | 48/48 (100%) | 🟡0.584 | 🔴0.870 | 🔴1.332 | 🔴1.320 | 🔴1.027 | 54.2 | 0.417 | 0.515 | 0.50 | **0.6011** |
| 9 | anthropic/claude-3-7-sonnet-latest | ✅ Active | 12 | 48/48 (100%) | 🟡0.684 | 🔴0.943 | 🔴0.911 | 🟡0.781 | 🔴0.830 | 37.5 | 0.314 | 0.552 | 0.50 | **0.5425** |
| 10 | google/gemini-2.5-pro | ✅ Active | 12 | 48/48 (100%) | 🟢0.416 | 🔴0.969 | 🔴1.360 | 🔴1.770 | 🔴1.129 | 37.5 | 0.204 | 0.677 | 0.50 | **0.5340** |
| 11 | google/gemini-2.5-flash-lite | ❌ P2 | 12 | 48/48 (100%) | 🔴0.917 | 🔴0.950 | 🔴1.174 | 🔴1.530 | 🔴1.143 | 37.5 | 0.269 | 0.699 | 0.50 | **0.5198** |
| 12 | anthropic/claude-3-5-haiku-latest | ✅ Active | 12 | 48/48 (100%) | 🟡0.628 | 🔴0.981 | 🔴1.140 | 🔴0.826 | 🔴0.894 | 37.5 | 0.619 | 0.561 | 0.50 | **0.4949** |
| 13 | mistral/pixtral-large-latest | ✅ Active | 12 | 48/48 (100%) | 🟡0.756 | 🔴1.021 | 🟡0.695 | 🟡0.563 | 🟡0.759 | 29.2 | 0.520 | 0.574 | 0.50 | **0.4739** |
| 14 | google/gemini-2.5-flash | ❌ P2 | 12 | 48/48 (100%) | 🟡0.605 | 🔴1.070 | 🔴1.019 | 🔴1.296 | 🔴0.997 | 20.8 | 0.146 | 0.808 | 0.50 | **0.4499** |
| 15 | xai/grok-4.1-fast-reasoning | ❌ P2 | 12 | 48/48 (100%) | 🟡0.730 | 🔴1.000 | 🔴1.189 | 🔴1.044 | 🔴0.991 | 29.2 | 0.612 | 0.630 | 0.50 | **0.4487** |
| 16 | openai/gpt-4.1-mini | ✅ Active | 11 | 44/48 (92%) | 🟡0.661 | 🔴1.079 | 🔴1.589 | 🔴1.938 | 🔴1.317 | 20.8 | 0.616 | 0.553 | 0.50 | **0.4303** |
| 17 | xai/grok-4-fast-non-reasoning | ✅ Active | 12 | 48/48 (100%) | 🔴0.810 | 🔴1.140 | 🔴1.076 | 🟡0.741 | 🔴0.942 | 16.7 | 0.664 | 0.498 | 0.50 | **0.4175** |

### Not Ranked (Low Coverage or Early Stopped)

*These models had <80% coverage OR <10 effective rounds and are shown for reference only, not as competitive rankings.*

| Model | Status | Rnds | Cov | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|-------|--------|------|-----|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| mistral/ministral-3b-latest | ✅ Active | 1 | 4/48 (8%)⚠️ | 🟢0.223 | 🟢0.288 | 🔴1.897 | 🔴1.204 | 🔴0.903 | 100.0 | 0.288 | 0.000 | 0.50 | 0.9068 |
| openai/gpt-5 | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.470 | 🟢0.465 | 🟡0.593 | 🟡0.723 | 🟡0.563 | 100.0 | 0.465 | 0.080 | 0.50 | 0.8643 |
| openai/gpt-5-nano | ❌ P2 | 2 | 8/48 (17%)⚠️ | 🟡0.689 | 🟡0.780 | 🔴1.095 | 🟡0.672 | 🔴0.809 | 75.0 | 0.780 | 0.269 | 0.50 | 0.6791 |
| xai/grok-2-vision | ❌ P1 | 8 | 32/48 (67%)⚠️ | 🟡0.658 | 🔴0.987 | 🔴1.178 | 🔴1.268 | 🔴1.023 | 37.5 | 0.677 | 0.393 | 0.50 | 0.5198 |
| perplexity/sonar-pro | ❌ P1 | 8 | 32/48 (67%)⚠️ | 🔴1.015 | 🔴1.135 | 🔴1.771 | 🔴1.267 | 🔴1.297 | 16.7 | 0.299 | 0.726 | 0.50 | 0.4267 |
| google/gemini-3-pro-preview | ❌ P0 | 4 | 16/48 (33%)⚠️ | 🟢0.044 | 🔴1.117 | 🔴1.498 | 🔴1.101 | 🔴0.940 | 20.8 | 0.722 | 0.994 | 0.50 | 0.3264 |
| mistral/ministral-8b-latest | ❌ P0 | 4 | 16/48 (33%)⚠️ | 🟢0.065 | 🔴1.241 | 🔴1.881 | 🔴1.558 | 🔴1.186 | 8.3 | 0.812 | 1.176 | 0.50 | 0.2615 |

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

*This horizon is not rankable: only 3 negative examples (25.0%). Data shown for reference only, not as competitive rankings.*

| Model | Log Loss | Status |
|-------|----------|--------|
| xai/grok-4 | 0.4246 | ✅ Active |
| google/gemini-2.5-pro | 0.4157 | ✅ Active |
| openai/gpt-5.2 | 0.5071 | ✅ Active |
| anthropic/claude-haiku-4-5 | 0.5016 | ✅ Active |
| anthropic/claude-sonnet-4-5 | 0.5602 | ✅ Active |
| openai/gpt-4.1 | 0.5841 | ✅ Active |

### 1h Horizon (Top 10)

| Rank | Model | Score | Log Loss |
|------|-------|-------|----------|
| 1 | openai/gpt-5.2 | 0.4070 | 🟡0.6689 |
| 2 | google/gemini-2.0-flash | 0.3297 | 🟡0.7469 |
| 3 | anthropic/claude-3-7-sonnet-latest | 0.0000 | 🔴0.9427 |
| 4 | openai/gpt-4.1-mini | 0.0000 | 🔴1.0794 |

### 4h Horizon (Diagnostic Only)

*This horizon is not rankable: only 4 positive examples (33.3%). Data shown for reference only, not as competitive rankings.*

*No models qualified for this horizon.*

### 24h Horizon (Diagnostic Only)

*This horizon is not rankable: only 4 positive examples (33.3%). Data shown for reference only, not as competitive rankings.*

| Model | Log Loss | Status |
|-------|----------|--------|
| mistral/pixtral-large-latest | 0.5628 | ✅ Active |
| openai/gpt-5.2 | 0.7338 | ✅ Active |
| xai/grok-4-fast-non-reasoning | 0.7410 | ✅ Active |
| anthropic/claude-sonnet-4-5 | 0.8252 | ✅ Active |
| anthropic/claude-3-7-sonnet-latest | 0.7810 | ✅ Active |

## Elimination Audit

*Detailed per-horizon elimination reasons for each eliminated model.*

### anthropic/claude-opus-4-5 (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 0.569 |
| 1h | 1 | bottom 30% percentile | 0.835 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 0.961 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 0.778 |

### anthropic/claude-3-5-sonnet-20241022 (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 2 | high regret or instability | 0.733 |
| 1h | 2 | high regret or instability | 0.852 |
| 4h | 2 | high regret or instability | 0.766 |
| 24h | 2 | high regret or instability | 0.700 |

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

### openai/gpt-5-mini (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | - | No scored rounds | N/A |
| 1h | - | No scored rounds | N/A |
| 4h | - | No scored rounds | N/A |
| 24h | - | No scored rounds | N/A |

### openai/gpt-5-nano (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 0.689 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 0.780 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 1.095 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 0.672 |

### google/gemini-2.5-flash (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 2 | high regret or instability | 0.605 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 1.070 |
| 4h | 2 | high regret or instability | 1.019 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 1.296 |

### google/gemini-2.5-flash-lite (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 0.917 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 0.950 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 1.174 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 1.530 |

### google/gemini-3-pro-preview (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 0 | Phase 0: Failed sanity check on 15m | 0.044 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 1.117 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 1.498 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 1.101 |

### xai/grok-2-vision (Eliminated Phase 1)

**Model-level reason:** qualifies for 0 horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 0.658 |
| 1h | 1 | bottom 30% percentile | 0.987 |
| 4h | 1 | bottom 30% percentile | 1.178 |
| 24h | 1 | bottom 30% percentile | 1.268 |

### xai/grok-4.1-fast-reasoning (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 0.730 |
| 1h | 1 | bottom 30% percentile | 1.000 |
| 4h | 1 | bottom 30% percentile | 1.189 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 1.044 |

### mistral/pixtral-12b-2409 (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | - | No scored rounds | N/A |
| 1h | - | No scored rounds | N/A |
| 4h | - | No scored rounds | N/A |
| 24h | - | No scored rounds | N/A |

### mistral/ministral-8b-latest (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 0 | Phase 0: Failed sanity check on 15m | 0.065 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 1.241 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 1.881 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 1.558 |

### perplexity/sonar-pro (Eliminated Phase 1)

**Model-level reason:** qualifies for 0 horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 1.015 |
| 1h | 1 | bottom 30% percentile | 1.135 |
| 4h | 1 | bottom 30% percentile | 1.771 |
| 24h | 1 | bottom 30% percentile | 1.267 |

## Model Failures

*Note: Failed rounds (API errors, malformed responses) are excluded from scoring. The `Rnds` column shows successful rounds used in metric calculation.*

| Model | Failed Rounds |
|-------|---------------|
| openai/gpt-4o | 1, 2, 3, 4 |
| openai/gpt-4o-mini | 1, 2, 3, 4 |
| openai/gpt-4.1-mini | 3 |
| openai/gpt-5 | 2, 3, 4, 5, 7, 8, 9, 10, 11, 12 |
| openai/gpt-5-mini | 1, 2, 3, 4 |
| openai/gpt-5-nano | 1, 2, 4, 5, 6, 7, 9, 10, 11, 12 |
| openai/gpt-5.2 | 9 |
| mistral/pixtral-12b-2409 | 1, 2, 3, 4 |
| mistral/ministral-3b-latest | 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 |

---
*Auto-generated by agent_006 benchmark*