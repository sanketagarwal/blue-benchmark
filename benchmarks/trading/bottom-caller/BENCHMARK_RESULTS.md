# agent_006 Benchmark Results

**Symbol:** COINBASE_SPOT_BTC_USD
**Start Time:** 2025-12-18T18:00:00.000Z
**Progress:** Round 12/12 (Phase 3)
**Last Updated:** 2026-01-04T06:24:29.725Z

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

| Horizon | N | True | False | pTrue | Random LL | Prevalence LL | AlwaysTrue LL | AlwaysFalse LL | trivialBest LL |
|---------|---|------|-------|-------|-----------|---------------|---------------|----------------|----------------|
| 15m | 12 | 9 | 3 | 0.750 | 0.693 | 0.562 | 8.635 | 25.904 | 8.635 |
| 1h | 12 | 6 | 6 | 0.500 | 0.693 | 0.693 | 17.269 | 17.269 | 17.269 |
| 4h | 12 | 4 | 8 | 0.333 | 0.693 | 0.637 | 23.026 | 11.513 | 11.513 |
| 24h | 12 | 4 | 8 | 0.333 | 0.693 | 0.637 | 23.026 | 11.513 | 11.513 |

*Clipping: ε = 1e-15 (probabilities clipped to [ε, 1-ε] to avoid log(0))*

**Interpretation:**
- *pTrue*: Label prevalence. If extremely skewed (>0.9 or <0.1), models may achieve good log loss without skill.
- *Random LL*: Baseline log loss for p=0.5 predictor (always 0.693).
- *Prevalence LL*: Baseline log loss for optimal constant predictor. Models must beat this to show skill.
- *AlwaysTrue LL*: Log loss for always predicting p=1-ε. Low when most labels are true.
- *AlwaysFalse LL*: Log loss for always predicting p=ε. Low when most labels are false.
- *trivialBest LL*: min(AlwaysTrue LL, AlwaysFalse LL). Approaches 0 for single-class datasets.

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
| 15m | 12 | 7 | 0.654 | 0.280 | 0.850 | 0.167 | 0.82 |
| 1h | 12 | 9 | 0.557 | 0.250 | 0.780 | 0.187 | 0.64 |
| 4h | 12 | 8 | 0.485 | 0.250 | 0.750 | 0.197 | 0.45 |
| 24h | 12 | 6 | 0.356 | 0.200 | 0.680 | 0.118 | 0.09 |
**Failures:** 1 parse, 0 schema (effectiveN: 11/12)


### anthropic/claude-sonnet-4-5

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.615 | 0.280 | 0.720 | 0.149 | 0.83 |
| 1h | 12 | 7 | 0.550 | 0.250 | 0.680 | 0.141 | 0.75 |
| 4h | 12 | 7 | 0.374 | 0.280 | 0.650 | 0.089 | 0.08 |
| 24h | 12 | 7 | 0.395 | 0.250 | 0.700 | 0.128 | 0.17 |

### anthropic/claude-opus-4-5

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 4 | 0.788 | 0.720 | 0.850 | 0.056 | 1.00 |
| 1h | 12 | 4 | 0.721 | 0.650 | 0.800 | 0.052 | 1.00 |
| 4h | 12 | 6 | 0.667 | 0.580 | 0.750 | 0.050 | 1.00 |
| 24h | 12 | 4 | 0.504 | 0.400 | 0.650 | 0.088 | 0.33 |

### anthropic/claude-3-5-sonnet-20241022

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.483 | 0.150 | 0.750 | 0.252 | 0.58 |
| 1h | 12 | 4 | 0.338 | 0.200 | 0.650 | 0.185 | 0.25 |
| 4h | 12 | 5 | 0.304 | 0.200 | 0.600 | 0.103 | 0.08 |
| 24h | 12 | 6 | 0.317 | 0.150 | 0.450 | 0.099 | 0.00 |

### anthropic/claude-3-5-haiku-latest

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.637 | 0.250 | 0.850 | 0.199 | 0.75 |
| 1h | 12 | 7 | 0.604 | 0.150 | 0.800 | 0.208 | 0.75 |
| 4h | 12 | 6 | 0.637 | 0.100 | 0.850 | 0.183 | 0.92 |
| 24h | 12 | 6 | 0.592 | 0.200 | 0.900 | 0.154 | 0.92 |

### anthropic/claude-3-7-sonnet-latest

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 7 | 0.463 | 0.150 | 0.750 | 0.252 | 0.50 |
| 1h | 12 | 7 | 0.426 | 0.100 | 0.680 | 0.230 | 0.50 |
| 4h | 12 | 8 | 0.433 | 0.200 | 0.650 | 0.170 | 0.42 |
| 24h | 12 | 7 | 0.381 | 0.150 | 0.600 | 0.130 | 0.17 |

