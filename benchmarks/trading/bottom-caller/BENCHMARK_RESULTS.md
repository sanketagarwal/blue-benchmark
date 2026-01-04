# agent_006 Benchmark Results

**Symbol:** COINBASE_SPOT_BTC_USD
**Start Time:** 2025-12-26T17:00:00.000Z
**Progress:** Round 12/12 (Phase 3)
**Last Updated:** 2026-01-04T01:32:42.174Z

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

| Horizon | N | True | False | pTrue | Random LL | Prevalence LL |
|---------|---|------|-------|-------|-----------|---------------|
| 15m | 12 | 12 | 0 | 1.000 | 0.693 | 9.99e-16 |
| 1h | 12 | 12 | 0 | 1.000 | 0.693 | 9.99e-16 |
| 4h | 12 | 12 | 0 | 1.000 | 0.693 | 9.99e-16 |
| 24h | 12 | 12 | 0 | 1.000 | 0.693 | 9.99e-16 |

**Interpretation:**
- *pTrue*: Label prevalence. If extremely skewed (>0.9 or <0.1), models may achieve good log loss without skill.
- *Random LL*: Baseline log loss for p=0.5 predictor (always 0.693).
- *Prevalence LL*: Baseline log loss for optimal constant predictor. Models must beat this to show skill.

## Prediction Diversity

*Variety of predictions per model. Low diversity suggests caching or degenerate behavior.*

### anthropic/claude-sonnet-4-5

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 3 | 0.680 | 0.750 | 0.020 | 1.00 |
| 1h | 12 | 4 | 0.620 | 0.720 | 0.031 | 1.00 |
| 4h | 12 | 8 | 0.290 | 0.680 | 0.146 | 0.42 |
| 24h | 12 | 7 | 0.220 | 0.380 | 0.055 | 0.00 |

### anthropic/claude-opus-4-5

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.720 | 0.850 | 0.046 | 1.00 |
| 1h | 12 | 4 | 0.650 | 0.750 | 0.037 | 1.00 |
| 4h | 12 | 4 | 0.400 | 0.650 | 0.104 | 0.67 |
| 24h | 12 | 6 | 0.350 | 0.620 | 0.065 | 0.08 |

### anthropic/claude-3-5-sonnet-20241022

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 3 | 0.650 | 0.750 | 0.045 | 1.00 |
| 1h | 12 | 5 | 0.200 | 0.650 | 0.182 | 0.42 |
| 4h | 12 | 5 | 0.150 | 0.400 | 0.067 | 0.00 |
| 24h | 12 | 4 | 0.100 | 0.250 | 0.046 | 0.00 |

### anthropic/claude-3-5-haiku-latest

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 4 | 0.350 | 0.750 | 0.110 | 0.92 |
| 1h | 12 | 5 | 0.300 | 0.800 | 0.123 | 0.92 |
| 4h | 12 | 5 | 0.600 | 0.800 | 0.072 | 1.00 |
| 24h | 12 | 7 | 0.400 | 0.800 | 0.106 | 0.83 |

### anthropic/claude-3-7-sonnet-latest

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 4 | 0.200 | 0.750 | 0.230 | 0.50 |
| 1h | 12 | 3 | 0.150 | 0.250 | 0.035 | 0.00 |
| 4h | 12 | 3 | 0.150 | 0.250 | 0.041 | 0.00 |
| 24h | 12 | 3 | 0.100 | 0.600 | 0.212 | 0.50 |

### openai/gpt-4.1

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 8 | 0.350 | 0.900 | 0.146 | 0.92 |
| 1h | 12 | 5 | 0.400 | 0.800 | 0.129 | 0.75 |
| 4h | 12 | 7 | 0.300 | 0.700 | 0.132 | 0.50 |
| 24h | 12 | 6 | 0.200 | 0.700 | 0.130 | 0.08 |

### openai/gpt-5.2

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 8 | 0.620 | 0.930 | 0.092 | 1.00 |
| 1h | 12 | 9 | 0.400 | 0.800 | 0.108 | 0.75 |
| 4h | 12 | 6 | 0.380 | 0.740 | 0.109 | 0.33 |
| 24h | 12 | 10 | 0.370 | 0.800 | 0.163 | 0.58 |

