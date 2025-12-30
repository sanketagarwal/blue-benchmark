# agent_005 EV Benchmark Extension Design

## Overview

Extend the existing agent_005 fill probability benchmark to include three evaluation legs:
1. **Fill Probability** (existing) - Binary fill prediction
2. **Conditional Post-Fill Price Move** - Expected mid price change given fill
3. **Realized PnL** - Deterministic PnL calculation under fixed unwind rule

Plus a **Derived Expected Value (EV)** metric computed from predictions.

## Constraints

- Keep current benchmark structure, rounds, horizons, and models
- All new metrics computed in benchmark layer, not predicted implicitly
- EV is derived from `p_fill × e_delta_mid - fees`, not directly predicted
- Ground truth computable from existing trade and mid price data

## Leg 1: Fill Probability (No Changes)

For each timestamp t, side ∈ {bid, ask}, horizon H ∈ {1m, 5m, 15m}:
- Agent predicts `p_fill`
- Ground truth: binary fill event
- Metrics: Brier Score, Log Loss, Accuracy

Contracts: `bid-fill-1m`, `bid-fill-5m`, `bid-fill-15m`, `ask-fill-1m`, `ask-fill-5m`, `ask-fill-15m`

## Leg 2: Conditional Post-Fill Price Move (New)

### Ground Truth Computation

When a hypothetical order fills at time `t_fill`:
1. Compute `mid(t_fill)` from trades around fill time
2. Compute `mid(t_fill + H)` for each horizon H
3. `delta_mid_H = mid(t_fill + H) - mid(t_fill)`

Mid price approximated from trade data (midpoint of recent trades).

### Agent Output Extension

New prediction fields per side and horizon:
```
bid-delta-mid-1m: number   // Expected mid change if bid fills within 1m
bid-delta-mid-5m: number
bid-delta-mid-15m: number
ask-delta-mid-1m: number
ask-delta-mid-5m: number
ask-delta-mid-15m: number
```

### Scoring

- Only score delta predictions on samples where fill occurred
- Metrics:
  - **MAE** (Mean Absolute Error)
  - **MSE** (Mean Squared Error)
  - **Bias** (Mean Signed Error)
- Report per model, per side, per horizon

## Leg 3: Realized PnL (New)

### PnL Calculation

For each decision with fixed fee constant:

**Bid fills at price p:**
- Exit at `mid(t_fill + H)`
- `PnL = mid_exit - p - fees`

**Ask fills at price p:**
- Exit at `mid(t_fill + H)`
- `PnL = p - mid_exit - fees`

**No fill:**
- `PnL = 0`

### Aggregation

- Mean PnL per decision
- Total PnL over benchmark window
- PnL by side and horizon

## Derived Expected Value (EV)

### Formula

```
EV_hat = p_fill × e_delta_mid_if_filled - fees
```

For bids: positive delta_mid is favorable (price goes up after buying)
For asks: negative delta_mid is favorable (price goes down after selling)

### Aggregation

Same as PnL:
- Mean EV per decision
- Total EV
- EV by side and horizon

### Validation

- Compare aggregate EV vs realized PnL
- Report `EV - PnL` gap and its variance
- Flag models with large systematic EV overestimation

## Output Schema Extension

```typescript
interface MarketMakerOutput {
  reasoning: string;
  predictions: {
    // Fill probabilities (existing)
    'bid-fill-1m': number;
    'bid-fill-5m': number;
    'bid-fill-15m': number;
    'ask-fill-1m': number;
    'ask-fill-5m': number;
    'ask-fill-15m': number;
    // Delta mid predictions (new)
    'bid-delta-mid-1m': number;
    'bid-delta-mid-5m': number;
    'bid-delta-mid-15m': number;
    'ask-delta-mid-1m': number;
    'ask-delta-mid-5m': number;
    'ask-delta-mid-15m': number;
  };
}
```

## New Type Definitions

```typescript
type DeltaMidContractId =
  | 'bid-delta-mid-1m' | 'bid-delta-mid-5m' | 'bid-delta-mid-15m'
  | 'ask-delta-mid-1m' | 'ask-delta-mid-5m' | 'ask-delta-mid-15m';

interface DeltaMidGroundTruth {
  // Only populated when corresponding fill occurred
  'bid-delta-mid-1m'?: number;
  'bid-delta-mid-5m'?: number;
  // ...
}

interface DeltaMidScoreResult {
  contractId: DeltaMidContractId;
  predicted: number;
  actual: number;
  absoluteError: number;
  squaredError: number;
  signedError: number;  // predicted - actual (for bias)
}

interface PnLResult {
  side: 'bid' | 'ask';
  horizon: '1m' | '5m' | '15m';
  filled: boolean;
  fillPrice?: number;
  exitPrice?: number;
  pnl: number;  // 0 if no fill
}

interface EVResult {
  side: 'bid' | 'ask';
  horizon: '1m' | '5m' | '15m';
  predictedFillProb: number;
  predictedDeltaMid: number;
  ev: number;  // p_fill × delta_mid - fees
}
```

## Benchmark Table Extension

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    agent_005 Benchmark Results (3 rounds)                       │
├─────────────────────────────┬─────────┬─────────┬──────────┬────────┬──────────┤
│            Model            │  Brier  │ DeltaMAE│ Mean EV  │Mean PnL│ EV-PnL   │
├─────────────────────────────┼─────────┼─────────┼──────────┼────────┼──────────┤
│ xai/grok-4-fast-reasoning   │   0.187 │   0.0012│   0.0003 │ 0.0002 │  +0.0001 │
│ anthropic/claude-haiku-4.5  │   0.201 │   0.0015│   0.0002 │ 0.0001 │  +0.0001 │
│ openai/gpt-5-nano           │   0.195 │   0.0011│   0.0004 │ 0.0003 │  +0.0001 │
├─────────────────────────────┴─────────┴─────────┴──────────┴────────┴──────────┤
│ Winner: openai/gpt-5-nano (lowest Brier score)                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Constants

```typescript
const FIXED_FEE_BPS = 1;  // 1 basis point = 0.01%
const FIXED_FEE = 0.0001; // As decimal multiplier
```

## File Changes

### New Files
- `src/scorers/delta-mid-scorer.ts` - MAE, MSE, bias calculations
- `src/scorers/pnl-calculator.ts` - PnL calculation logic
- `src/scorers/ev-calculator.ts` - EV derivation

### Modified Files
- `src/market-maker.ts` - Extended output schema
- `src/scorers/types.ts` - New contract types
- `src/scorers/aggregate-scorer.ts` - Combined scoring
- `src/ground-truth/fill-checker.ts` - Return fill details
- `src/replay-lab/trades.ts` - Mid price computation
- `src/benchmark.ts` - Orchestrate all legs
- `src/results.ts` - Extended result types
- `src/table.ts` - Extended output table

## Success Criteria

The benchmark should make it obvious whether a model is good at:
1. **Execution modeling** (fill probability accuracy)
2. **Adverse selection modeling** (delta-mid prediction accuracy)
3. **Both or neither** (EV vs PnL gap analysis)