### openai/gpt-4o

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 2 | 0.425 | 0.200 | 0.650 | 0.225 | 0.50 |
| 1h | 12 | 2 | 0.450 | 0.300 | 0.600 | 0.150 | 0.50 |
| 4h | 12 | 2 | 0.450 | 0.300 | 0.600 | 0.150 | 0.50 |
| 24h | 12 | 2 | 0.475 | 0.250 | 0.700 | 0.225 | 0.50 |
**Failures:** 10 parse, 0 schema (effectiveN: 2/12)


### openai/gpt-4.1

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 7 | 0.525 | 0.050 | 0.750 | 0.231 | 0.67 |
| 1h | 12 | 7 | 0.450 | 0.100 | 0.750 | 0.221 | 0.42 |
| 4h | 12 | 7 | 0.542 | 0.200 | 0.850 | 0.268 | 0.58 |
| 24h | 12 | 10 | 0.575 | 0.150 | 0.900 | 0.278 | 0.58 |

### openai/gpt-4.1-mini

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 7 | 0.568 | 0.100 | 0.850 | 0.262 | 0.73 |
| 1h | 12 | 8 | 0.509 | 0.050 | 0.800 | 0.279 | 0.64 |
| 4h | 12 | 7 | 0.545 | 0.100 | 0.900 | 0.326 | 0.64 |
| 24h | 12 | 6 | 0.555 | 0.050 | 0.900 | 0.369 | 0.64 |
**Failures:** 1 parse, 0 schema (effectiveN: 11/12)


### openai/gpt-5.2

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 10 | 0.532 | 0.050 | 0.800 | 0.192 | 0.67 |
| 1h | 12 | 9 | 0.448 | 0.060 | 0.670 | 0.166 | 0.42 |
| 4h | 12 | 10 | 0.437 | 0.120 | 0.640 | 0.144 | 0.42 |
| 24h | 12 | 7 | 0.394 | 0.200 | 0.550 | 0.099 | 0.17 |

### google/gemini-2.0-flash

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 3 | 0.517 | 0.200 | 0.700 | 0.219 | 0.58 |
| 1h | 12 | 4 | 0.400 | 0.200 | 0.600 | 0.147 | 0.33 |
| 4h | 12 | 4 | 0.500 | 0.200 | 0.600 | 0.147 | 0.67 |
| 24h | 12 | 5 | 0.533 | 0.200 | 0.700 | 0.175 | 0.67 |

### google/gemini-2.5-flash

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 9 | 0.479 | 0.050 | 0.900 | 0.345 | 0.50 |
| 1h | 12 | 8 | 0.387 | 0.050 | 0.850 | 0.313 | 0.42 |
| 4h | 12 | 7 | 0.250 | 0.050 | 0.700 | 0.218 | 0.17 |
| 24h | 12 | 5 | 0.408 | 0.050 | 0.900 | 0.356 | 0.33 |

### google/gemini-2.5-flash-lite

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.471 | 0.250 | 0.850 | 0.227 | 0.42 |
| 1h | 12 | 6 | 0.371 | 0.200 | 0.850 | 0.250 | 0.25 |
| 4h | 12 | 5 | 0.258 | 0.100 | 0.650 | 0.185 | 0.17 |
| 24h | 12 | 7 | 0.313 | 0.050 | 0.700 | 0.244 | 0.33 |

### google/gemini-2.5-pro

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 7 | 0.417 | 0.100 | 0.850 | 0.288 | 0.33 |
| 1h | 12 | 6 | 0.296 | 0.150 | 0.750 | 0.198 | 0.17 |
| 4h | 12 | 6 | 0.296 | 0.050 | 0.850 | 0.314 | 0.25 |
| 24h | 12 | 4 | 0.279 | 0.050 | 0.900 | 0.350 | 0.25 |

### google/gemini-3-pro-preview

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m ⚠️ | 12 | 1 | 0.950 | 0.950 | 0.950 | 0.000 | 1.00 |
| 1h | 12 | 2 | 0.875 | 0.850 | 0.900 | 0.025 | 1.00 |
| 4h | 12 | 2 | 0.788 | 0.750 | 0.800 | 0.022 | 1.00 |
| 24h | 12 | 2 | 0.662 | 0.650 | 0.700 | 0.022 | 1.00 |

### xai/grok-2-vision

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.746 | 0.600 | 0.800 | 0.066 | 1.00 |
| 1h | 12 | 5 | 0.704 | 0.600 | 0.850 | 0.059 | 1.00 |
| 4h | 12 | 7 | 0.721 | 0.600 | 0.900 | 0.095 | 1.00 |
| 24h | 12 | 6 | 0.612 | 0.400 | 0.900 | 0.121 | 0.75 |

### xai/grok-4-fast-non-reasoning

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.725 | 0.300 | 0.850 | 0.185 | 0.83 |
| 1h | 12 | 5 | 0.675 | 0.250 | 0.800 | 0.183 | 0.83 |
| 4h | 12 | 7 | 0.625 | 0.350 | 0.900 | 0.160 | 0.75 |
| 24h | 12 | 6 | 0.417 | 0.250 | 0.700 | 0.125 | 0.17 |

