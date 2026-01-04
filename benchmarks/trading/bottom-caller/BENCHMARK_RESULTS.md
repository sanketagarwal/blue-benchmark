# agent_006 Benchmark Results

**Symbol:** COINBASE_SPOT_BTC_USD
**Start Time:** 2025-12-18T18:00:00.000Z
**Progress:** Round 12/12 (Phase 3)
**Last Updated:** 2026-01-04T18:22:51.113Z

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
| 15m | 12 | 7 | 0.517 | 0.250 | 0.850 | 0.224 | 0.50 |
| 1h | 12 | 8 | 0.471 | 0.250 | 0.780 | 0.206 | 0.42 |
| 4h | 12 | 8 | 0.511 | 0.250 | 0.820 | 0.202 | 0.50 |
| 24h | 12 | 8 | 0.431 | 0.280 | 0.760 | 0.167 | 0.25 |

### anthropic/claude-sonnet-4-5

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 4 | 0.627 | 0.280 | 0.720 | 0.159 | 0.83 |
| 1h | 12 | 5 | 0.573 | 0.280 | 0.680 | 0.155 | 0.75 |
| 4h | 12 | 9 | 0.441 | 0.300 | 0.750 | 0.160 | 0.25 |
| 24h | 12 | 8 | 0.464 | 0.250 | 0.710 | 0.139 | 0.33 |

### anthropic/claude-opus-4-5

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.787 | 0.700 | 0.850 | 0.058 | 1.00 |
| 1h | 12 | 6 | 0.724 | 0.650 | 0.800 | 0.052 | 1.00 |
| 4h | 12 | 6 | 0.662 | 0.600 | 0.750 | 0.053 | 1.00 |
| 24h | 12 | 6 | 0.513 | 0.400 | 0.650 | 0.096 | 0.42 |

### anthropic/claude-3-5-sonnet-20241022

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.413 | 0.150 | 0.750 | 0.230 | 0.42 |
| 1h | 12 | 6 | 0.350 | 0.150 | 0.700 | 0.207 | 0.33 |
| 4h | 12 | 6 | 0.371 | 0.150 | 0.650 | 0.194 | 0.33 |
| 24h | 12 | 9 | 0.313 | 0.100 | 0.600 | 0.129 | 0.08 |

### anthropic/claude-3-5-haiku-latest

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.558 | 0.250 | 0.750 | 0.205 | 0.67 |
| 1h | 12 | 6 | 0.538 | 0.200 | 0.800 | 0.226 | 0.67 |
| 4h | 12 | 6 | 0.646 | 0.250 | 0.800 | 0.170 | 0.83 |
| 24h | 12 | 5 | 0.696 | 0.400 | 0.900 | 0.165 | 0.92 |

### anthropic/claude-3-7-sonnet-latest

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 7 | 0.521 | 0.150 | 0.750 | 0.229 | 0.58 |
| 1h | 12 | 8 | 0.415 | 0.100 | 0.680 | 0.204 | 0.42 |
| 4h | 12 | 6 | 0.419 | 0.150 | 0.700 | 0.207 | 0.50 |
| 24h | 12 | 7 | 0.346 | 0.150 | 0.550 | 0.135 | 0.17 |

### openai/gpt-4.1

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 7 | 0.492 | 0.100 | 0.750 | 0.188 | 0.50 |
| 1h | 12 | 7 | 0.467 | 0.150 | 0.800 | 0.187 | 0.42 |
| 4h | 12 | 10 | 0.525 | 0.200 | 0.850 | 0.226 | 0.50 |
| 24h | 12 | 7 | 0.579 | 0.200 | 0.900 | 0.271 | 0.67 |

### openai/gpt-4.1-mini

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.645 | 0.100 | 0.850 | 0.243 | 0.80 |
| 1h | 12 | 8 | 0.515 | 0.050 | 0.800 | 0.255 | 0.60 |
| 4h | 12 | 6 | 0.575 | 0.050 | 0.850 | 0.336 | 0.70 |
| 24h | 12 | 7 | 0.590 | 0.050 | 0.900 | 0.342 | 0.70 |
**Failures:** 2 parse, 0 schema (effectiveN: 10/12)