### google/gemini-2.0-flash

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 2 | 0.300 | 0.700 | 0.149 | 0.83 |
| 1h | 12 | 3 | 0.300 | 0.600 | 0.122 | 0.25 |
| 4h | 12 | 3 | 0.300 | 0.600 | 0.083 | 0.08 |
| 24h | 12 | 4 | 0.200 | 0.600 | 0.111 | 0.08 |

### google/gemini-2.5-flash

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 7 | 0.300 | 0.900 | 0.210 | 0.83 |
| 1h | 12 | 7 | 0.250 | 0.850 | 0.242 | 0.67 |
| 4h | 12 | 5 | 0.100 | 0.300 | 0.066 | 0.00 |
| 24h | 12 | 5 | 0.150 | 0.700 | 0.217 | 0.33 |

### google/gemini-2.5-flash-lite

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 4 | 0.250 | 0.850 | 0.224 | 0.75 |
| 1h | 12 | 4 | 0.150 | 0.800 | 0.263 | 0.25 |
| 4h | 12 | 6 | 0.100 | 0.700 | 0.188 | 0.13 |
| 24h | 12 | 7 | 0.100 | 0.650 | 0.205 | 0.25 |

### google/gemini-2.5-pro

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 7 | 0.250 | 0.950 | 0.201 | 0.83 |
| 1h | 12 | 7 | 0.150 | 0.850 | 0.265 | 0.33 |
| 4h | 12 | 6 | 0.100 | 0.800 | 0.276 | 0.25 |
| 24h | 12 | 7 | 0.150 | 0.900 | 0.222 | 0.75 |

### google/gemini-3-pro-preview

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.400 | 0.950 | 0.192 | 0.83 |
| 1h | 12 | 6 | 0.250 | 0.900 | 0.215 | 0.83 |
| 4h | 12 | 7 | 0.200 | 0.850 | 0.194 | 0.75 |
| 24h | 12 | 7 | 0.300 | 0.900 | 0.157 | 0.92 |

### xai/grok-2-vision

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 4 | 0.600 | 0.800 | 0.059 | 1.00 |
| 1h | 12 | 5 | 0.600 | 0.850 | 0.073 | 1.00 |
| 4h | 12 | 7 | 0.400 | 0.900 | 0.137 | 0.83 |
| 24h | 12 | 6 | 0.500 | 0.950 | 0.130 | 0.83 |

### xai/grok-4-fast-non-reasoning

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 5 | 0.350 | 0.850 | 0.130 | 0.92 |
| 1h | 12 | 5 | 0.300 | 0.800 | 0.134 | 0.92 |
| 4h | 12 | 7 | 0.250 | 0.850 | 0.173 | 0.83 |
| 24h | 12 | 7 | 0.150 | 0.850 | 0.208 | 0.33 |

### xai/grok-4.1-fast-reasoning

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.650 | 0.920 | 0.079 | 1.00 |
| 1h | 12 | 8 | 0.350 | 0.880 | 0.139 | 0.92 |
| 4h | 12 | 7 | 0.300 | 0.820 | 0.208 | 0.58 |
| 24h | 12 | 8 | 0.100 | 0.850 | 0.242 | 0.50 |

### xai/grok-4

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.600 | 0.900 | 0.109 | 1.00 |
| 1h | 12 | 7 | 0.300 | 0.850 | 0.200 | 0.67 |
| 4h | 12 | 7 | 0.250 | 0.850 | 0.242 | 0.58 |
| 24h | 12 | 5 | 0.600 | 0.950 | 0.120 | 1.00 |

### mistral/pixtral-large-latest

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 4 | 0.150 | 0.750 | 0.242 | 0.50 |
| 1h | 12 | 4 | 0.200 | 0.700 | 0.216 | 0.50 |
| 4h | 12 | 4 | 0.200 | 0.650 | 0.202 | 0.50 |
| 24h | 12 | 3 | 0.100 | 0.600 | 0.206 | 0.25 |

### mistral/ministral-3b-latest

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m ⚠️ | 12 | 1 | 0.850 | 0.850 | 0.000 | 1.00 |
| 1h ⚠️ | 12 | 1 | 0.900 | 0.900 | 0.000 | 1.00 |
| 4h ⚠️ | 12 | 1 | 0.950 | 0.950 | 0.000 | 1.00 |
| 24h ⚠️ | 12 | 1 | 0.200 | 0.200 | 0.000 | 0.00 |