### xai/grok-4.1-fast-reasoning

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.785 | 0.250 | 0.920 | 0.175 | 0.92 |
| 1h | 12 | 6 | 0.745 | 0.200 | 0.870 | 0.169 | 0.92 |
| 4h | 12 | 6 | 0.675 | 0.350 | 0.850 | 0.155 | 0.83 |
| 24h | 12 | 8 | 0.633 | 0.250 | 0.880 | 0.164 | 0.83 |

### xai/grok-4

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 3 | 0.412 | 0.200 | 0.850 | 0.265 | 0.25 |
| 1h | 12 | 4 | 0.363 | 0.150 | 0.750 | 0.230 | 0.25 |
| 4h | 12 | 4 | 0.513 | 0.300 | 0.800 | 0.201 | 0.50 |
| 24h | 12 | 3 | 0.675 | 0.200 | 0.850 | 0.275 | 0.75 |

### mistral/ministral-8b-latest

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.794 | 0.150 | 0.950 | 0.248 | 0.88 |
| 1h | 12 | 5 | 0.781 | 0.100 | 0.950 | 0.265 | 0.88 |
| 4h | 12 | 4 | 0.813 | 0.750 | 0.900 | 0.048 | 1.00 |
| 24h | 12 | 7 | 0.719 | 0.200 | 0.950 | 0.218 | 0.88 |

### perplexity/sonar-pro

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 2 | 0.781 | 0.300 | 0.850 | 0.182 | 0.88 |
| 1h | 12 | 2 | 0.744 | 0.350 | 0.800 | 0.149 | 0.88 |
| 4h | 12 | 2 | 0.731 | 0.600 | 0.750 | 0.050 | 1.00 |
| 24h | 12 | 3 | 0.675 | 0.650 | 0.750 | 0.035 | 1.00 |

### openai/gpt-5

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 2 | 0.750 | 0.660 | 0.840 | 0.090 | 1.00 |
| 1h | 12 | 2 | 0.555 | 0.440 | 0.670 | 0.115 | 0.50 |
| 4h | 12 | 2 | 0.595 | 0.580 | 0.610 | 0.015 | 1.00 |
| 24h ⚠️ | 12 | 1 | 0.600 | 0.600 | 0.600 | 0.000 | 1.00 |
**Failures:** 10 parse, 0 schema (effectiveN: 2/12)


### mistral/pixtral-large-latest

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m | 12 | 7 | 0.468 | 0.100 | 0.850 | 0.277 | 0.45 |
| 1h | 12 | 7 | 0.445 | 0.150 | 0.800 | 0.267 | 0.45 |
| 4h | 12 | 6 | 0.445 | 0.150 | 0.900 | 0.298 | 0.36 |
| 24h | 12 | 6 | 0.468 | 0.100 | 0.950 | 0.327 | 0.36 |
**Failures:** 1 parse, 0 schema (effectiveN: 11/12)


### mistral/pixtral-12b-2409

| Horizon | N | Unique P | pMean | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|-------|------|------|---------|---------------|
| 15m ⚠️ | 12 | 1 | 0.800 | 0.800 | 0.800 | 0.000 | 1.00 |
| 1h ⚠️ | 12 | 1 | 0.850 | 0.850 | 0.850 | 0.000 | 1.00 |
| 4h ⚠️ | 12 | 1 | 0.900 | 0.900 | 0.900 | 0.000 | 1.00 |
| 24h ⚠️ | 12 | 1 | 0.950 | 0.950 | 0.950 | 0.000 | 1.00 |
**Failures:** 11 parse, 0 schema (effectiveN: 1/12)


**Warnings:**
- ⚠️ google/gemini-3-pro-preview (15m): Constant predictor detected
- ⚠️ openai/gpt-5 (24h): Constant predictor detected
- ⚠️ mistral/pixtral-12b-2409 (15m): Constant predictor detected
- ⚠️ mistral/pixtral-12b-2409 (1h): Constant predictor detected
- ⚠️ mistral/pixtral-12b-2409 (4h): Constant predictor detected
- ⚠️ mistral/pixtral-12b-2409 (24h): Constant predictor detected

## Failure Audit

*Failed rounds are excluded from scoring.*

**Aggregate:**
- Total model calls: 336 (28 models × 12 rounds)
- Failed model calls: 50 (14.9%)
- Total horizon predictions: 1344 (28 models × 12 rounds × 4 horizons)
- Failed horizon predictions: 200 (14.9%)

**Per-Model Breakdown:**