### openai/gpt-5.2

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.570 | 0.280 | 0.780 | 0.138 | 0.78 |
| 1h | 12 | 9 | 0.497 | 0.320 | 0.700 | 0.127 | 0.56 |
| 4h | 12 | 9 | 0.526 | 0.320 | 0.730 | 0.142 | 0.56 |
| 24h | 12 | 7 | 0.436 | 0.300 | 0.640 | 0.108 | 0.22 |
**Failures:** 3 parse, 0 schema (effectiveN: 9/12)


### google/gemini-2.0-flash

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 3 | 0.517 | 0.200 | 0.700 | 0.219 | 0.58 |
| 1h | 12 | 3 | 0.442 | 0.300 | 0.600 | 0.138 | 0.42 |
| 4h | 12 | 3 | 0.525 | 0.300 | 0.600 | 0.109 | 0.67 |
| 24h | 12 | 7 | 0.500 | 0.200 | 0.800 | 0.168 | 0.67 |

### google/gemini-2.5-flash

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 9 | 0.400 | 0.000 | 0.900 | 0.343 | 0.42 |
| 1h | 12 | 7 | 0.300 | 0.000 | 0.850 | 0.305 | 0.25 |
| 4h | 12 | 6 | 0.221 | 0.000 | 0.800 | 0.244 | 0.17 |
| 24h | 12 | 8 | 0.262 | 0.000 | 0.900 | 0.308 | 0.25 |

### google/gemini-2.5-flash-lite

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 2 | 0.375 | 0.250 | 0.750 | 0.217 | 0.25 |
| 1h | 12 | 3 | 0.375 | 0.200 | 0.850 | 0.275 | 0.25 |
| 4h | 12 | 4 | 0.487 | 0.150 | 0.800 | 0.270 | 0.50 |
| 24h | 12 | 3 | 0.688 | 0.600 | 0.850 | 0.096 | 1.00 |

### google/gemini-2.5-pro

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 8 | 0.496 | 0.100 | 0.900 | 0.313 | 0.58 |
| 1h | 12 | 6 | 0.317 | 0.100 | 0.750 | 0.244 | 0.25 |
| 4h | 12 | 8 | 0.296 | 0.050 | 0.900 | 0.259 | 0.17 |
| 24h | 12 | 8 | 0.267 | 0.050 | 0.900 | 0.270 | 0.17 |

### google/gemini-3-pro-preview

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 8 | 0.689 | 0.050 | 0.950 | 0.344 | 0.75 |
| 1h | 12 | 7 | 0.575 | 0.050 | 0.900 | 0.338 | 0.67 |
| 4h | 12 | 8 | 0.488 | 0.100 | 0.800 | 0.282 | 0.58 |
| 24h | 12 | 8 | 0.371 | 0.100 | 0.700 | 0.238 | 0.42 |

### xai/grok-2-vision

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.704 | 0.400 | 0.800 | 0.113 | 0.92 |
| 1h | 12 | 7 | 0.604 | 0.300 | 0.800 | 0.165 | 0.75 |
| 4h | 12 | 8 | 0.608 | 0.200 | 0.800 | 0.166 | 0.75 |
| 24h | 12 | 9 | 0.583 | 0.100 | 0.900 | 0.237 | 0.58 |

### xai/grok-4-fast-non-reasoning

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.688 | 0.250 | 0.850 | 0.149 | 0.92 |
| 1h | 12 | 5 | 0.633 | 0.200 | 0.800 | 0.162 | 0.83 |
| 4h | 12 | 8 | 0.538 | 0.150 | 0.800 | 0.201 | 0.58 |
| 24h | 12 | 10 | 0.450 | 0.150 | 0.800 | 0.201 | 0.33 |

### xai/grok-4.1-fast-reasoning

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 4 | 0.475 | 0.150 | 0.850 | 0.286 | 0.50 |
| 1h | 12 | 3 | 0.487 | 0.200 | 0.800 | 0.288 | 0.50 |
| 4h | 12 | 3 | 0.750 | 0.700 | 0.850 | 0.061 | 1.00 |
| 24h | 12 | 3 | 0.813 | 0.650 | 0.900 | 0.096 | 1.00 |