### mistral/ministral-8b-latest

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 4 | 0.750 | 0.950 | 0.057 | 1.00 |
| 1h | 12 | 5 | 0.850 | 0.980 | 0.035 | 1.00 |
| 4h | 12 | 6 | 0.850 | 0.990 | 0.046 | 1.00 |
| 24h | 12 | 5 | 0.750 | 1.000 | 0.075 | 1.00 |

### perplexity/sonar-pro

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 4 | 0.650 | 0.850 | 0.066 | 1.00 |
| 1h | 12 | 4 | 0.650 | 0.800 | 0.048 | 1.00 |
| 4h | 12 | 5 | 0.650 | 0.850 | 0.062 | 1.00 |
| 24h | 12 | 7 | 0.200 | 0.850 | 0.210 | 0.50 |

### anthropic/claude-haiku-4-5

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 2 | 0.720 | 0.750 | 0.012 | 1.00 |
| 1h | 12 | 5 | 0.220 | 0.680 | 0.165 | 0.20 |
| 4h | 12 | 8 | 0.220 | 0.660 | 0.124 | 0.10 |
| 24h | 12 | 7 | 0.180 | 0.780 | 0.160 | 0.10 |

### openai/gpt-4.1-mini

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 6 | 0.300 | 0.900 | 0.183 | 0.86 |
| 1h | 12 | 5 | 0.150 | 0.800 | 0.205 | 0.86 |
| 4h | 12 | 5 | 0.200 | 0.800 | 0.224 | 0.71 |
| 24h | 12 | 5 | 0.100 | 0.800 | 0.272 | 0.57 |

### openai/gpt-5-mini

| Horizon | N | Unique P | pMin | pMax | pStdDev | NoNewLow Rate |
|---------|---|----------|------|------|---------|---------------|
| 15m | 12 | 2 | 0.800 | 0.850 | 0.024 | 1.00 |
| 1h | 12 | 3 | 0.300 | 0.700 | 0.178 | 0.67 |
| 4h | 12 | 2 | 0.250 | 0.300 | 0.024 | 0.00 |
| 24h | 12 | 3 | 0.650 | 0.900 | 0.103 | 1.00 |

**Warnings:**
- ⚠️ mistral/ministral-3b-latest (15m): Constant predictor detected
- ⚠️ mistral/ministral-3b-latest (1h): Constant predictor detected
- ⚠️ mistral/ministral-3b-latest (4h): Constant predictor detected
- ⚠️ mistral/ministral-3b-latest (24h): Constant predictor detected

## Parse Diagnostics

*Parsing and validation issues encountered during the run.*

| Model | Success | Parse Fail | Schema Fail | Missing Horizons |
|-------|---------|------------|-------------|------------------|
| anthropic/claude-haiku-4-5 | 10 | 2 | 0 | 0 |
| openai/gpt-4o | 0 | 4 | 0 | 0 |
| openai/gpt-4o-mini | 0 | 4 | 0 | 0 |
| openai/gpt-4.1-mini | 7 | 5 | 0 | 0 |
| openai/gpt-5 | 0 | 4 | 0 | 0 |
| openai/gpt-5-mini | 3 | 9 | 0 | 0 |
| openai/gpt-5-nano | 0 | 4 | 0 | 0 |
| mistral/pixtral-12b-2409 | 0 | 4 | 0 | 0 |
| mistral/ministral-3b-latest | 1 | 11 | 0 | 0 |
| mistral/ministral-8b-latest | 11 | 1 | 0 | 0 |

## Summary

- **Active Models:** 16
- **Eliminated:** 12
- **Models with Failures:** 10

## Arena Results by Horizon