| Model | Calls Failed/Total | Horizons Failed | Transport | Timeout | Parse | Schema |
|-------|--------------------|--------------------|-----------|---------|-------|--------|
| anthropic/claude-haiku-4-5 | 1/12 | 4 | 0 | 0 | 0 | 0 |
| anthropic/claude-sonnet-4-5 | 0/12 | 0 | 0 | 0 | 0 | 0 |
| anthropic/claude-opus-4-5 | 0/12 | 0 | 0 | 0 | 0 | 0 |
| anthropic/claude-3-5-sonnet-20241022 | 0/12 | 0 | 0 | 0 | 0 | 0 |
| anthropic/claude-3-5-haiku-latest | 0/12 | 0 | 0 | 0 | 0 | 0 |
| anthropic/claude-3-7-sonnet-latest | 0/12 | 0 | 0 | 0 | 0 | 0 |
| openai/gpt-4o | 10/12 | 40 | 0 | 0 | 0 | 0 |
| openai/gpt-4o-mini | 4/12 | 16 | 0 | 0 | 0 | 0 |
| openai/gpt-4.1 | 0/12 | 0 | 0 | 0 | 0 | 0 |
| openai/gpt-4.1-mini | 1/12 | 4 | 0 | 0 | 0 | 0 |
| openai/gpt-5 | 10/12 | 40 | 0 | 0 | 0 | 0 |
| openai/gpt-5-mini | 4/12 | 16 | 0 | 0 | 0 | 0 |
| openai/gpt-5-nano | 4/12 | 16 | 0 | 0 | 0 | 0 |
| openai/gpt-5.2 | 0/12 | 0 | 0 | 0 | 0 | 0 |
| google/gemini-2.0-flash | 0/12 | 0 | 0 | 0 | 0 | 0 |
| google/gemini-2.5-flash | 0/12 | 0 | 0 | 0 | 0 | 0 |
| google/gemini-2.5-flash-lite | 0/12 | 0 | 0 | 0 | 0 | 0 |
| google/gemini-2.5-pro | 0/12 | 0 | 0 | 0 | 0 | 0 |
| google/gemini-3-pro-preview | 0/12 | 0 | 0 | 0 | 0 | 0 |
| xai/grok-2-vision | 0/12 | 0 | 0 | 0 | 0 | 0 |
| xai/grok-4-fast-non-reasoning | 0/12 | 0 | 0 | 0 | 0 | 0 |
| xai/grok-4.1-fast-reasoning | 0/12 | 0 | 0 | 0 | 0 | 0 |
| xai/grok-4 | 0/12 | 0 | 0 | 0 | 0 | 0 |
| mistral/pixtral-large-latest | 1/12 | 4 | 0 | 0 | 0 | 0 |
| mistral/pixtral-12b-2409 | 11/12 | 44 | 0 | 0 | 0 | 0 |
| mistral/ministral-3b-latest | 4/12 | 16 | 0 | 0 | 0 | 0 |
| mistral/ministral-8b-latest | 0/12 | 0 | 0 | 0 | 0 | 0 |
| perplexity/sonar-pro | 0/12 | 0 | 0 | 0 | 0 | 0 |

## Summary

- **Active Models:** 15
- **Eliminated:** 13
- **Models with Failures:** 10

## Arena Results by Horizon

### 15m Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | mistral/pixtral-12b-2409 | 1.00 | 🟢0.22 | 0.00 | 0.000 |
| 🥈 | openai/gpt-5 | 0.93 | 🟢0.29 | 0.00 | 0.000 |
| 🥉 | openai/gpt-4o | 0.90 | 🟢0.33 | 0.00 | 0.000 |
| 4 | google/gemini-2.0-flash | 0.50 | 🟡0.52 | 0.33 | 0.008 |
| 5 | openai/gpt-5.2 | 0.44 | 🟡0.53 | 0.47 | 0.004 |
| 6 | anthropic/claude-sonnet-4-5 | 0.33 | 🟡0.58 | 0.51 | 0.010 |
| 7 | google/gemini-2.5-flash-lite | 0.29 | 🟡0.62 | 0.55 | 0.007 |
| 8 | anthropic/claude-3-5-sonnet-20241022 | 0.28 | 🟡0.59 | 0.30 | 0.046 |

### 1h Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | openai/gpt-4o | 1.00 | 🟢0.43 | 0.00 | 0.000 |
| 🥈 | openai/gpt-5 | 0.90 | 🟢0.49 | 0.00 | 0.000 |
| 🥉 | anthropic/claude-haiku-4-5 | 0.06 | 🟡0.70 | 0.61 | 0.008 |
| 4 | openai/gpt-5.2 | 0.05 | 🟡0.72 | 0.64 | 0.003 |
| 5 | anthropic/claude-sonnet-4-5 | 0.00 | 🟡0.78 | 0.72 | 0.004 |

### 4h Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | openai/gpt-4o | 0.50 | 🟡0.64 | 0.00 | 0.000 |

### 24h Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | openai/gpt-4o | 0.70 | 🟡0.75 | 0.00 | 0.000 |
| 🥈 | openai/gpt-5.2 | 0.64 | 🟡0.70 | 0.52 | 0.010 |
| 🥉 | anthropic/claude-sonnet-4-5 | 0.33 | 🟡0.73 | 0.45 | 0.035 |
| 4 | anthropic/claude-haiku-4-5 | 0.30 | 🟡0.75 | 0.40 | 0.027 |
| 5 | xai/grok-4-fast-non-reasoning | 0.18 | 🟡0.78 | 0.69 | 0.004 |
| 6 | anthropic/claude-3-7-sonnet-latest | 0.00 | 🔴0.80 | 0.51 | 0.040 |