### xai/grok-4

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 8 | 0.512 | 0.250 | 0.950 | 0.241 | 0.50 |
| 1h | 12 | 6 | 0.546 | 0.300 | 0.850 | 0.209 | 0.50 |
| 4h | 12 | 6 | 0.662 | 0.250 | 0.850 | 0.206 | 0.75 |
| 24h | 12 | 7 | 0.733 | 0.100 | 0.950 | 0.263 | 0.83 |

### mistral/pixtral-large-latest

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 8 | 0.313 | 0.050 | 0.850 | 0.224 | 0.17 |
| 1h | 12 | 6 | 0.300 | 0.100 | 0.800 | 0.203 | 0.17 |
| 4h | 12 | 7 | 0.354 | 0.100 | 0.850 | 0.247 | 0.25 |
| 24h | 12 | 9 | 0.404 | 0.100 | 0.900 | 0.288 | 0.42 |

### mistral/ministral-8b-latest

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m ⚠️ | 12 | 1 | 0.950 | 0.950 | 0.950 | 0.000 | 1.00 |
| 1h | 12 | 2 | 0.862 | 0.750 | 0.900 | 0.065 | 1.00 |
| 4h | 12 | 2 | 0.813 | 0.700 | 0.850 | 0.065 | 1.00 |
| 24h | 12 | 2 | 0.762 | 0.650 | 0.800 | 0.065 | 1.00 |

### perplexity/sonar-pro

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 3 | 0.756 | 0.400 | 0.850 | 0.149 | 0.88 |
| 1h | 12 | 4 | 0.713 | 0.350 | 0.800 | 0.145 | 0.88 |
| 4h | 12 | 3 | 0.738 | 0.700 | 0.800 | 0.033 | 1.00 |
| 24h | 12 | 5 | 0.688 | 0.600 | 0.850 | 0.074 | 1.00 |

### openai/gpt-5-mini

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m ⚠️ | 12 | 1 | 0.700 | 0.700 | 0.700 | 0.000 | 1.00 |
| 1h ⚠️ | 12 | 1 | 0.650 | 0.650 | 0.650 | 0.000 | 1.00 |
| 4h ⚠️ | 12 | 1 | 0.800 | 0.800 | 0.800 | 0.000 | 1.00 |
| 24h ⚠️ | 12 | 1 | 0.600 | 0.600 | 0.600 | 0.000 | 1.00 |
**Failures:** 11 parse, 0 schema (effectiveN: 1/12)


### openai/gpt-5-nano

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 2 | 0.725 | 0.700 | 0.750 | 0.025 | 1.00 |
| 1h | 12 | 2 | 0.685 | 0.650 | 0.720 | 0.035 | 1.00 |
| 4h | 12 | 2 | 0.525 | 0.400 | 0.650 | 0.125 | 0.50 |
| 24h | 12 | 2 | 0.425 | 0.400 | 0.450 | 0.025 | 0.00 |
**Failures:** 10 parse, 0 schema (effectiveN: 2/12)


**Warnings:**
- ⚠️ mistral/ministral-8b-latest (15m): Constant predictor detected
- ⚠️ openai/gpt-5-mini (15m): Constant predictor detected
- ⚠️ openai/gpt-5-mini (1h): Constant predictor detected
- ⚠️ openai/gpt-5-mini (4h): Constant predictor detected
- ⚠️ openai/gpt-5-mini (24h): Constant predictor detected

## Failure Audit

*Failed rounds are excluded from scoring.*

**Aggregate:**
- Total model calls: 336 (28 models × 12 rounds)
- Failed model calls: 46 (13.7%)
- Total horizon predictions: 1344 (28 models × 12 rounds × 4 horizons)
- Failed horizon predictions: 184 (13.7%)

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
| openai/gpt-4.1-mini | 2/12 | 8 | 0 | 0 | 0 | 2 | 0 |
| openai/gpt-5 | 4/12 | 16 | 0 | 0 | 0 | 4 | 0 |
| openai/gpt-5-mini | 11/12 | 44 | 0 | 0 | 0 | 11 | 0 |
| openai/gpt-5-nano | 10/12 | 40 | 0 | 0 | 0 | 10 | 0 |
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
| mistral/ministral-3b-latest | 4/12 | 16 | 0 | 0 | 0 | 4 | 0 |
| mistral/ministral-8b-latest | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |
| perplexity/sonar-pro | 0/12 | 0 | 0 | 0 | 0 | 0 | 0 |