### 15m Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | mistral/ministral-3b-latest | 0.85 | 🟢0.16 | 0.00 | 0.000 |
| 🥈 | openai/gpt-5-mini | 0.81 | 🟢0.18 | 0.00 | 0.000 |
| 🥉 | mistral/ministral-8b-latest | 0.76 | 🟢0.09 | 0.07 | 0.000 |
| 4 | xai/grok-4.1-fast-reasoning | 0.59 | 🟢0.17 | 0.16 | 0.000 |
| 5 | perplexity/sonar-pro | 0.40 | 🟢0.25 | 0.25 | 0.000 |
| 6 | anthropic/claude-opus-4-5 | 0.22 | 🟢0.26 | 0.23 | 0.000 |
| 7 | anthropic/claude-haiku-4-5 | 0.22 | 🟢0.32 | 0.31 | 0.000 |
| 8 | xai/grok-2-vision | 0.21 | 🟢0.27 | 0.23 | 0.001 |

### 1h Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | perplexity/sonar-pro | 0.99 | 🟢0.26 | 0.23 | 0.000 |
| 🥈 | xai/grok-2-vision | 0.82 | 🟢0.30 | 0.28 | 0.000 |
| 🥉 | xai/grok-4.1-fast-reasoning | 0.69 | 🟢0.31 | 0.24 | 0.003 |
| 4 | anthropic/claude-opus-4-5 | 0.61 | 🟢0.36 | 0.34 | 0.000 |
| 5 | xai/grok-4-fast-non-reasoning | 0.51 | 🟢0.37 | 0.28 | 0.005 |
| 6 | anthropic/claude-sonnet-4-5 | 0.48 | 🟢0.40 | 0.38 | 0.000 |
| 7 | anthropic/claude-3-5-haiku-latest | 0.25 | 🟢0.42 | 0.41 | 0.002 |
| 8 | openai/gpt-4.1 | 0.04 | 🟡0.52 | 0.40 | 0.003 |

### 4h Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | mistral/ministral-8b-latest | 0.98 | 🟢0.12 | 0.09 | 0.001 |
| 🥈 | perplexity/sonar-pro | 0.74 | 🟢0.27 | 0.23 | 0.000 |
| 🥉 | xai/grok-2-vision | 0.45 | 🟢0.36 | 0.29 | 0.002 |
| 4 | xai/grok-4-fast-non-reasoning | 0.34 | 🟢0.44 | 0.30 | 0.002 |
| 5 | anthropic/claude-3-5-haiku-latest | 0.34 | 🟢0.40 | 0.34 | 0.003 |
| 6 | anthropic/claude-opus-4-5 | 0.09 | 🟡0.60 | 0.52 | 0.002 |
| 7 | openai/gpt-4.1 | 0.00 | 🟡0.75 | 0.61 | 0.003 |

### 24h Arena Winners

| Rank | Model | Score | Log Loss | Best Window | Stability |
|------|-------|-------|----------|-------------|-----------|
| 🥇 | openai/gpt-5-mini | 0.88 | 🟢0.25 | 0.00 | 0.000 |
| 🥈 | mistral/ministral-8b-latest | 0.86 | 🟢0.16 | 0.13 | 0.001 |
| 🥉 | xai/grok-4 | 0.67 | 🟢0.20 | 0.12 | 0.003 |
| 4 | google/gemini-3-pro-preview | 0.50 | 🟢0.30 | 0.20 | 0.004 |
| 5 | xai/grok-2-vision | 0.37 | 🟢0.42 | 0.42 | 0.000 |
| 6 | anthropic/claude-3-5-haiku-latest | 0.16 | 🟡0.54 | 0.52 | 0.001 |
| 7 | openai/gpt-5.2 | 0.06 | 🟡0.59 | 0.49 | 0.002 |

## Cross-Horizon Strength

*Models appearing in multiple horizon arenas demonstrate consistent performance.*

| Model | Arenas | Horizons | Avg Rank |
|-------|--------|----------|----------|
| ⭐ xai/grok-2-vision | 4/4 | 15m, 1h, 4h, 24h | 4.5 |
| mistral/ministral-8b-latest | 3/4 | 15m, 4h, 24h | 2.0 |
| perplexity/sonar-pro | 3/4 | 15m, 1h, 4h | 2.7 |
| anthropic/claude-opus-4-5 | 3/4 | 15m, 1h, 4h | 5.3 |
| anthropic/claude-3-5-haiku-latest | 3/4 | 1h, 4h, 24h | 6.0 |
| openai/gpt-5-mini | 2/4 | 15m, 24h | 1.5 |
| xai/grok-4.1-fast-reasoning | 2/4 | 15m, 1h | 3.5 |
| xai/grok-4-fast-non-reasoning | 2/4 | 1h, 4h | 4.5 |
| openai/gpt-4.1 | 2/4 | 1h, 4h | 7.5 |