## Cross-Horizon Strength

*Models appearing in multiple horizon arenas demonstrate consistent performance.*

| Model | Arenas | Horizons | Avg Rank |
|-------|--------|----------|----------|
| ⭐ openai/gpt-4o | 4/4 | 15m, 1h, 4h, 24h | 1.5 |
| openai/gpt-5.2 | 3/4 | 15m, 1h, 24h | 3.7 |
| anthropic/claude-sonnet-4-5 | 3/4 | 15m, 1h, 24h | 4.7 |
| openai/gpt-5 | 2/4 | 15m, 1h | 2.0 |
| anthropic/claude-haiku-4-5 | 2/4 | 1h, 24h | 3.5 |

**Legend:** ⭐ = Top performer across all horizons

## Final Standings (Survivors)

| Rank | Model | Status | Rnds | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|------|-------|--------|------|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| 🥇 | openai/gpt-4o | ✅ Active | 2 | 🟢0.327 | 🟢0.434 | 🟡0.636 | 🟡0.746 | 🟡0.536 | 100.0 | 0.364 | 0.321 | 0.50 | **0.8312** |
| 🥈 | openai/gpt-5 | ✅ Active | 2 | 🟢0.295 | 🟢0.490 | 🔴0.905 | 🔴0.916 | 🟡0.651 | 95.8 | 0.330 | 0.279 | 0.50 | **0.8280** |
| 🥉 | openai/gpt-5.2 | ✅ Active | 12 | 🟡0.530 | 🟡0.725 | 🔴0.817 | 🟡0.696 | 🟡0.692 | 91.7 | 0.322 | 0.310 | 0.50 | **0.8063** |
| 4 | anthropic/claude-sonnet-4-5 | ✅ Active | 12 | 🟡0.584 | 🟡0.776 | 🟡0.738 | 🟡0.730 | 🟡0.707 | 87.5 | 0.367 | 0.349 | 0.50 | **0.7752** |
| 5 | anthropic/claude-haiku-4-5 | ✅ Active | 11 | 🟡0.558 | 🟡0.698 | 🔴0.958 | 🟡0.749 | 🟡0.741 | 83.3 | 0.275 | 0.433 | 0.50 | **0.7555** |
| 6 | anthropic/claude-3-5-sonnet-20241022 | ✅ Active | 12 | 🟡0.593 | 🟡0.774 | 🟡0.791 | 🔴0.821 | 🟡0.745 | 79.2 | 0.223 | 0.566 | 0.50 | **0.7200** |
| 7 | google/gemini-2.5-flash-lite | ✅ Active | 12 | 🟡0.617 | 🔴0.833 | 🔴0.892 | 🔴0.822 | 🟡0.791 | 70.8 | 0.106 | 0.675 | 0.50 | **0.6823** |
| 8 | google/gemini-2.0-flash | ✅ Active | 12 | 🟡0.521 | 🔴0.805 | 🔴1.022 | 🔴1.091 | 🔴0.859 | 62.5 | 0.312 | 0.406 | 0.50 | **0.6720** |
| 9 | xai/grok-4-fast-non-reasoning | ✅ Active | 12 | 🟡0.722 | 🔴1.010 | 🔴0.980 | 🟡0.779 | 🔴0.873 | 54.2 | 0.204 | 0.538 | 0.50 | **0.6284** |
| 10 | anthropic/claude-3-5-haiku-latest | ✅ Active | 12 | 🟡0.612 | 🔴0.933 | 🔴1.098 | 🔴0.959 | 🔴0.900 | 50.0 | 0.246 | 0.558 | 0.50 | **0.6014** |
| 11 | anthropic/claude-3-7-sonnet-latest | ✅ Active | 12 | 🟡0.752 | 🔴1.062 | 🔴0.986 | 🔴0.803 | 🔴0.901 | 45.8 | 0.289 | 0.531 | 0.50 | **0.5837** |
| 12 | google/gemini-2.5-pro | ✅ Active | 12 | 🟡0.765 | 🔴0.860 | 🔴1.186 | 🔴1.460 | 🔴1.068 | 37.5 | 0.069 | 0.940 | 0.50 | **0.5016** |
| 13 | openai/gpt-4.1 | ✅ Active | 12 | 🟡0.747 | 🔴0.884 | 🔴1.406 | 🔴1.530 | 🔴1.142 | 20.8 | 0.383 | 0.588 | 0.50 | **0.4582** |
| 14 | openai/gpt-4.1-mini | ✅ Active | 11 | 🟡0.740 | 🔴1.219 | 🔴1.794 | 🔴2.167 | 🔴1.480 | 8.3 | 0.247 | 0.843 | 0.50 | **0.3776** |
| 15 | mistral/pixtral-12b-2409 | ✅ Active | 1 | 🟢0.223 | 🔴1.897 | 🔴2.303 | 🔴2.996 | 🔴1.855 | 4.2 | 1.474 | 1.021 | 0.50 | **0.1455** |