## Summary

- **Active Models:** 11
- **Eliminated:** 17
- **Models with Failures:** 9

## Arena Results by Horizon

*Models with <10 scored rounds on a given horizon are excluded from that arena.*

### 15m Arena Winners

*This horizon is not rankable: only 3 negative examples (25.0%). Rankings would not be statistically meaningful.*

### 1h Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | openai/gpt-4.1 | 0.14 | 🟡0.76 | 0.68 | 0.003 |
| 🥈 | anthropic/claude-sonnet-4-5 | 0.12 | 🟡0.71 | 0.66 | 0.007 |
| 🥉 | anthropic/claude-haiku-4-5 | 0.11 | 🔴0.84 | 0.75 | 0.003 |
| 4 | xai/grok-2-vision | 0.01 | 🟡0.76 | 0.73 | 0.008 |

### 4h Arena Winners

*This horizon is not rankable: only 4 positive examples (33.3%). Rankings would not be statistically meaningful.*

### 24h Arena Winners

*This horizon is not rankable: only 4 positive examples (33.3%). Rankings would not be statistically meaningful.*

## Cross-Horizon Strength

*Cross-horizon analysis requires at least 2 rankable horizons. This run has only 1.*

## Final Standings (Survivors)

*Models with <80% coverage or <10 effective rounds on all horizons are excluded.*

| Rank | Model | Status | Rnds | Cov | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|------|-------|--------|------|-----|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| 🥇 | google/gemini-2.0-flash | ✅ Active | 12 | 48/48 (100%) | 🟡0.521 | 🟡0.689 | 🔴0.940 | 🔴1.048 | 🟡0.799 | 100.0 | 0.357 | 0.309 | 0.50 | **0.8348** |
| 🥈 | anthropic/claude-sonnet-4-5 | ✅ Active | 12 | 48/48 (100%) | 🟡0.529 | 🟡0.705 | 🔴0.886 | 🔴0.806 | 🟡0.732 | 100.0 | 0.457 | 0.355 | 0.50 | **0.8104** |
| 🥉 | openai/gpt-4.1 | ✅ Active | 12 | 48/48 (100%) | 🟡0.532 | 🟡0.762 | 🔴1.233 | 🔴1.537 | 🔴1.016 | 82.6 | 0.368 | 0.367 | 0.50 | **0.7518** |
| 4 | xai/grok-2-vision | ✅ Active | 12 | 48/48 (100%) | 🟡0.542 | 🟡0.757 | 🔴1.132 | 🔴1.283 | 🔴0.928 | 82.6 | 0.410 | 0.442 | 0.50 | **0.7306** |
| 5 | anthropic/claude-haiku-4-5 | ✅ Active | 12 | 48/48 (100%) | 🟡0.713 | 🔴0.836 | 🔴0.931 | 🔴0.829 | 🔴0.827 | 69.6 | 0.343 | 0.429 | 0.50 | **0.6909** |
| 6 | anthropic/claude-3-5-sonnet-20241022 | ✅ Active | 12 | 48/48 (100%) | 🟡0.675 | 🔴0.869 | 🔴1.012 | 🔴0.863 | 🔴0.855 | 65.2 | 0.245 | 0.639 | 0.50 | **0.6464** |
| 7 | xai/grok-4 | ✅ Active | 12 | 48/48 (100%) | 🟡0.654 | 🔴0.887 | 🔴1.155 | 🔴1.511 | 🔴1.052 | 60.9 | 0.616 | 0.431 | 0.50 | **0.6149** |
| 8 | anthropic/claude-3-5-haiku-latest | ✅ Active | 12 | 48/48 (100%) | 🟡0.685 | 🔴1.012 | 🔴1.112 | 🔴1.055 | 🔴0.966 | 34.8 | 0.639 | 0.496 | 0.50 | **0.4941** |