**Legend:** ⭐ = Top performer across all horizons

## Full Results (All Models)

| Rank | Model | Status | Rnds | 15m | 1h | 4h | 24h | Mean | %Rank | BestWin | Stabil | TtP | Score |
|------|-------|--------|------|-----|-----|-----|-----|------|-------|---------|--------|-----|-------|
| 🥇 | mistral/ministral-8b-latest | ✅ Active | 11 | 🟢0.090 | 🟢0.081 | 🟢0.118 | 🟢0.161 | 🟢0.113 | 100.0 | 0.048 | 0.070 | 0.50 | **0.9287** |
| 🥈 | xai/grok-2-vision | ✅ Active | 12 | 🟢0.269 | 🟢0.304 | 🟢0.361 | 🟢0.423 | 🟢0.339 | 95.7 | 0.204 | 0.169 | 0.50 | **0.8683** |
| 🥉 | google/gemini-3-pro-preview | ✅ Active | 12 | 🟢0.247 | 🟢0.415 | 🟡0.593 | 🟢0.299 | 🟢0.388 | 91.3 | 0.069 | 0.395 | 0.50 | **0.8258** |
| 4 | anthropic/claude-3-5-haiku-latest | ✅ Active | 12 | 🟢0.375 | 🟢0.424 | 🟢0.399 | 🟡0.541 | 🟢0.435 | 82.6 | 0.245 | 0.203 | 0.50 | **0.8032** |
| 5 | perplexity/sonar-pro | ✅ Active | 12 | 🟢0.253 | 🟢0.262 | 🟢0.274 | 🟡0.793 | 🟢0.396 | 87.0 | 0.204 | 0.332 | 0.50 | **0.8007** |
| 6 | xai/grok-4 | ✅ Active | 12 | 🟢0.339 | 🟡0.587 | 🟡0.638 | 🟢0.204 | 🟢0.442 | 78.3 | 0.106 | 0.375 | 0.50 | **0.7721** |
| 7 | xai/grok-4-fast-non-reasoning | ✅ Active | 12 | 🟢0.338 | 🟢0.372 | 🟢0.435 | 🔴0.858 | 🟡0.501 | 69.6 | 0.227 | 0.400 | 0.50 | **0.7142** |
| 8 | anthropic/claude-opus-4-5 | ✅ Active | 12 | 🟢0.263 | 🟢0.363 | 🟡0.600 | 🔴0.864 | 🟡0.522 | 60.9 | 0.211 | 0.265 | 0.50 | **0.7089** |
| 9 | mistral/ministral-3b-latest | ✅ Active | 1 | 🟢0.163 | 🟢0.105 | 🟢0.051 | 🔴1.609 | 🟢0.482 | 73.9 | 0.106 | 0.652 | 0.50 | **0.6993** |
| 10 | xai/grok-4.1-fast-reasoning | ✅ Active | 12 | 🟢0.166 | 🟢0.314 | 🟡0.627 | 🔴0.945 | 🟡0.513 | 65.2 | 0.117 | 0.507 | 0.50 | **0.6920** |
| 11 | openai/gpt-5.2 | ✅ Active | 12 | 🟢0.385 | 🟡0.588 | 🟡0.766 | 🟡0.585 | 🟡0.581 | 56.5 | 0.235 | 0.254 | 0.50 | **0.6901** |
| 12 | openai/gpt-5-mini | ✅ Active | 3 | 🟢0.183 | 🟡0.664 | 🔴1.326 | 🟢0.253 | 🟡0.606 | 52.2 | 0.183 | 0.499 | 0.50 | **0.6314** |
| 13 | anthropic/claude-sonnet-4-5 | ✅ Active | 12 | 🟢0.331 | 🟢0.399 | 🟡0.791 | 🔴1.219 | 🟡0.685 | 43.5 | 0.301 | 0.399 | 0.50 | **0.5990** |
| 14 | openai/gpt-4.1 | ✅ Active | 12 | 🟢0.366 | 🟡0.523 | 🟡0.748 | 🔴1.186 | 🟡0.705 | 39.1 | 0.205 | 0.414 | 0.50 | **0.5929** |
| 15 | openai/gpt-4.1-mini | ❌ P2 | 7 | 🟢0.375 | 🟡0.559 | 🟡0.739 | 🔴0.982 | 🟡0.664 | 47.8 | 0.208 | 0.620 | 0.50 | **0.5860** |
| 16 | google/gemini-2.5-flash | ❌ P2 | 12 | 🟢0.383 | 🟡0.613 | 🔴1.582 | 🔴1.062 | 🔴0.910 | 34.8 | 0.124 | 0.641 | 0.50 | **0.5423** |
| 17 | google/gemini-2.0-flash | ❌ P2 | 12 | 🟢0.498 | 🔴0.959 | 🔴1.002 | 🔴1.233 | 🔴0.923 | 30.4 | 0.357 | 0.392 | 0.50 | **0.5399** |
| 18 | anthropic/claude-haiku-4-5 | ✅ Active | 10 | 🟢0.320 | 🔴1.114 | 🔴1.228 | 🔴1.208 | 🔴0.968 | 21.7 | 0.301 | 0.489 | 0.50 | **0.4940** |
| 19 | google/gemini-2.5-pro | ❌ P2 | 12 | 🟢0.417 | 🔴1.171 | 🔴1.489 | 🟡0.622 | 🔴0.925 | 26.1 | 0.190 | 0.748 | 0.50 | **0.4763** |
| 20 | anthropic/claude-3-5-sonnet-20241022 | ✅ Active | 12 | 🟢0.371 | 🔴0.964 | 🔴1.388 | 🔴1.707 | 🔴1.108 | 17.4 | 0.334 | 0.580 | 0.50 | **0.4534** |
| 21 | google/gemini-2.5-flash-lite | ❌ P1 | 8 | 🟡0.555 | 🔴1.284 | 🔴1.670 | 🔴1.377 | 🔴1.222 | 8.7 | 0.269 | 0.747 | 0.50 | **0.3950** |
| 22 | mistral/pixtral-large-latest | ❌ P0 | 4 | 🔴0.864 | 🔴0.900 | 🔴0.984 | 🔴1.681 | 🔴1.108 | 13.0 | 0.568 | 0.698 | 0.50 | **0.3775** |
| 23 | anthropic/claude-3-7-sonnet-latest | ❌ P0 | 4 | 🔴0.883 | 🔴1.626 | 🔴1.570 | 🔴1.132 | 🔴1.303 | 4.3 | 0.742 | 0.568 | 0.50 | **0.3424** |

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
| 1 | mistral/ministral-8b-latest | 🟢0.0904 | ✅ Active |
| 2 | mistral/ministral-3b-latest | 🟢0.1625 | ✅ Active |
| 3 | xai/grok-4.1-fast-reasoning | 🟢0.1663 | ✅ Active |
| 4 | openai/gpt-5-mini | 🟢0.1827 | ✅ Active |
| 5 | google/gemini-3-pro-preview | 🟢0.2470 | ✅ Active |
| 6 | perplexity/sonar-pro | 🟢0.2532 | ✅ Active |
| 7 | anthropic/claude-opus-4-5 | 🟢0.2631 | ✅ Active |
| 8 | xai/grok-2-vision | 🟢0.2690 | ✅ Active |
| 9 | anthropic/claude-haiku-4-5 | 🟢0.3203 | ✅ Active |
| 10 | anthropic/claude-sonnet-4-5 | 🟢0.3312 | ✅ Active |