## All Models (Research Reference)

*Includes eliminated models for comparative analysis. Rankings are by raw composite score, not tournament outcome.*

| Rank | Model | Status | Rnds | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|------|-------|--------|------|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| 🥇 | openai/gpt-4o | ✅ Active | 2 | 🟢0.327 | 🟢0.434 | 🟡0.636 | 🟡0.746 | 🟡0.536 | 100.0 | 0.364 | 0.321 | 0.50 | **0.8312** |
| 🥈 | openai/gpt-5 | ✅ Active | 2 | 🟢0.295 | 🟢0.490 | 🔴0.905 | 🔴0.916 | 🟡0.651 | 95.8 | 0.330 | 0.279 | 0.50 | **0.8280** |
| 🥉 | openai/gpt-5.2 | ✅ Active | 12 | 🟡0.530 | 🟡0.725 | 🔴0.817 | 🟡0.696 | 🟡0.692 | 91.7 | 0.322 | 0.310 | 0.50 | **0.8063** |
| 4 | anthropic/claude-sonnet-4-5 | ✅ Active | 12 | 🟡0.584 | 🟡0.776 | 🟡0.738 | 🟡0.730 | 🟡0.707 | 87.5 | 0.367 | 0.349 | 0.50 | **0.7752** |
| 5 | anthropic/claude-haiku-4-5 | ✅ Active | 11 | 🟡0.558 | 🟡0.698 | 🔴0.958 | 🟡0.749 | 🟡0.741 | 83.3 | 0.275 | 0.433 | 0.50 | **0.7555** |
| 6 | anthropic/claude-opus-4-5 | ❌ P2 | 12 | 🟢0.489 | 🟡0.781 | 🔴0.931 | 🔴0.803 | 🟡0.751 | 75.0 | 0.183 | 0.427 | 0.50 | **0.7371** |
| 7 | anthropic/claude-3-5-sonnet-20241022 | ✅ Active | 12 | 🟡0.593 | 🟡0.774 | 🟡0.791 | 🔴0.821 | 🟡0.745 | 79.2 | 0.223 | 0.566 | 0.50 | **0.7200** |
| 8 | google/gemini-2.5-flash-lite | ✅ Active | 12 | 🟡0.617 | 🔴0.833 | 🔴0.892 | 🔴0.822 | 🟡0.791 | 70.8 | 0.106 | 0.675 | 0.50 | **0.6823** |
| 9 | google/gemini-2.0-flash | ✅ Active | 12 | 🟡0.521 | 🔴0.805 | 🔴1.022 | 🔴1.091 | 🔴0.859 | 62.5 | 0.312 | 0.406 | 0.50 | **0.6720** |
| 10 | xai/grok-4.1-fast-reasoning | ❌ P2 | 12 | 🟡0.720 | 🔴0.955 | 🔴0.913 | 🔴0.811 | 🔴0.849 | 66.7 | 0.136 | 0.641 | 0.50 | **0.6680** |
| 11 | xai/grok-2-vision | ❌ P2 | 12 | 🟡0.599 | 🟡0.764 | 🔴1.139 | 🔴0.937 | 🔴0.860 | 58.3 | 0.224 | 0.556 | 0.50 | **0.6385** |
| 12 | xai/grok-4-fast-non-reasoning | ✅ Active | 12 | 🟡0.722 | 🔴1.010 | 🔴0.980 | 🟡0.779 | 🔴0.873 | 54.2 | 0.204 | 0.538 | 0.50 | **0.6284** |
| 13 | anthropic/claude-3-5-haiku-latest | ✅ Active | 12 | 🟡0.612 | 🔴0.933 | 🔴1.098 | 🔴0.959 | 🔴0.900 | 50.0 | 0.246 | 0.558 | 0.50 | **0.6014** |
| 14 | anthropic/claude-3-7-sonnet-latest | ✅ Active | 12 | 🟡0.752 | 🔴1.062 | 🔴0.986 | 🔴0.803 | 🔴0.901 | 45.8 | 0.289 | 0.531 | 0.50 | **0.5837** |
| 15 | google/gemini-3-pro-preview | ❌ P0 | 4 | 🟢0.051 | 🔴1.117 | 🔴1.554 | 🔴1.088 | 🔴0.953 | 41.7 | 0.051 | 0.745 | 0.50 | **0.5600** |
| 16 | google/gemini-2.5-pro | ✅ Active | 12 | 🟡0.765 | 🔴0.860 | 🔴1.186 | 🔴1.460 | 🔴1.068 | 37.5 | 0.069 | 0.940 | 0.50 | **0.5016** |
| 17 | perplexity/sonar-pro | ❌ P1 | 8 | 🔴0.943 | 🔴1.116 | 🔴1.328 | 🔴1.130 | 🔴1.129 | 25.0 | 0.292 | 0.542 | 0.50 | **0.4977** |
| 18 | mistral/pixtral-large-latest | ❌ P2 | 11 | 🟡0.799 | 🔴1.073 | 🔴1.134 | 🔴1.313 | 🔴1.080 | 33.3 | 0.247 | 0.789 | 0.50 | **0.4885** |
| 19 | openai/gpt-4.1 | ✅ Active | 12 | 🟡0.747 | 🔴0.884 | 🔴1.406 | 🔴1.530 | 🔴1.142 | 20.8 | 0.383 | 0.588 | 0.50 | **0.4582** |
| 20 | xai/grok-4 | ❌ P0 | 4 | 🔴1.074 | 🔴1.194 | 🔴0.828 | 🔴1.407 | 🔴1.126 | 29.2 | 0.677 | 0.633 | 0.50 | **0.4386** |
| 21 | mistral/ministral-8b-latest | ❌ P1 | 8 | 🟡0.576 | 🔴1.400 | 🔴1.712 | 🔴1.556 | 🔴1.311 | 12.5 | 0.069 | 0.911 | 0.50 | **0.4074** |
| 22 | google/gemini-2.5-flash | ❌ P2 | 12 | 🟡0.638 | 🔴1.191 | 🔴1.208 | 🔴1.747 | 🔴1.196 | 16.7 | 0.124 | 1.068 | 0.50 | **0.3980** |
| 23 | openai/gpt-4.1-mini | ✅ Active | 11 | 🟡0.740 | 🔴1.219 | 🔴1.794 | 🔴2.167 | 🔴1.480 | 8.3 | 0.247 | 0.843 | 0.50 | **0.3776** |
| 24 | mistral/pixtral-12b-2409 | ✅ Active | 1 | 🟢0.223 | 🔴1.897 | 🔴2.303 | 🔴2.996 | 🔴1.855 | 4.2 | 1.474 | 1.021 | 0.50 | **0.1455** |

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
| 1 | google/gemini-3-pro-preview | 🟢0.0513 | ❌ P0 |
| 2 | mistral/pixtral-12b-2409 | 🟢0.2231 | ✅ Active |
| 3 | openai/gpt-5 | 🟢0.2949 | ✅ Active |
| 4 | openai/gpt-4o | 🟢0.3270 | ✅ Active |
| 5 | anthropic/claude-opus-4-5 | 🟢0.4893 | ❌ P2 |
| 6 | google/gemini-2.0-flash | 🟡0.5206 | ✅ Active |
| 7 | openai/gpt-5.2 | 🟡0.5296 | ✅ Active |
| 8 | anthropic/claude-haiku-4-5 | 🟡0.5578 | ✅ Active |
| 9 | mistral/ministral-8b-latest | 🟡0.5759 | ❌ P1 |
| 10 | anthropic/claude-sonnet-4-5 | 🟡0.5839 | ✅ Active |