## All Models (Research Reference)

*Includes eliminated models for comparative analysis. Rankings are by raw composite score, not tournament outcome.*

| Rank | Model | Status | Rnds | Cov | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|------|-------|--------|------|-----|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| 🥇 | openai/gpt-5-mini | ✅ Active | 1 | 4/48 (8%)⚠️ | 🟢0.357 | 🟢0.431 | 🔴1.609 | 🔴0.916 | 🔴0.828 | 100.0 | 0.431 | 0.000 | 0.50 | **0.8854** |
| 🥈 | google/gemini-2.0-flash | ✅ Active | 12 | 48/48 (100%) | 🟡0.521 | 🟡0.689 | 🔴0.940 | 🔴1.048 | 🟡0.799 | 100.0 | 0.357 | 0.309 | 0.50 | **0.8348** |
| 🥉 | openai/gpt-5.2 | ✅ Active | 9 | 36/48 (75%)⚠️ | 🟡0.521 | 🟡0.659 | 🔴0.986 | 🔴0.801 | 🟡0.742 | 100.0 | 0.551 | 0.239 | 0.50 | **0.8196** |
| 4 | anthropic/claude-sonnet-4-5 | ✅ Active | 12 | 48/48 (100%) | 🟡0.529 | 🟡0.705 | 🔴0.886 | 🔴0.806 | 🟡0.732 | 100.0 | 0.457 | 0.355 | 0.50 | **0.8104** |
| 5 | mistral/pixtral-large-latest | ❌ P2 | 12 | 48/48 (100%) | 🔴1.063 | 🟡0.684 | 🔴0.988 | 🔴1.148 | 🔴0.971 | 100.0 | 0.223 | 0.682 | 0.50 | **0.7802** |
| 6 | openai/gpt-4.1 | ✅ Active | 12 | 48/48 (100%) | 🟡0.532 | 🟡0.762 | 🔴1.233 | 🔴1.537 | 🔴1.016 | 82.6 | 0.368 | 0.367 | 0.50 | **0.7518** |
| 7 | anthropic/claude-opus-4-5 | ❌ P2 | 12 | 48/48 (100%) | 🟢0.484 | 🟡0.769 | 🔴0.919 | 🔴0.835 | 🟡0.752 | 82.6 | 0.311 | 0.493 | 0.50 | **0.7352** |
| 8 | xai/grok-2-vision | ✅ Active | 12 | 48/48 (100%) | 🟡0.542 | 🟡0.757 | 🔴1.132 | 🔴1.283 | 🔴0.928 | 82.6 | 0.410 | 0.442 | 0.50 | **0.7306** |
| 9 | anthropic/claude-haiku-4-5 | ✅ Active | 12 | 48/48 (100%) | 🟡0.713 | 🔴0.836 | 🔴0.931 | 🔴0.829 | 🔴0.827 | 69.6 | 0.343 | 0.429 | 0.50 | **0.6909** |
| 10 | anthropic/claude-3-5-sonnet-20241022 | ✅ Active | 12 | 48/48 (100%) | 🟡0.675 | 🔴0.869 | 🔴1.012 | 🔴0.863 | 🔴0.855 | 65.2 | 0.245 | 0.639 | 0.50 | **0.6464** |
| 11 | google/gemini-2.5-pro | ❌ P2 | 12 | 48/48 (100%) | 🟡0.565 | 🔴0.876 | 🔴1.203 | 🔴1.307 | 🔴0.988 | 65.2 | 0.183 | 0.777 | 0.50 | **0.6280** |
| 12 | openai/gpt-5-nano | ✅ Active | 2 | 8/48 (17%)⚠️ | 🟢0.322 | 🔴0.852 | 🔴0.983 | 🟡0.757 | 🟡0.729 | 69.6 | 0.852 | 0.421 | 0.50 | **0.6163** |
| 13 | xai/grok-4 | ✅ Active | 12 | 48/48 (100%) | 🟡0.654 | 🔴0.887 | 🔴1.155 | 🔴1.511 | 🔴1.052 | 60.9 | 0.616 | 0.431 | 0.50 | **0.6149** |
| 14 | anthropic/claude-3-7-sonnet-latest | ❌ P2 | 12 | 48/48 (100%) | 🟡0.567 | 🔴0.943 | 🔴1.130 | 🔴0.890 | 🔴0.883 | 47.8 | 0.334 | 0.591 | 0.50 | **0.5730** |
| 15 | xai/grok-4-fast-non-reasoning | ❌ P2 | 12 | 48/48 (100%) | 🟡0.666 | 🔴1.005 | 🔴1.045 | 🔴0.897 | 🔴0.903 | 34.8 | 0.406 | 0.469 | 0.50 | **0.5345** |
| 16 | anthropic/claude-3-5-haiku-latest | ✅ Active | 12 | 48/48 (100%) | 🟡0.685 | 🔴1.012 | 🔴1.112 | 🔴1.055 | 🔴0.966 | 34.8 | 0.639 | 0.496 | 0.50 | **0.4941** |
| 17 | perplexity/sonar-pro | ❌ P1 | 8 | 32/32 (100%)⚠️ | 🟡0.577 | 🔴0.990 | 🔴1.346 | 🔴1.200 | 🔴1.028 | 34.8 | 0.685 | 0.567 | 0.50 | **0.4729** |
| 18 | xai/grok-4.1-fast-reasoning | ❌ P0 | 4 | 16/16 (100%)⚠️ | 🔴0.969 | 🔴0.932 | 🔴1.423 | 🔴1.787 | 🔴1.278 | 52.2 | 1.147 | 0.677 | 0.50 | **0.4511** |
| 19 | google/gemini-3-pro-preview | ❌ P2 | 12 | 48/48 (100%) | 🟡0.523 | 🔴1.061 | 🔴1.157 | 🔴1.023 | 🔴0.941 | 21.7 | 0.533 | 0.964 | 0.50 | **0.3641** |
| 20 | openai/gpt-4.1-mini | ❌ P2 | 10 | 40/48 (83%) | 🟡0.758 | 🔴1.211 | 🔴1.951 | 🔴2.005 | 🔴1.481 | 13.0 | 0.619 | 0.761 | 0.50 | **0.3571** |
| 21 | google/gemini-2.5-flash | ❌ P2 | 12 | 48/48 (100%) | 🔴3.540 | 🔴3.829 | 🔴3.727 | 🔴4.031 | 🔴3.782 | 0.0 | 0.106 | 9.295 | 0.50 | **0.3340** |
| 22 | google/gemini-2.5-flash-lite | ❌ P0 | 4 | 16/16 (100%)⚠️ | 🔴1.112 | 🔴1.351 | 🔴0.833 | 🔴1.228 | 🔴1.131 | 8.7 | 1.169 | 0.625 | 0.50 | **0.2845** |
| 23 | mistral/ministral-8b-latest | ❌ P0 | 4 | 16/16 (100%)⚠️ | 🟢0.051 | 🔴1.250 | 🔴1.724 | 🔴1.470 | 🔴1.124 | 13.0 | 0.899 | 1.055 | 0.50 | **0.2674** |

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