### 1h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | mistral/ministral-8b-latest | 🟢0.0812 | ✅ Active |
| 2 | mistral/ministral-3b-latest | 🟢0.1054 | ✅ Active |
| 3 | perplexity/sonar-pro | 🟢0.2623 | ✅ Active |
| 4 | xai/grok-2-vision | 🟢0.3039 | ✅ Active |
| 5 | xai/grok-4.1-fast-reasoning | 🟢0.3140 | ✅ Active |
| 6 | anthropic/claude-opus-4-5 | 🟢0.3628 | ✅ Active |
| 7 | xai/grok-4-fast-non-reasoning | 🟢0.3721 | ✅ Active |
| 8 | anthropic/claude-sonnet-4-5 | 🟢0.3991 | ✅ Active |
| 9 | google/gemini-3-pro-preview | 🟢0.4147 | ✅ Active |
| 10 | anthropic/claude-3-5-haiku-latest | 🟢0.4240 | ✅ Active |

### 4h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | mistral/ministral-3b-latest | 🟢0.0513 | ✅ Active |
| 2 | mistral/ministral-8b-latest | 🟢0.1178 | ✅ Active |
| 3 | perplexity/sonar-pro | 🟢0.2744 | ✅ Active |
| 4 | xai/grok-2-vision | 🟢0.3612 | ✅ Active |
| 5 | anthropic/claude-3-5-haiku-latest | 🟢0.3986 | ✅ Active |
| 6 | xai/grok-4-fast-non-reasoning | 🟢0.4351 | ✅ Active |
| 7 | google/gemini-3-pro-preview | 🟡0.5934 | ✅ Active |
| 8 | anthropic/claude-opus-4-5 | 🟡0.6004 | ✅ Active |
| 9 | xai/grok-4.1-fast-reasoning | 🟡0.6266 | ✅ Active |
| 10 | xai/grok-4 | 🟡0.6375 | ✅ Active |

