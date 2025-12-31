# agent_006: Bitcoin Bottom Arena

A multi-phase selection protocol for evaluating vision-capable LLMs at predicting structural market bottoms across multiple time horizons.

## What This Is

- **Multi-horizon bottom prediction** (15m, 1h, 24h, 7d)
- **4-phase elimination tournament** to find models with genuine predictive skill
- **Ground truth via structural pivots** using Williams Fractal and Zigzag annotations
- **Log loss scoring** for probabilistic predictions

This benchmark identifies which vision models can reliably detect structural bottoms from chart patterns—a core competency for automated trading systems.

## Why This Matters

Predicting market bottoms is hard. Most models either:
- **Call bottoms everywhere** (high recall, no precision)
- **Never call bottoms** (safe but useless)
- **Show unstable performance** (lucky streaks don't compound)

This benchmark uses a rigorous 4-phase elimination process to filter out models that exhibit degenerate behavior, leaving only those with genuine, stable predictive skill.

## The 4 Phases

### Phase 0: Sanity Filter (6 rounds)
Eliminates models that:
- Predict all 1s or all 0s (degenerate)
- Perform worse than random baseline

### Phase 1: Relative Performance (12 rounds)
Eliminates models in the **bottom quartile** of log loss performance across all horizons.

### Phase 2: Stability & Regret (24 rounds)
Eliminates models with:
- **High variance** in predictions (unstable)
- **High regret** (worst-case performance far below median)

### Phase 3: Final Ranking
Ranks surviving models by composite score:
- Average percentile rank across horizons
- Best-window performance (peak skill)
- Stability (consistency)
- Early detection bonus (time-to-pivot ratio)

Top 8 models enter the **Arena** for ongoing competition.

## Ground Truth

A prediction is **correct** (label=1) if a **structural pivot LOW** occurs within the prediction window.

Detection methods by horizon:
| Horizon | Method | Parameters |
|---------|--------|------------|
| 15m, 1h | Williams Fractal | period=5 |
| 24h, 7d | Zigzag | threshold=0.03 |

Ground truth is resolved via the Replay Lab annotations API—no raw trade data needed.

## Model Matrix

24 verified vision models from 5 providers:

**Anthropic (5)**
- claude-haiku-4-5, claude-sonnet-4-5, claude-3-5-sonnet, claude-3-5-haiku, claude-3-7-sonnet

**OpenAI (7)**
- gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini, gpt-5, gpt-5-mini, gpt-5-nano

**Google (5)**
- gemini-2.0-flash, gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-pro, gemini-3-pro-preview

**xAI (2)**
- grok-2-vision, grok-4-fast-non-reasoning

**Mistral (4)**
- pixtral-large-latest, pixtral-12b-2409, ministral-3b-latest, ministral-8b-latest

All model IDs verified against [Vercel AI Gateway documentation](https://vercel.com/docs/ai-gateway/models-and-providers).

## Usage

```bash
cd apps/agent_006

# Run the benchmark
SIMULATION_START_TIME="2025-01-01T12:00:00Z" pnpm benchmark

# Verbose mode
SIMULATION_START_TIME="2025-01-01T12:00:00Z" pnpm benchmark --verbose
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     pnpm benchmark                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │       Clock State         │
              │  (15-minute intervals)    │
              └─────────────┬─────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
        ▼                                       ▼
┌───────────────┐                     ┌───────────────┐
│  Replay Lab   │                     │  Replay Lab   │
│  Charts API   │                     │  Annotations  │
│ (2 timeframes)│                     │  (pivots)     │
└───────┬───────┘                     └───────┬───────┘
        │                                     │
        ▼                                     │
┌─────────────────────────┐                   │
│     Bottom Caller       │                   │
│  ┌───────────────────┐  │                   │
│  │ 4h/5m chart       │  │                   │
│  │ 24h/15m chart     │  │                   │
│  └───────────────────┘  │                   │
│           │             │                   │
│           ▼             │                   │
│  4 Predictions:         │                   │
│  • bottom-15m (0-1)     │                   │
│  • bottom-1h  (0-1)     │                   │
│  • bottom-24h (0-1)     │                   │
│  • bottom-7d  (0-1)     │                   │
└───────────┬─────────────┘                   │
            │                                 │
            ▼                                 ▼
┌─────────────────────┐         ┌─────────────────────┐
│    Predictions      │         │   Ground Truth      │
│  • Confidence 0-1   │         │  • Pivot exists?    │
│    per horizon      │         │  • Time to pivot    │
└─────────┬───────────┘         └─────────┬───────────┘
          │                               │
          └──────────────┬────────────────┘
                         │
                         ▼
          ┌─────────────────────────┐
          │      Log Loss Scorer    │
          │  -log(p) if bottom      │
          │  -log(1-p) otherwise    │
          └───────────┬─────────────┘
                      │
     ┌────────────────┼────────────────┐
     │                │                │
     ▼                ▼                ▼
┌──────────┐   ┌──────────┐   ┌──────────┐
│ Phase 0  │   │ Phase 1  │   │ Phase 2  │
│ Sanity   │──▶│ Relative │──▶│ Stability│
│ Filter   │   │ Perf     │   │ & Regret │
└──────────┘   └──────────┘   └──────────┘
                                   │
                                   ▼
                         ┌──────────────┐
                         │   Phase 3    │
                         │ Final Rank   │
                         │  (Top 8)     │
                         └──────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `src/benchmark.ts` | CLI benchmark entry point, phase orchestration |
| `src/matrix.ts` | Model matrix from models.json |
| `src/models.json` | 24 verified vision models |
| `src/bottom-caller.ts` | Bottom prediction agent definition |
| `src/clock-state.ts` | Simulation time (15-min intervals) |
| `src/horizon-config.ts` | Horizon durations and annotation methods |
| `src/ground-truth/bottom-checker.ts` | Pivot detection via annotations |
| `src/replay-lab/annotations.ts` | Local extrema annotation fetcher |
| `src/replay-lab/charts.ts` | Chart URL generation |
| `src/scorers/phase-0-scorer.ts` | Sanity filter (degenerate detection) |
| `src/scorers/phase-1-scorer.ts` | Relative performance ranking |
| `src/scorers/phase-2-scorer.ts` | Stability and regret metrics |
| `src/scorers/phase-3-scorer.ts` | Final composite ranking |

## Environment Variables

```bash
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
AI_GATEWAY_API_KEY=your-key
REPLAY_LAB_API_KEY=rn_...
REPLAY_LAB_BASE_URL=https://replay-lab-delta.preview.recall.network
SIMULATION_START_TIME=2025-01-01T12:00:00Z
```

Note: `SYMBOL_ID` is hardcoded to `COINBASE_SPOT_BTC_USD` (Bitcoin only).

## Test Coverage

```
353 tests passing
```

## What This Is Not

- Not a backtester (no position sizing or portfolio management)
- Not a trading system (no execution)
- Not trying to predict price direction (only structural pivots)

This is a **selection layer** that identifies which models have genuine skill at detecting structural bottoms—information that can feed into ensemble systems or strategy allocation.