*Same data as Arena Winners, showing top 10 per horizon. Models with <10 scored rounds excluded.*

### 15m Horizon (Diagnostic Only)

*This horizon is not rankable: only 3 negative examples (25.0%). Data shown for reference only, not as competitive rankings.*

| Model | Log Loss | Status |
|-------|----------|--------|
| google/gemini-2.0-flash | 0.5206 | ✅ Active |
| openai/gpt-4.1 | 0.5324 | ✅ Active |
| anthropic/claude-sonnet-4-5 | 0.5291 | ✅ Active |
| anthropic/claude-3-5-sonnet-20241022 | 0.6746 | ✅ Active |
| xai/grok-4 | 0.6540 | ✅ Active |

### 1h Horizon (Top 10)

| Rank | Model | Score | Log Loss |
|------|-------|-------|----------|
| 1 | openai/gpt-4.1 | 0.1446 | 🟡0.7623 |
| 2 | anthropic/claude-sonnet-4-5 | 0.1172 | 🟡0.7055 |
| 3 | anthropic/claude-haiku-4-5 | 0.1147 | 🔴0.8364 |
| 4 | xai/grok-2-vision | 0.0084 | 🟡0.7568 |

### 4h Horizon (Diagnostic Only)

*This horizon is not rankable: only 4 positive examples (33.3%). Data shown for reference only, not as competitive rankings.*