### 24h Horizon (Top 10)

| Rank | Model | Log Loss | Status |
|------|-------|----------|--------|
| 1 | mistral/ministral-8b-latest | 🟢0.1609 | ✅ Active |
| 2 | xai/grok-4 | 🟢0.2042 | ✅ Active |
| 3 | openai/gpt-5-mini | 🟢0.2531 | ✅ Active |
| 4 | google/gemini-3-pro-preview | 🟢0.2986 | ✅ Active |
| 5 | xai/grok-2-vision | 🟢0.4229 | ✅ Active |
| 6 | anthropic/claude-3-5-haiku-latest | 🟡0.5411 | ✅ Active |
| 7 | openai/gpt-5.2 | 🟡0.5855 | ✅ Active |
| 8 | google/gemini-2.5-pro | 🟡0.6217 | ❌ P2 |
| 9 | perplexity/sonar-pro | 🟡0.7931 | ✅ Active |
| 10 | xai/grok-4-fast-non-reasoning | 🔴0.8580 | ✅ Active |

## Eliminated Models

| Model | Phase | Reason |
|-------|-------|--------|
| anthropic/claude-3-7-sonnet-latest | 0 | Failed sanity check on all horizons |
| openai/gpt-4o | 0 | Failed sanity check on all horizons |
| openai/gpt-4o-mini | 0 | Failed sanity check on all horizons |
| openai/gpt-4.1-mini | 2 | no qualified horizons remaining |
| openai/gpt-5 | 0 | Failed sanity check on all horizons |
| openai/gpt-5-nano | 0 | Failed sanity check on all horizons |
| google/gemini-2.0-flash | 2 | no qualified horizons remaining |
| google/gemini-2.5-flash | 2 | no qualified horizons remaining |
| google/gemini-2.5-flash-lite | 1 | qualifies for 0 horizons |
| google/gemini-2.5-pro | 2 | no qualified horizons remaining |
| mistral/pixtral-large-latest | 0 | Failed sanity check on all horizons |
| mistral/pixtral-12b-2409 | 0 | Failed sanity check on all horizons |

## Model Failures

*Note: Failed rounds (API errors, malformed responses) are excluded from scoring. The `Rnds` column shows successful rounds used in metric calculation.*

| Model | Failed Rounds |
|-------|---------------|
| anthropic/claude-haiku-4-5 | 1, 8 |
| openai/gpt-4o | 1, 2, 3, 4 |
| openai/gpt-4o-mini | 1, 2, 3, 4 |
| openai/gpt-4.1-mini | 1, 2, 5, 7, 10 |
| openai/gpt-5 | 1, 2, 3, 4 |
| openai/gpt-5-mini | 1, 2, 4, 6, 7, 8, 9, 11, 12 |
| openai/gpt-5-nano | 1, 2, 3, 4 |
| mistral/pixtral-12b-2409 | 1, 2, 3, 4 |
| mistral/ministral-3b-latest | 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 |
| mistral/ministral-8b-latest | 10 |

---
*Auto-generated by agent_006 benchmark*