### 1h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | openai/gpt-4o | 🟢0.4338 | ✅ Active |
| 2 | openai/gpt-5 | 🟢0.4901 | ✅ Active |
| 3 | anthropic/claude-haiku-4-5 | 🟡0.6979 | ✅ Active |
| 4 | openai/gpt-5.2 | 🟡0.7245 | ✅ Active |
| 5 | xai/grok-2-vision | 🟡0.7639 | ❌ P2 |
| 6 | anthropic/claude-3-5-sonnet-20241022 | 🟡0.7742 | ✅ Active |
| 7 | anthropic/claude-sonnet-4-5 | 🟡0.7759 | ✅ Active |
| 8 | anthropic/claude-opus-4-5 | 🟡0.7814 | ❌ P2 |
| 9 | google/gemini-2.0-flash | 🔴0.8047 | ✅ Active |
| 10 | google/gemini-2.5-flash-lite | 🔴0.8334 | ✅ Active |

### 4h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | openai/gpt-4o | 🟡0.6365 | ✅ Active |
| 2 | anthropic/claude-sonnet-4-5 | 🟡0.7383 | ✅ Active |
| 3 | anthropic/claude-3-5-sonnet-20241022 | 🟡0.7908 | ✅ Active |
| 4 | openai/gpt-5.2 | 🔴0.8167 | ✅ Active |
| 5 | xai/grok-4 | 🔴0.8283 | ❌ P0 |
| 6 | google/gemini-2.5-flash-lite | 🔴0.8923 | ✅ Active |
| 7 | openai/gpt-5 | 🔴0.9046 | ✅ Active |
| 8 | xai/grok-4.1-fast-reasoning | 🔴0.9127 | ❌ P2 |
| 9 | anthropic/claude-opus-4-5 | 🔴0.9311 | ❌ P2 |
| 10 | anthropic/claude-haiku-4-5 | 🔴0.9580 | ✅ Active |