*No models qualified for this horizon.*

### 24h Horizon (Diagnostic Only)

*This horizon is not rankable: only 4 positive examples (33.3%). Data shown for reference only, not as competitive rankings.*

| Model | Log Loss | Status |
|-------|----------|--------|
| google/gemini-2.0-flash | 1.0479 | ✅ Active |

## Elimination Audit

*Detailed per-horizon elimination reasons for each eliminated model.*

### anthropic/claude-opus-4-5 (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 0.484 |
| 1h | 1 | bottom 30% percentile | 0.769 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 0.919 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 0.835 |

### anthropic/claude-3-7-sonnet-latest (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 2 | high regret or instability | 0.567 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 0.943 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 1.130 |
| 24h | 2 | high regret or instability | 0.890 |

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

### openai/gpt-4.1-mini (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 2 | high regret or instability | 0.758 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 1.211 |
| 4h | 1 | bottom 30% percentile | 1.951 |
| 24h | 1 | bottom 30% percentile | 2.005 |

### openai/gpt-5 (Eliminated Phase 0)

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
| 15m | 1 | bottom 30% percentile | 3.540 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 3.829 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 3.727 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 4.031 |

### google/gemini-2.5-flash-lite (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 0 | Phase 0: Failed sanity check on 15m | 1.112 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 1.351 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 0.833 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 1.228 |

### google/gemini-2.5-pro (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 2 | high regret or instability | 0.565 |
| 1h | 2 | high regret or instability | 0.876 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 1.203 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 1.307 |

### google/gemini-3-pro-preview (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 0 | Phase 0: Failed sanity check on 15m | 0.523 |
| 1h | 1 | bottom 30% percentile | 1.061 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 1.157 |
| 24h | 2 | high regret or instability | 1.023 |

### xai/grok-4-fast-non-reasoning (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 0.666 |
| 1h | 1 | bottom 30% percentile | 1.005 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 1.045 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 0.897 |

### xai/grok-4.1-fast-reasoning (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 0 | Phase 0: Failed sanity check on 15m | 0.969 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 0.932 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 1.423 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 1.787 |

### mistral/pixtral-large-latest (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 1.063 |
| 1h | 2 | high regret or instability | 0.684 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 0.988 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 1.148 |

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

### mistral/ministral-8b-latest (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 0 | Phase 0: Failed sanity check on 15m | 0.051 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 1.250 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 1.724 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 1.470 |

### perplexity/sonar-pro (Eliminated Phase 1)

**Model-level reason:** qualifies for 0 horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 0.577 |
| 1h | 1 | bottom 30% percentile | 0.990 |
| 4h | 1 | bottom 30% percentile | 1.346 |
| 24h | 1 | bottom 30% percentile | 1.200 |

## Model Failures

*Note: Failed rounds (API errors, malformed responses) are excluded from scoring. The `Rnds` column shows successful rounds used in metric calculation.*

| Model | Failed Rounds |
|-------|---------------|
| openai/gpt-4o | 1, 2, 3, 4 |
| openai/gpt-4o-mini | 1, 2, 3, 4 |
| openai/gpt-4.1-mini | 8, 9 |
| openai/gpt-5 | 1, 2, 3, 4 |
| openai/gpt-5-mini | 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 |
| openai/gpt-5-nano | 1, 2, 4, 5, 6, 7, 8, 9, 10, 12 |
| openai/gpt-5.2 | 3, 7, 11 |
| mistral/pixtral-12b-2409 | 1, 2, 3, 4 |
| mistral/ministral-3b-latest | 1, 2, 3, 4 |

---
*Auto-generated by agent_006 benchmark*