### 24h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | openai/gpt-5.2 | 🟡0.6955 | ✅ Active |
| 2 | anthropic/claude-sonnet-4-5 | 🟡0.7301 | ✅ Active |
| 3 | openai/gpt-4o | 🟡0.7458 | ✅ Active |
| 4 | anthropic/claude-haiku-4-5 | 🟡0.7491 | ✅ Active |
| 5 | xai/grok-4-fast-non-reasoning | 🟡0.7794 | ✅ Active |
| 6 | anthropic/claude-3-7-sonnet-latest | 🔴0.8025 | ✅ Active |
| 7 | anthropic/claude-opus-4-5 | 🔴0.8029 | ❌ P2 |
| 8 | xai/grok-4.1-fast-reasoning | 🔴0.8111 | ❌ P2 |
| 9 | anthropic/claude-3-5-sonnet-20241022 | 🔴0.8212 | ✅ Active |
| 10 | google/gemini-2.5-flash-lite | 🔴0.8221 | ✅ Active |

## Elimination Audit

*Detailed per-horizon elimination reasons for each eliminated model.*

### anthropic/claude-opus-4-5 (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 0.489 |
| 1h | 1 | bottom 30% percentile | 0.781 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 0.931 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 0.803 |

### openai/gpt-4o-mini (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 0 | Phase 0: Failed sanity check on 15m | 0.000 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 0.000 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 0.000 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 0.000 |

### openai/gpt-5-mini (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 0 | Phase 0: Failed sanity check on 15m | 0.000 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 0.000 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 0.000 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 0.000 |

### openai/gpt-5-nano (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 0 | Phase 0: Failed sanity check on 15m | 0.000 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 0.000 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 0.000 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 0.000 |

### google/gemini-2.5-flash (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 2 | high regret or instability | 0.638 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 1.191 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 1.208 |
| 24h | 1 | bottom 30% percentile | 1.747 |

### google/gemini-3-pro-preview (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 0 | Phase 0: Failed sanity check on 15m | 0.051 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 1.117 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 1.554 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 1.088 |

### xai/grok-2-vision (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 0.599 |
| 1h | 1 | bottom 30% percentile | 0.764 |
| 4h | 1 | bottom 30% percentile | 1.139 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 0.937 |

### xai/grok-4.1-fast-reasoning (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 0.720 |
| 1h | 1 | bottom 30% percentile | 0.955 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 0.913 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 0.811 |

### xai/grok-4 (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 0 | Phase 0: Failed sanity check on 15m | 1.074 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 1.194 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 0.828 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 1.407 |

### mistral/pixtral-large-latest (Eliminated Phase 2)

**Model-level reason:** no qualified horizons remaining

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 2 | high regret or instability | 0.799 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 1.073 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 1.134 |
| 24h | 1 | bottom 30% percentile | 1.313 |

### mistral/ministral-3b-latest (Eliminated Phase 0)

**Model-level reason:** Failed sanity check on all horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 0 | Phase 0: Failed sanity check on 15m | 0.000 |
| 1h | 0 | Phase 0: Failed sanity check on 1h | 0.000 |
| 4h | 0 | Phase 0: Failed sanity check on 4h | 0.000 |
| 24h | 0 | Phase 0: Failed sanity check on 24h | 0.000 |

### mistral/ministral-8b-latest (Eliminated Phase 1)

**Model-level reason:** qualifies for 0 horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 0.576 |
| 1h | 1 | bottom 30% percentile | 1.400 |
| 4h | 1 | bottom 30% percentile | 1.712 |
| 24h | 1 | bottom 30% percentile | 1.556 |

### perplexity/sonar-pro (Eliminated Phase 1)

**Model-level reason:** qualifies for 0 horizons

| Horizon | Phase | Reason | Mean LL |
|---------|-------|--------|---------|
| 15m | 1 | bottom 30% percentile | 0.943 |
| 1h | 1 | bottom 30% percentile | 1.116 |
| 4h | 1 | bottom 30% percentile | 1.328 |
| 24h | 1 | bottom 30% percentile | 1.130 |

## Model Failures

*Note: Failed rounds (API errors, malformed responses) are excluded from scoring. The `Rnds` column shows successful rounds used in metric calculation.*

| Model | Failed Rounds |
|-------|---------------|
| anthropic/claude-haiku-4-5 | 4 |
| openai/gpt-4o | 2, 3, 4, 5, 6, 7, 9, 10, 11, 12 |
| openai/gpt-4o-mini | 1, 2, 3, 4 |
| openai/gpt-4.1-mini | 3 |
| openai/gpt-5 | 1, 4, 5, 6, 7, 8, 9, 10, 11, 12 |
| openai/gpt-5-mini | 1, 2, 3, 4 |
| openai/gpt-5-nano | 1, 2, 3, 4 |
| mistral/pixtral-large-latest | 1 |
| mistral/pixtral-12b-2409 | 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12 |
| mistral/ministral-3b-latest | 1, 2, 3, 4 |

---
*Auto-generated by agent_006 benchmark*